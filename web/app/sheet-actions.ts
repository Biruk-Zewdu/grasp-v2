"use server";

import { getOrBuildSheet, type StudySheetData } from "@/lib/sheet";
import { getUserId } from "@/lib/server/identity";

// Server action for the exam-prep study sheet. An optional journeyNote (the
// learner's pre-quiz misses, questions asked, operators applied, sections read)
// personalises the sheet to their gaps.
export async function studySheet(
  sessionId: string,
  versionId: number,
  journeyNote?: string,
): Promise<StudySheetData | null> {
  const userId = await getUserId(sessionId);
  return getOrBuildSheet(versionId, userId, journeyNote);
}
