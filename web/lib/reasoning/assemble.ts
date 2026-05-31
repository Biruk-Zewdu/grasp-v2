// Pure assembly of the TMS "why" for one claim (no DB / server-only imports, so
// it unit-tests in isolation). A claim's justification carries a rationale and
// antecedent belief-node ids; those antecedents are the PREMISES it rests on
// (SERVE_DESIGN §9, D2). We resolve each antecedent belief node back to its
// claim's proposition so the reasoner can explain the dependency, not a number.

export type BeliefNodeRow = { id: number; claimId: number };
export type JustificationRow = {
  beliefNode: number;
  antecedentBeliefIds: number[];
  rationale: string | null;
};
export type SideReasoning = { rationale: string | null; premises: string[] };

export function assembleSide(
  claimId: number,
  beliefNodes: BeliefNodeRow[],
  justifications: JustificationRow[],
  claimProps: Map<number, string>,
): SideReasoning {
  const nodeByClaim = new Map(beliefNodes.map((b) => [b.claimId, b.id]));
  const claimByNode = new Map(beliefNodes.map((b) => [b.id, b.claimId]));

  const nodeId = nodeByClaim.get(claimId);
  if (nodeId === undefined) return { rationale: null, premises: [] };

  const j = justifications.find((x) => x.beliefNode === nodeId);
  if (!j) return { rationale: null, premises: [] };

  const premises: string[] = [];
  for (const antNode of j.antecedentBeliefIds) {
    const antClaim = claimByNode.get(antNode);
    if (antClaim === undefined) continue;
    const prop = claimProps.get(antClaim);
    if (prop) premises.push(prop);
  }
  return { rationale: j.rationale, premises };
}
