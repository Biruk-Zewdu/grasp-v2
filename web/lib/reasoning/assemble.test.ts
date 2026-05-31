import { describe, it, expect } from "vitest";
import { assembleSide } from "./assemble";

// Belief layer fixture (mirrors db/belief.py: a belief_node per claim, a
// justification per node whose antecedents are the premises it rests on).
const beliefNodes = [
  { id: 10, claimId: 1 }, // reward hypothesis
  { id: 11, claimId: 2 }, // management hypothesis
  { id: 12, claimId: 3 }, // premise: definition of reward
  { id: 13, claimId: 4 }, // premise: definition of credit assignment
];
const justifications = [
  { beliefNode: 10, antecedentBeliefIds: [12, 13], rationale: "definitional; rests on its concepts" },
  { beliefNode: 11, antecedentBeliefIds: [], rationale: "definitional claim" },
];
const claimProps = new Map<number, string>([
  [1, "all goals = maximize scalar reward"],
  [2, "goals = manage a society of agents"],
  [3, "reward is a scalar feedback signal"],
  [4, "credit assignment distributes outcome over actions"],
]);

describe("assembleSide — TMS why for one claim", () => {
  it("resolves antecedent belief ids to their premise propositions", () => {
    const side = assembleSide(1, beliefNodes, justifications, claimProps);
    expect(side.rationale).toBe("definitional; rests on its concepts");
    expect(side.premises).toEqual([
      "reward is a scalar feedback signal",
      "credit assignment distributes outcome over actions",
    ]);
  });

  it("handles a claim with a justification but no premises", () => {
    const side = assembleSide(2, beliefNodes, justifications, claimProps);
    expect(side.rationale).toBe("definitional claim");
    expect(side.premises).toEqual([]);
  });

  it("handles a claim with no belief node (no justification on file)", () => {
    const side = assembleSide(99, beliefNodes, justifications, claimProps);
    expect(side.rationale).toBeNull();
    expect(side.premises).toEqual([]);
  });

  it("skips antecedent ids that don't resolve to a known claim", () => {
    const side = assembleSide(
      1,
      beliefNodes,
      [{ beliefNode: 10, antecedentBeliefIds: [12, 777], rationale: "x" }],
      claimProps,
    );
    expect(side.premises).toEqual(["reward is a scalar feedback signal"]);
  });
});
