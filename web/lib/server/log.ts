import "server-only";
import { db } from "@/lib/db/client";
import { gapLog, gestureLog } from "@/lib/db/schema";

// Serve-time logging. Both writers SWALLOW errors: a logging failure must never
// break the learner's path. No PII in gesture_log — goal/answer text lives only
// in gap_log (its whole purpose is to become a curation candidate).

/** An out-of-corpus goal: a curation candidate, not a silent dead end (M4 gap loop). */
export async function logGap(
  goalText: string,
  userId: string | null,
  corpusVersion: number | null,
): Promise<void> {
  try {
    await db.insert(gapLog).values({ goalText, userId, corpusVersion });
  } catch {
    /* logging is best-effort */
  }
}

export type GestureEntry = {
  userId: string | null;
  gesture: string; // 'goal' | 'forward' | 'probe' | 'deeper' | 'source'
  targetEntity?: number | null;
  recordKind?: string | null; // 'briefing' | 'tension' | 'probe' | 'stop'
  recordId?: number | null;
  latencyMs?: number | null;
  model?: string | null; // null in template mode
  tokens?: number | null;
};

/** One row per gesture: what was served, how long, which model, how many tokens. */
export async function logGesture(entry: GestureEntry): Promise<void> {
  try {
    await db.insert(gestureLog).values({
      userId: entry.userId,
      gesture: entry.gesture,
      targetEntity: entry.targetEntity ?? null,
      recordKind: entry.recordKind ?? null,
      recordId: entry.recordId ?? null,
      latencyMs: entry.latencyMs ?? null,
      model: entry.model ?? null,
      tokens: entry.tokens ?? null,
    });
  } catch {
    /* logging is best-effort */
  }
}
