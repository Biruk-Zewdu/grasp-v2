"use server";

import { getFlashcards, getTension } from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";

// Server actions for the dashboard tools that open as quick views (no model):
// Flashcards (concepts ⇄ definitions) and the Tension/Debate (verbatim table).

export async function flashcards(versionId: number) {
  return getFlashcards(versionId);
}

export async function tensionTable(tensionId: number): Promise<TensionTable | null> {
  const rec = await getTension(tensionId);
  return rec ? renderTension(rec) : null;
}
