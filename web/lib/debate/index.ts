import "server-only";
import { structuredCall } from "@/lib/server/model";
import { getTension, getArtifactContext, tensionVersion } from "@/lib/db/records";

// The interactive debate (the tension, made live). A contested point has two
// recorded sides (renderTension's verbatim cells). Here the model ARGUES one side
// — grounded in that side's proposition + conditions + the artifact — and rebuts
// the other. The student can pick a side (model takes the other), watch both
// sides (model argues each), or jump in with their own point (model responds).
//
// Guard: arguments are grounded in the artifact; the model never fabricates facts
// beyond the records, and it argues WITHIN a recorded position — it doesn't invent
// new positions or declare a final winner (the tension stays unresolved).

export type DebateSide = "A" | "B";

export type DebateSetup = {
  dimension: string;
  sideA: { label: string; claim: string; when: string };
  sideB: { label: string; claim: string; when: string };
};

export type DebateTurn = {
  side: DebateSide;
  text: string;
};

/** The two recorded positions — the debate's fixed framing (verbatim from the record). */
export async function getDebateSetup(tensionId: number): Promise<DebateSetup | null> {
  const t = await getTension(tensionId);
  if (!t) return null;
  return {
    dimension: t.dimension ?? "A contested point",
    sideA: { label: t.claimA.paradigm || "Side A", claim: t.claimA.proposition, when: t.conditionsA },
    sideB: { label: t.claimB.paradigm || "Side B", claim: t.claimB.proposition, when: t.conditionsB },
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    argument: { type: "string" },
    groundedIn: { type: "array", items: { type: "string" } },
  },
  required: ["argument", "groundedIn"],
  additionalProperties: false,
} as const;

export type DebateMove = { argument: string; groundedIn: string[] };

/** Produce one grounded argument for `side`, given the debate so far. If the last
 *  move was the opponent's (or the student's), this is a rebuttal. Returns the
 *  argument plus the artifact concepts/claims it leaned on (so grounding is visible,
 *  not just instructed). */
export async function argueSide(
  tensionId: number,
  side: DebateSide,
  history: DebateTurn[],
  studentPoint: string | null,
  sessionId: string,
): Promise<DebateMove | null> {
  const setup = await getDebateSetup(tensionId);
  if (!setup) return null;
  const versionId = await tensionVersion(tensionId);
  const artifact = versionId != null ? await getArtifactContext(versionId) : "";

  const me = side === "A" ? setup.sideA : setup.sideB;
  const them = side === "A" ? setup.sideB : setup.sideA;

  const transcript = history.map((h) => `${h.side === side ? "You" : "Opponent"}: ${h.text}`).join("\n");

  const system =
    `You are debating a contested point, arguing ONE fixed side, grounded in the curated ` +
    `artifact below. Rules:\n` +
    `1. Argue for YOUR side and rebut the other — but stay grounded: use only the artifact's ` +
    `concepts, claims, and the recorded conditions. Never invent facts, studies, or numbers.\n` +
    `2. Be sharp and concrete (2–4 sentences), like a real debater making one point or rebuttal. ` +
    `NAME at least one specific artifact concept or claim you rely on, and reference WHEN your ` +
    `side holds (its conditions) when it strengthens the point.\n` +
    `3. Do NOT concede the debate or declare a winner — the tension stays open. Argue your side ` +
    `honestly within its recorded position; do not invent a new position.\n` +
    `4. groundedIn: list the exact names of the artifact concepts/claims your argument leaned on ` +
    `(1–3). These must be things actually in the artifact below.\n\n` +
    `=== ARTIFACT ===\n${artifact}`;

  const user =
    `THE QUESTION: ${setup.dimension}\n\n` +
    `YOUR SIDE — ${me.label}: ${me.claim} (holds when ${me.when})\n` +
    `THE OTHER SIDE — ${them.label}: ${them.claim} (holds when ${them.when})\n\n` +
    (transcript ? `DEBATE SO FAR:\n${transcript}\n\n` : "") +
    (studentPoint ? `The other debater (a student) just argued:\n"${studentPoint}"\n\nRebut it for your side.` : history.length ? `Make your next point / rebuttal for your side.` : `Open the debate with your strongest point for your side.`);

  const res = await structuredCall<{ argument: string; groundedIn: string[] }>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system,
    user,
    schemaName: "debate",
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 400,
  });
  if (!res.ok) return null;
  return { argument: res.data.argument.trim(), groundedIn: (res.data.groundedIn ?? []).slice(0, 3) };
}
