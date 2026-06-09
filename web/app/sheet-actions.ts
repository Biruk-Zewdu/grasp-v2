"use server";

import { getOrBuildSheet, type StudySheetData } from "@/lib/sheet";
import { getUserId } from "@/lib/server/identity";

// Server action for the exam-prep study sheet (its own page).
export async function studySheet(sessionId: string, versionId: number): Promise<StudySheetData | null> {
  const userId = await getUserId(sessionId);
  return getOrBuildSheet(versionId, userId);
}
