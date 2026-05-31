import "server-only";
import { structuredCall } from "@/lib/server/model";
import type { EntityRecord, TensionRecord, ProbeRecord, ConceptContext } from "@/lib/db/records";

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
  | { kind: "briefing"; entityId: number; title: string; point: string; pullPoints: PullPoint[]; catch?: TensionTable }
  | { kind: "tension"; tensionId: number; title: string; point: string; table: TensionTable; pullPoints: PullPoint[] }
  | { kind: "probe"; probeId: number; title: string; prompt: string }
  | { kind: "stop"; title: string; point: string };

// Model usage from a render that phrased through the live provider (for the
// gesture log / cost observability). Absent in template mode.
export type ModelUsage = { model?: string; tokens?: number };

/** Briefing — the grounded reasoner (SERVE_DESIGN §9). The model REASONS over the
 *  retrieved sub-graph (definition + relations + claims): it explains what the
 *  concept is and why it matters, may connect the supplied records and give an
 *  illuminating example, but every factual statement must be supported by those
 *  records — no facts/names/numbers beyond them. Template mode falls back to the
 *  record's definition verbatim, so it still works with no key at zero cost. */
export async function renderEntity(
  e: EntityRecord,
  sessionId: string,
  opts: { context?: ConceptContext; catch?: TensionTable },
): Promise<{ step: Step; usage?: ModelUsage }> {
  let point = e.definition ?? e.name;

  const ctx = opts.context;
  const relLines = (ctx?.relations ?? [])
    .map((r) => `- ${r.relType.replace(/_/g, " ")}: ${r.name}`)
    .join("\n");
  const claimLines = (ctx?.claims ?? [])
    .map(
      (c) =>
        `- "${c.proposition}" — ${c.thinker ?? "?"}, ${c.paradigm}${
          c.conditions ? `; holds when ${c.conditions}` : ""
        }`,
    )
    .join("\n");

  const reasoned = await structuredCall<{ point: string }>({
    sessionId,
    role: "reason",
    system:
      "You are a careful study guide helping a learner understand ONE AI concept " +
      "well enough to use it. Reasoning ONLY over the supplied records (the " +
      "definition, the concept's relations, and the claims made about it), explain " +
      "what it is and why it matters. You MAY connect the supplied relations and " +
      "claims, draw out the 'why', and give one short illuminating example — but " +
      "every factual statement must be supported by the supplied records. Do NOT " +
      "introduce facts, names, numbers, or claims that are not in them; if the " +
      "records are thin, say less rather than invent. Write a tight, briefing-sized " +
      "answer (3-5 plain, concrete sentences). No headings, no lists.",
    user:
      `Concept: ${e.name} (${e.type})\n` +
      `Definition: ${e.definition ?? "(none on file)"}\n` +
      (relLines ? `\nRelations:\n${relLines}\n` : "") +
      (claimLines ? `\nClaims about it:\n${claimLines}\n` : ""),
    schemaName: "briefing",
    schema: {
      type: "object",
      properties: { point: { type: "string" } },
      required: ["point"],
      additionalProperties: false,
    },
    maxTokens: 500,
  });
  if (reasoned.ok && reasoned.data.point.trim()) point = reasoned.data.point.trim();
  const usage = reasoned.ok ? { model: reasoned.model, tokens: reasoned.tokens } : undefined;

  // Depth-on-demand: source is always pullable. The "catch" (the live tension) is
  // NOT a pull — when one is relevant it ships INLINE in the step (SERVE_DESIGN §6,
  // §9); opts.catch carries it. The D2 "why" pull is added in a later stage.
  const pullPoints: PullPoint[] = [{ tier: 3, label: "Show the source" }];

  return {
    step: { kind: "briefing", entityId: e.id, title: e.name, point, pullPoints, catch: opts.catch },
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
