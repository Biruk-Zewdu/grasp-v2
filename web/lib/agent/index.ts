import "server-only";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext, getEntitiesForVersion } from "@/lib/db/records";
import { rankByOverlap } from "./retrieve";

// The agentic Guide. GPT is the reasoner: it FRAMES the learner's question and
// answers it, grounded in the whole frozen artifact (small enough to sit in a
// cached system prompt). The course values are its constitution. No deterministic
// sequencer. (SERVE_DESIGN — agentic rebuild.)

export type AgentAnswer = {
  framing: string; // restates the crux of the user's question
  prose: string; // the grounded answer
  tensionId: number | null; // a real tension to render verbatim, if one applies
  sourceConceptIds: number[]; // concepts grounded on (for the provenance pull)
  outOfScope: boolean; // the artifact doesn't cover this — say so, don't fabricate
};

const CONSTITUTION =
  "You are Grasp — a guide that helps a learner understand AI ideas, grounded in a curated, " +
  "course-built knowledge artifact (given below). Follow these rules without exception:\n" +
  "1. FIRST FRAME the learner's actual question — what are they really asking? — then ANSWER it " +
  "directly and concretely. Do not just recite a definition.\n" +
  "2. GROUND every factual claim in the artifact's concepts, tensions, and claims. If the " +
  "artifact does not cover the question, set outOfScope=true and say so — never invent facts, " +
  "names, or numbers from outside it.\n" +
  "3. When the answer is genuinely contested, set tensionId to ONE relevant tension id from the " +
  "artifact and let the system render both sides — never resolve it, never pick a winner, never " +
  "write the two sides yourself in prose.\n" +
  "4. Be concise (a short briefing, not an essay). Use the course's framing: the " +
  "Simon/Minsky/McCarthy symbolic view is the lens; the rival deep-learning view is content " +
  "inside a tension, never the verdict.\n" +
  "5. Set sourceConceptIds to the concept ids you grounded the answer on.\n";

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    framing: { type: "string" },
    prose: { type: "string" },
    tensionId: { type: ["integer", "null"] },
    sourceConceptIds: { type: "array", items: { type: "integer" } },
    outOfScope: { type: "boolean" },
  },
  required: ["framing", "prose", "tensionId", "sourceConceptIds", "outOfScope"],
  additionalProperties: false,
} as const;

/** Run one turn: frame the question and answer it, grounded in the whole artifact.
 *  `history` is the prior conversation (plain text) so follow-ups have context. */
export async function runTurn(
  question: string,
  history: string,
  versionId: number,
  sessionId: string,
): Promise<AgentAnswer> {
  const artifact = await getArtifactContext(versionId);

  const res = await structuredCall<AgentAnswer>({
    sessionId,
    role: "reason",
    cacheSystem: true, // the big artifact prompt is cached across turns
    system: `${CONSTITUTION}\n\n=== ARTIFACT ===\n${artifact}`,
    user:
      (history ? `Conversation so far:\n${history}\n\n` : "") +
      `Learner's question: ${question}`,
    schemaName: "answer",
    schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 800,
  });

  if (res.ok) {
    const a = res.data;
    return {
      framing: a.framing?.trim() || question,
      prose: a.prose?.trim() || "",
      tensionId: a.tensionId,
      sourceConceptIds: a.sourceConceptIds ?? [],
      outOfScope: a.outOfScope,
    };
  }

  // Template / no-key fallback: deterministic — the best-matching concept's own
  // definition, so the Guide still works at zero cost (it just can't reason).
  const ents = await getEntitiesForVersion(versionId);
  const items = ents.map((e) => ({ id: e.id, text: `${e.name} — ${e.definition ?? ""}` }));
  const top = rankByOverlap(question, items, 1)[0];
  const e = top != null ? ents.find((x) => x.id === top) : undefined;
  return {
    framing: question,
    prose: e?.definition ?? "",
    tensionId: null,
    sourceConceptIds: e ? [e.id] : [],
    outOfScope: !e,
  };
}
