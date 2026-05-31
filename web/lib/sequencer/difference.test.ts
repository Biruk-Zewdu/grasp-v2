import { describe, it, expect } from "vitest";
import { difference, satisficed, type SeqGraph, type SeqState, type Abstraction } from "./index";

// Same shape as index.test.ts: target T(1, paradigmatic) <- B(2, mechanism) <-
// C(3, foundational); T carries tension t10.
function graph(): SeqGraph {
  const e = (
    id: number,
    name: string,
    abstraction: Abstraction,
  ): [number, { id: number; name: string; abstraction: Abstraction }] => [
    id,
    { id, name, abstraction },
  ];
  return {
    entities: new Map([e(1, "T", "paradigmatic"), e(2, "B", "mechanism"), e(3, "C", "foundational")]),
    prereqs: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
    tensions: [{ id: 10, conceptIds: [1] }],
    probes: [
      { id: 100, conceptIds: [3], tensionId: null },
      { id: 101, conceptIds: [1], tensionId: null },
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

describe("difference — the learner's gap over the relevant set", () => {
  it("reports the target's unsettled prerequisites (ungrasped, unprobed)", () => {
    const d = difference(graph(), state());
    expect(new Set(d.unsettledPrereqs)).toEqual(new Set([2, 3]));
  });

  it("reports the target as unseen/undemonstrated and its tension as open at the start", () => {
    const d = difference(graph(), state());
    expect(d.targetSeen).toBe(false);
    expect(d.targetDone).toBe(false);
    expect(d.openTensionId).toBe(10);
  });

  it("reports no gap on the spine once target is grasped and its tension surfaced", () => {
    const d = difference(graph(), state({ grasped: [1, 2, 3], seen: [1], seenTensions: [10] }));
    expect(d.unsettledPrereqs).toEqual([]);
    expect(d.targetSeen).toBe(true);
    expect(d.targetDone).toBe(true);
    expect(d.openTensionId).toBeNull();
  });
});

describe("satisficed — good-enough grip on the TARGET (the stop condition)", () => {
  it("is false until the target is seen, done, and its tension surfaced", () => {
    expect(satisficed(graph(), state())).toBe(false); // target unseen
    expect(satisficed(graph(), state({ seen: [1], grasped: [1] }))).toBe(false); // tension still open
  });

  it("is true on the target alone — prerequisites need NOT be grasped", () => {
    // 2 and 3 untouched; a good-enough grip on the target is enough to stop.
    expect(satisficed(graph(), state({ seen: [1], grasped: [1], seenTensions: [10] }))).toBe(true);
  });
});
