import type { TensionRecord } from "@/lib/db/records";

// Rendering is now just the one thing the model must NOT do: lay out a tension as
// a two-column table, both sides verbatim from the record (pluralism — the model
// never writes these cells, never picks a winner). All prose is composed by the
// agent (lib/agent); there is no deterministic briefing/probe renderer anymore.

export type TensionTable = {
  dimension: string | null;
  labelA: string;
  propA: string;
  whenA: string;
  labelB: string;
  propB: string;
  whenB: string;
};

export function renderTension(t: TensionRecord): TensionTable {
  return {
    dimension: t.dimension,
    labelA: `${t.claimA.paradigm}${t.claimA.thinker ? ` (${t.claimA.thinker})` : ""}`,
    propA: t.claimA.proposition,
    whenA: t.conditionsA,
    labelB: `${t.claimB.paradigm}${t.claimB.thinker ? ` (${t.claimB.thinker})` : ""}`,
    propB: t.claimB.proposition,
    whenB: t.conditionsB,
  };
}
