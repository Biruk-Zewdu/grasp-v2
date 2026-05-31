import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { appSession } from "./schema";

// Server-side session progress (M4). The sequencer's input — seen/grasped/probed/
// target — now lives in app_session keyed by the request identity (getUserId:
// anon-auth uid when configured, else the client session uuid), NOT in client
// memory. The `nextStep` signature is unchanged; only the SOURCE of its input
// moved server-side (per 50_M4 gotcha). corpus_version is pinned on first write
// so a user mid-session never jumps to a newer corpus underfoot.

export type Progress = {
  target: number | null;
  seen: number[];
  grasped: number[];
  probed: number[];
  seenTensions: number[];
};

export const emptyProgress = (): Progress => ({
  target: null,
  seen: [],
  grasped: [],
  probed: [],
  seenTensions: [],
});

/** The authoritative progress for this identity. Reads the persisted row; on a
 *  first visit (no row) or any DB hiccup, returns `fallback` so the Guide still
 *  works (graceful degradation to the client-held copy). */
export async function loadProgress(userId: string, fallback: Progress): Promise<Progress> {
  try {
    const rows = await db
      .select()
      .from(appSession)
      .where(eq(appSession.userId, userId))
      .limit(1);
    const r = rows[0];
    if (!r) return fallback;
    return {
      target: r.targetEntity,
      seen: r.seenEntityIds,
      grasped: r.graspedEntityIds,
      probed: r.probedEntityIds,
      seenTensions: r.seenTensionIds,
    };
  } catch {
    return fallback;
  }
}

/** Persist progress for this identity (upsert). corpus_version is set only on
 *  insert — never updated — so the pinned version holds for the session. */
export async function saveProgress(
  userId: string,
  corpusVersion: number,
  p: Progress,
): Promise<void> {
  try {
    await db
      .insert(appSession)
      .values({
        userId,
        corpusVersion,
        targetEntity: p.target,
        seenEntityIds: p.seen,
        graspedEntityIds: p.grasped,
        probedEntityIds: p.probed,
        seenTensionIds: p.seenTensions,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: appSession.userId,
        set: {
          targetEntity: p.target,
          seenEntityIds: p.seen,
          graspedEntityIds: p.grasped,
          probedEntityIds: p.probed,
          seenTensionIds: p.seenTensions,
          updatedAt: new Date().toISOString(),
        },
      });
  } catch {
    /* persistence is best-effort; the returned state still carries progress */
  }
}
