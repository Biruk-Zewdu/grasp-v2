import "server-only";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext, getEntitiesForVersion } from "@/lib/db/records";
import type { Branch } from "@/lib/guide/types";
import { rankByOverlap } from "./retrieve";

// The agentic Guide. GPT is the reasoner: it answers the learner's actual question,
// grounded in the whole frozen artifact (small enough to sit in a cached system
// prompt). The course values are its constitution. No deterministic sequencer.
//
// The response is ONE free-form `reply` plus zero or more grounded attachments
// (SERVE_DESIGN §3a). We deliberately do NOT prescribe a shape or enumerate "moves"
// — clarify / orient / answer all emerge from which attachments are present, so a
// reflex framing+tension no longer makes every reply look the same.

export type AgentAnswer = {
  reply: string; // free-form: an answer, a question, or an orientation — whatever fits
  headline: string | null; // optional short title for the heading / outline
  tensionId: number | null; // ONE tension to render verbatim — only when central & contested
  branches: Branch[]; // ask-back / forward / offer-basics option-chips
  sourceConceptIds: number[]; // concepts grounded on (for the provenance pull)
  keyTermIds: number[]; // concept ids named in the reply, for inline glossing
  outOfScope: boolean; // the artifact doesn't cover this — say so, don't fabricate
};

// A foundations ladder for "start from the basics" (SERVE_DESIGN §7a-a).
export type BasicsPath = {
  headline: string;
  reply: string;
  basics: { conceptId: number; why: string }[];
};

export const CONSTITUTION =
  "You are Grasp — a guide that helps a learner understand AI ideas, grounded in a curated, " +
  "course-built knowledge artifact (given below). Follow these rules without exception:\n" +
  "1. ANSWER THE QUESTION, NOT A RITUAL. A crisp question gets a DIRECT answer — no 'so you're " +
  "asking…' preamble; reframe only when it genuinely clarifies. For a VAGUE goal or ambiguous " +
  "input, do not guess: orient briefly and offer `branches` (real next questions) instead. Your " +
  "`reply` is one free-form passage; let its shape follow the input.\n" +
  "2. GROUND OR ABSTAIN. Every factual claim must rest on the artifact's concepts, claims, and " +
  "tensions. If the artifact does not cover it, set outOfScope=true and say so — never invent " +
  "facts, names, or numbers. When orienting a goal the corpus only partly covers, you may add at " +
  "most ONE bridging sentence from general knowledge, clearly marked as a bridge and honest that " +
  "this is a foundations corpus — but only TEACH what is grounded.\n" +
  "3. PRESERVE TENSIONS, DON'T REACH FOR THEM. Set tensionId to ONE relevant tension id ONLY when " +
  "the answer is genuinely contested AND that contest is central — never by reflex. The system " +
  "renders both sides verbatim; never resolve it, pick a winner, or write the two sides yourself.\n" +
  "4. BRANCHES LEAD HOME. Each branch is {label, ask} where `ask` is a real next question that " +
  "lands on teachable corpus territory. Use them three ways: ask back on a vague goal; end an " +
  "answer with 1-2 FORWARD branches (momentum, not interrogation); or OFFER 'build up from the " +
  "basics?' when the learner reaches past foundations they lack. Always an offer, never forced. " +
  "Return [] when none help.\n" +
  "5. THE COURSE LENS. The Simon/Minsky/McCarthy symbolic view is the lens; the rival " +
  "deep-learning view is content inside a tension, never the verdict. Be concise — a briefing, " +
  "not an essay.\n" +
  "6. CITE. Set sourceConceptIds to the concept ids you grounded on, and keyTermIds to the ids of " +
  "artifact concepts you NAME in the reply that a learner might want defined inline (use the " +
  "concept's exact name in the reply so it can be glossed). Set headline to a short title, or " +
  "null when the reply needs no heading.\n";

const BRANCH_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { label: { type: "string" }, ask: { type: "string" } },
    required: ["label", "ask"],
    additionalProperties: false,
  },
} as const;

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    headline: { type: ["string", "null"] },
    tensionId: { type: ["integer", "null"] },
    branches: BRANCH_SCHEMA,
    sourceConceptIds: { type: "array", items: { type: "integer" } },
    keyTermIds: { type: "array", items: { type: "integer" } },
    outOfScope: { type: "boolean" },
  },
  required: [
    "reply",
    "headline",
    "tensionId",
    "branches",
    "sourceConceptIds",
    "keyTermIds",
    "outOfScope",
  ],
  additionalProperties: false,
} as const;

const BASICS_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    reply: { type: "string" },
    basics: {
      type: "array",
      items: {
        type: "object",
        properties: { conceptId: { type: "integer" }, why: { type: "string" } },
        required: ["conceptId", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "reply", "basics"],
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
      reply: a.reply?.trim() || "",
      headline: a.headline?.trim() || null,
      tensionId: a.tensionId,
      branches: (a.branches ?? []).filter((b) => b.label?.trim() && b.ask?.trim()),
      sourceConceptIds: a.sourceConceptIds ?? [],
      keyTermIds: a.keyTermIds ?? [],
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
    reply: e?.definition ?? "",
    headline: e?.name ?? null,
    tensionId: null,
    branches: [],
    sourceConceptIds: e ? [e.id] : [],
    keyTermIds: e ? [e.id] : [],
    outOfScope: !e,
  };
}

/** "Start from the basics": an ordered foundations ladder of real artifact concepts
 *  that build up to `topic`, bottom-up (SERVE_DESIGN §7a-a). Learner-pulled. */
export async function runBasics(
  topic: string,
  history: string,
  versionId: number,
  sessionId: string,
): Promise<BasicsPath> {
  const artifact = await getArtifactContext(versionId);
  const res = await structuredCall<BasicsPath>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system: `${CONSTITUTION}\n\n=== ARTIFACT ===\n${artifact}`,
    user:
      (history ? `Conversation so far:\n${history}\n\n` : "") +
      `The learner wants to START FROM THE BASICS for: ${topic}\n\n` +
      `Return an ordered foundations ladder of 3-6 rungs that build up to this topic, MOST ` +
      `FOUNDATIONAL FIRST, each rung a REAL concept id from the artifact with one short line on ` +
      `why it matters / what it unlocks. End at the topic's own concept if it is in the artifact. ` +
      `Use ONLY artifact concept ids; if the topic has no real prerequisites here, return a 1-2 ` +
      `rung path and say so in the prose.`,
    schemaName: "basics",
    schema: BASICS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 700,
  });
  if (res.ok) {
    return {
      headline: res.data.headline?.trim() || `Building up to: ${topic}`,
      reply: res.data.reply?.trim() || "",
      basics: res.data.basics ?? [],
    };
  }
  return { headline: `Building up to: ${topic}`, reply: "", basics: [] };
}
