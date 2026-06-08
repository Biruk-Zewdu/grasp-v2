"use server";

import { getFlashcards, getTension } from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";
import { getDebateSetup, argueSide, type DebateSide, type DebateTurn, type DebateSetup } from "@/lib/debate";
import { getUserId } from "@/lib/server/identity";

// Server actions for the dashboard tools that open as quick views (no model):
// Flashcards (concepts ⇄ definitions) and the Tension/Debate (verbatim table),
// plus the interactive debate (grounded arguments + rebuttals).

export async function flashcards(versionId: number) {
  return getFlashcards(versionId);
}

export async function tensionTable(tensionId: number): Promise<TensionTable | null> {
  const rec = await getTension(tensionId);
  return rec ? renderTension(rec) : null;
}

export async function debateSetup(tensionId: number): Promise<DebateSetup | null> {
  return getDebateSetup(tensionId);
}

/** One grounded move in the debate: the AI argues `side`, optionally rebutting a
 *  student's point. Returns the argument text. */
export async function debateMove(
  sessionId: string,
  tensionId: number,
  side: DebateSide,
  history: DebateTurn[],
  studentPoint: string | null,
): Promise<string | null> {
  const userId = await getUserId(sessionId);
  return argueSide(tensionId, side, history, studentPoint, userId);
}
