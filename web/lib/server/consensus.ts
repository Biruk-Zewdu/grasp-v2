import "server-only";
import { getArtifactContext } from "@/lib/db/records";
import { checkAndConsume } from "./budget";
import { liveEnabled } from "./env";
import { rawStructuredCall } from "./model";
import { CONSTITUTION, ANSWER_SCHEMA, runTurn } from "@/lib/agent";
import type { AgentAnswer } from "@/lib/agent";
import type { UserCriteria } from "@/lib/guide/types";

// Three debaters: same artifact + question, different style tilt added to the
// user prompt (system is identical so the cached artifact prefix is reused).
const DEBATERS = [
  { tilt: "Prioritize plain language and concrete examples. Avoid jargon." },
  { tilt: "Prioritize technical precision and nuance. Acknowledge competing interpretations." },
  { tilt: "Be maximally concise. Every sentence must earn its place." },
] as const;

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    winnerId: { type: "integer" },
    rationale: { type: "string" },
  },
  required: ["winnerId", "rationale"],
  additionalProperties: false,
} as const;

function buildJudgePrompt(candidates: string[], criteria: UserCriteria): string {
  const weights = [
    `simplicity ${criteria.simplicity}/5`,
    `depth ${criteria.depth}/5`,
    `conciseness ${criteria.conciseness}/5`,
  ].join(", ");
  const listed = candidates
    .map((r, i) => `=== Candidate ${i} ===\n${r}`)
    .join("\n\n");
  return (
    `You are a neutral judge. Below are ${candidates.length} candidate answers to the same learner question.\n\n` +
    `Learner's priorities (higher = more important): ${weights}.\n\n` +
    `${listed}\n\n` +
    `Select the candidate that best satisfies the learner's priorities. Return the 0-based index as ` +
    `\`winnerId\` and one sentence in \`rationale\` explaining why it wins.`
  );
}

export type ConsensusAnswer = AgentAnswer & {
  consensusMeta: { winnerId: number; rationale: string };
};

/** Run the debate: fan out to N debaters in parallel, judge picks the winner.
 *  One budget slot is consumed for the whole round. Falls back to single-model
 *  runTurn when not in live mode or when the budget is exhausted. */
export async function runConsensus(
  question: string,
  history: string,
  versionId: number,
  sessionId: string,
  criteria: UserCriteria,
): Promise<ConsensusAnswer | AgentAnswer> {
  if (!liveEnabled()) return runTurn(question, history, versionId, sessionId);

  const budget = await checkAndConsume(sessionId);
  if (!budget.ok) return runTurn(question, history, versionId, sessionId);

  const artifact = await getArtifactContext(versionId);
  const system = `${CONSTITUTION}\n\n=== ARTIFACT ===\n${artifact}`;
  const userBase =
    (history ? `Conversation so far:\n${history}\n\n` : "") +
    `Learner's question: ${question}`;

  // Parallel debater calls — system prompt is identical so the cached artifact
  // prefix is reused across all three (Anthropic ephemeral cache / OpenAI auto).
  const debaterResults = await Promise.all(
    DEBATERS.map((d) =>
      rawStructuredCall<AgentAnswer>({
        role: "reason",
        cacheSystem: true,
        system,
        user: `${userBase}\n\nSTYLE NOTE: ${d.tilt}`,
        schemaName: "answer",
        schema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 800,
      }),
    ),
  );

  const candidates = debaterResults
    .map((r) => (r.ok ? r.data : null))
    .filter((c): c is AgentAnswer => c !== null && !!c.reply?.trim());

  if (candidates.length === 0) return runTurn(question, history, versionId, sessionId);
  if (candidates.length === 1) return candidates[0];

  // Judge picks the winner based on user criteria.
  const judgeResult = await rawStructuredCall<{ winnerId: number; rationale: string }>({
    role: "classify",
    system: "You are a neutral judge evaluating answer candidates.",
    user: buildJudgePrompt(candidates.map((c) => c.reply), criteria),
    schemaName: "verdict",
    schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 200,
  });

  if (!judgeResult.ok) {
    return { ...candidates[0], consensusMeta: { winnerId: 0, rationale: "judge unavailable" } };
  }

  const winnerId = Math.max(0, Math.min(judgeResult.data.winnerId, candidates.length - 1));
  return {
    ...candidates[winnerId],
    consensusMeta: { winnerId, rationale: judgeResult.data.rationale },
  };
}
