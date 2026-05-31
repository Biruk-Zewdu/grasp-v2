import { describe, it, expect } from "vitest";
import {
  nextStep,
  type SeqGraph,
  type SeqState,
  type Abstraction,
} from "./index";

// fixture: target T (paradigmatic) depends on B (mechanism) depends on C
// (foundational). T also has a tension t1 and T has a concept-probe p_t; C has a
// concept-probe p_c.
function graph(): SeqGraph {
  const e = (id: number, name: string, abstraction: Abstraction): [number, { id: number; name: string; abstraction: Abstraction }] =>
    [id, { id, name, abstraction }];
  return {
    entities: new Map([e(1, "T", "paradigmatic"), e(2, "B", "mechanism"), e(3, "C", "foundational")]),
    prereqs: [
      { from: 1, to: 2 }, // T depends on B
      { from: 2, to: 3 }, // B depends on C
    ],
    tensions: [{ id: 10, conceptIds: [1] }],
    probes: [
      { id: 100, conceptIds: [3], tensionId: null }, // probe for C
      { id: 101, conceptIds: [1], tensionId: null }, // probe for T
    ],
  };
}

const state = (over: Partial<SeqState> = {}): SeqState => ({
  target: 1,
  seen: [],
  grasped: [],
  probed: [],
  seenTensions: [],
  ...over,
});

describe("nextStep", () => {
  it("starts at the deepest (most foundational) ungrasped prerequisite", () => {
    expect(nextStep(graph(), state())).toEqual({ kind: "entity", entityId: 3 });
  });

  it("advances to the next prerequisite once the deepest is grasped", () => {
    expect(nextStep(graph(), state({ grasped: [3] }))).toEqual({
      kind: "entity",
      entityId: 2,
    });
  });

  it("probes a prerequisite that was seen but not yet grasped", () => {
    // C shown but not demonstrated -> emit C's probe to convert seen->grasped
    expect(nextStep(graph(), state({ seen: [3] }))).toEqual({
      kind: "probe",
      probeId: 100,
    });
  });

  it("shows the target's briefing once all prerequisites are grasped", () => {
    expect(nextStep(graph(), state({ grasped: [2, 3] }))).toEqual({
      kind: "entity",
      entityId: 1,
    });
  });

  it("probes the target after its briefing is seen but not grasped", () => {
    expect(
      nextStep(graph(), state({ grasped: [2, 3], seen: [1] })),
    ).toEqual({ kind: "probe", probeId: 101 });
  });

  it("surfaces the target's tension once the target is grasped", () => {
    expect(
      nextStep(graph(), state({ grasped: [1, 2, 3], seen: [1] })),
    ).toEqual({ kind: "tension", tensionId: 10 });
  });

  it("satisfices (stops) when target grasped and its tension surfaced", () => {
    expect(
      nextStep(
        graph(),
        state({ grasped: [1, 2, 3], seen: [1], seenTensions: [10] }),
      ),
    ).toEqual({ kind: "stop" });
  });

  it("never returns a model decision — output is a pure record ref", () => {
    const out = nextStep(graph(), state());
    expect(["entity", "probe", "tension", "stop"]).toContain(out.kind);
  });

  it("does not re-probe a concept already probed (a miss opens depth, no loop)", () => {
    // C seen + probed but NOT grasped -> treated as settled, advance to B
    expect(
      nextStep(graph(), state({ seen: [3], probed: [3] })),
    ).toEqual({ kind: "entity", entityId: 2 });
  });

  it("a target with no prerequisites goes straight to its own briefing", () => {
    const g = graph();
    g.prereqs = [];
    expect(nextStep(g, state())).toEqual({ kind: "entity", entityId: 1 });
  });
});
