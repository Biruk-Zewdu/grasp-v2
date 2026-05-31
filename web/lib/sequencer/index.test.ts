import { describe, it, expect } from "vitest";
import {
  nextStep,
  nextPrereq,
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

describe("nextStep — target-first (begin at the difference, not a syllabus)", () => {
  it("opens at the TARGET's briefing, not a prerequisite, even with prereqs unmet", () => {
    // The learner asked about T; start there — prerequisites are not front-loaded.
    expect(nextStep(graph(), state())).toEqual({ kind: "entity", entityId: 1 });
  });

  it("probes the target after its briefing is seen but not grasped", () => {
    expect(nextStep(graph(), state({ seen: [1] }))).toEqual({ kind: "probe", probeId: 101 });
  });

  it("surfaces the target's tension once the target is done", () => {
    expect(nextStep(graph(), state({ seen: [1], grasped: [1] }))).toEqual({
      kind: "tension",
      tensionId: 10,
    });
  });

  it("satisfices on the TARGET — prerequisites need not be grasped", () => {
    // Target seen+grasped, its tension surfaced; prereqs 2,3 untouched -> stop.
    expect(
      nextStep(graph(), state({ seen: [1], grasped: [1], seenTensions: [10] })),
    ).toEqual({ kind: "stop" });
  });

  it("a missed target probe settles it (probed counts as done; no re-probe loop)", () => {
    // seen + probed but not grasped, tension still open -> the catch, then stop.
    expect(nextStep(graph(), state({ seen: [1], probed: [1] }))).toEqual({
      kind: "tension",
      tensionId: 10,
    });
    expect(
      nextStep(graph(), state({ seen: [1], probed: [1], seenTensions: [10] })),
    ).toEqual({ kind: "stop" });
  });

  it("never returns a model decision — output is a pure record ref", () => {
    const out = nextStep(graph(), state());
    expect(["entity", "probe", "tension", "stop"]).toContain(out.kind);
  });
});

describe("nextPrereq — scaffolding surfaced on a breakdown (not front-loaded)", () => {
  it("returns the deepest (most foundational) unmet prerequisite of a concept", () => {
    expect(nextPrereq(graph(), state(), 1)).toBe(3);
  });

  it("advances to the next prerequisite once the deepest is settled", () => {
    expect(nextPrereq(graph(), state({ grasped: [3] }), 1)).toBe(2);
  });

  it("returns null when the concept's prerequisites are all settled", () => {
    expect(nextPrereq(graph(), state({ grasped: [2, 3] }), 1)).toBeNull();
  });

  it("returns null for a concept with no prerequisites", () => {
    expect(nextPrereq(graph(), state(), 3)).toBeNull();
  });
});
