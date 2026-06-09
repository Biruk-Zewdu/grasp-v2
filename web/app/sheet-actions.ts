"use server";

import { getDefaultSheet, type DefaultSheet } from "@/lib/sheet";
import { getUserId } from "@/lib/server/identity";

// The default study sheet — built from the document so the sheet is complete even
// with zero interaction. The page enriches studied sections from the journey.
export async function defaultSheet(sessionId: string, versionId: number): Promise<DefaultSheet | null> {
  const userId = await getUserId(sessionId);
  return getDefaultSheet(versionId, userId);
}
