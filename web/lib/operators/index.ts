import "server-only";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext, getSubtopic, getConceptBriefs } from "@/lib/db/records";
import type { OperatorKey, OperatorResult } from "./catalog";

// Course operators, made APPLICABLE. The course's whole thesis is that intelligence
// is reasoning operators over a knowledge representation — so here the learner runs
// those operators themselves, on a real section, grounded in the artifact. The
// client-safe catalog (labels/keys) lives in ./catalog; this is the server logic.
//
// These are the reasoning moves the course teaches, not generic study tricks:
//   decompose  — Simon's near-decomposability: break the idea into its sub-parts
//   contrast   — surface the tension / opposed view (pluralism)
//   analogize  — map it to something the learner knows (representation transfer)
//   apply      — run the idea on a concrete new situation (means-ends)
//   steelman   — state the strongest version of the rival position (due process)

export type { OperatorKey, Operator, OperatorResult } from "./catalog";
export { OPERATORS, operatorsForSection } from "./catalog";

const PROMPTS: Record<OperatorKey, string> = {
  decompose:
    "DECOMPOSE this section's main idea into its meaningful sub-parts (Simon's near-decomposability) — " +
    "a short ordered breakdown of the components it is built from, each one line, bottom-up.",
  contrast:
    "Surface the TENSION in this section: the opposed positions on its central question and the " +
    "conditions under which each holds. Two short sides, faithful to the document; do not pick a winner.",
  analogize:
    "Give ONE crisp ANALOGY that maps this section's idea onto something a learner likely already " +
    "knows, then name where the analogy holds and where it breaks (so it teaches, not misleads).",
  apply:
    "APPLY this section's idea to ONE concrete new situation not mentioned in the document — walk " +
    "through what the idea predicts or how it would be used there, grounded in the section's claims.",
  steelman:
    "STEELMAN the rival of this section's position: state the strongest, fairest version of the " +
    "opposing view, grounded in the artifact — the case a smart opponent would actually make.",
};

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, body: { type: "string" } },
  required: ["title", "body"],
  additionalProperties: false,
} as const;

/** Run an operator on a subtopic, grounded in the artifact + that section's concepts. */
export async function applyOperator(
  subtopicId: number,
  op: OperatorKey,
  sessionId: string,
): Promise<OperatorResult | null> {
  const sub = await getSubtopic(subtopicId);
  if (!sub) return null;
  const artifact = await getArtifactContext(sub.corpusVersion);
  const focus = await getConceptBriefs(sub.conceptIds);
  const focusList = focus.map((c) => `- ${c.name}`).join("\n");

  const res = await structuredCall<OperatorResult>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system:
      "You help a learner APPLY a reasoning operator to one section of a document, grounded ENTIRELY " +
      "in the curated artifact below. Use the artifact's own concepts and claims; never invent facts. " +
      "Keep it short and concrete — a few sentences or a short list. title = a 2-4 word label for the " +
      `result.\n\n=== ARTIFACT ===\n${artifact}`,
    user:
      `SECTION: "${sub.title}"` +
      (sub.summary ? `\n(${sub.summary})` : "") +
      (focusList ? `\nCentred on:\n${focusList}` : "") +
      `\n\nOPERATOR: ${PROMPTS[op]}`,
    schemaName: "operator",
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 500,
  });
  if (!res.ok) return null;
  return { title: res.data.title.trim(), body: res.data.body.trim() };
}
