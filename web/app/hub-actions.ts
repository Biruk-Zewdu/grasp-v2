"use server";

import { getFlashcards, getTension, getConceptBriefs } from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";
import { getDebateSetup, argueSide, type DebateSide, type DebateTurn, type DebateSetup } from "@/lib/debate";
import { getOrBuildSummary } from "@/lib/summary";
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

export type SummaryView = { text: string; chips: { id: number; name: string }[] } | null;

/** The concept-applied summary + its named-concept chips (for the dashboard). */
export async function summary(sessionId: string, versionId: number): Promise<SummaryView> {
  const userId = await getUserId(sessionId);
  const s = await getOrBuildSummary(versionId, userId);
  if (!s) return null;
  const briefs = await getConceptBriefs(s.conceptIds);
  const byId = new Map(briefs.map((b) => [b.id, b.name]));
  const chips = s.conceptIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
  return { text: s.text, chips };
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
