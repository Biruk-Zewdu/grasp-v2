import "server-only";
import { structuredCall } from "@/lib/server/model";
import type { EntityRecord, TensionRecord, ProbeRecord } from "@/lib/db/records";

// A Step is composed at serve time and never stored (store atoms, compose steps).
// It is a plain serializable object so it can cross the server->client boundary.
export type PullPoint = { tier: number; label: string };
export type TensionTable = {
  dimension: string | null;
  labelA: string;
  propA: string;
  whenA: string;
  labelB: string;
  propB: string;
  whenB: string;
};
export type Step =
  | { kind: "briefing"; entityId: number; title: string; point: string; pullPoints: PullPoint[] }
  | { kind: "tension"; tensionId: number; title: string; point: string; table: TensionTable; pullPoints: PullPoint[] }
  | { kind: "probe"; probeId: number; title: string; prompt: string }
  | { kind: "stop"; title: string; point: string };

// Model usage from a render that phrased through the live provider (for the
// gesture log / cost observability). Absent in template mode.
export type ModelUsage = { model?: string; tokens?: number };

/** Briefing. The model (if live) only *phrases* the definition — it cannot add
 *  facts (strict tool-use + explicit instruction). Template falls back to the
 *  record's own definition verbatim, so this works with no key at zero cost. */
export async function renderEntity(
  e: EntityRecord,
  sessionId: string,
  opts: { hasTension: boolean },
): Promise<{ step: Step; usage?: ModelUsage }> {
  let point = e.definition ?? e.name;

  const phrased = await structuredCall<{ point: string }>({
    sessionId,
    role: "render",
    system:
      "You phrase one course concept for a learner in 1-2 plain sentences. " +
      "Use ONLY the supplied definition. Do NOT add facts, examples, names, or " +
      "claims that are not in it.",
    user: `Concept: ${e.name}\nType: ${e.type}\nDefinition: ${e.definition ?? ""}`,
    schemaName: "briefing",
    schema: {
      type: "object",
      properties: { point: { type: "string" } },
      required: ["point"],
      additionalProperties: false,
    },
    maxTokens: 300,
  });
  if (phrased.ok && phrased.data.point.trim()) point = phrased.data.point.trim();
  const usage = phrased.ok ? { model: phrased.model, tokens: phrased.tokens } : undefined;

  const pullPoints: PullPoint[] = [];
  if (opts.hasTension) pullPoints.push({ tier: 1, label: "When does each view apply?" });
  pullPoints.push({ tier: 3, label: "Show the source" });

  return {
    step: { kind: "briefing", entityId: e.id, title: e.name, point, pullPoints },
    usage,
  };
}

/** Tension -> two-column table, ALWAYS both sides (g11). Cells are the record's
 *  conditions verbatim; the model never decides what they say. No model call. */
export function renderTension(t: TensionRecord): Step {
  return {
    kind: "tension",
    tensionId: t.id,
    title: "Two views — and when each holds",
    point: t.dimension ?? "These two positions hold under different conditions.",
    table: {
      dimension: t.dimension,
      labelA: `${t.claimA.paradigm}${t.claimA.thinker ? ` (${t.claimA.thinker})` : ""}`,
      propA: t.claimA.proposition,
      whenA: t.conditionsA,
      labelB: `${t.claimB.paradigm}${t.claimB.thinker ? ` (${t.claimB.thinker})` : ""}`,
      propB: t.claimB.proposition,
      whenB: t.conditionsB,
    },
    pullPoints: [{ tier: 3, label: "Show the source" }],
  };
}

/** Probe -> the Socratic question. The surface renders an input; grading is
 *  coverage-only in lib/probe (never a score). */
export function renderProbe(p: ProbeRecord): Step {
  return {
    kind: "probe",
    probeId: p.id,
    title: "A quick check",
    prompt: p.prompt,
  };
}

export function renderStop(): Step {
  return {
    kind: "stop",
    title: "You've got a good grasp of this",
    point:
      "You've seen the idea, its prerequisites, and the tension that shapes it. " +
      "Ask a follow-up to keep going, or set a new goal.",
  };
}
