"use server";

import { getQuiz, gradeAndRecord, getDelta } from "@/lib/assessment";
import { getUserId } from "@/lib/server/identity";

// Server actions for the doc-level pre/post assessment (Phase G). Questions are
// served without the key; grading is deterministic on the server.

export async function quiz(versionId: number) {
  return getQuiz(versionId);
}

export async function grade(
  sessionId: string,
  versionId: number,
  phase: "pre" | "post",
  answers: Record<number, number>,
) {
  const userId = await getUserId(sessionId);
  return gradeAndRecord(versionId, phase, answers, userId);
}

export async function delta(sessionId: string, versionId: number) {
  const userId = await getUserId(sessionId);
  return getDelta(versionId, userId);
}
