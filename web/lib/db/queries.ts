import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "./client";
import { corpusVersion, entity, tension, probe, claim } from "./schema";

// The single frozen version serve reads. Never serve an unfrozen build (I5).
const SERVE_LABEL = process.env.SERVE_CORPUS_VERSION ?? "v1";

/** The frozen corpus_version row serve is pinned to, or null if none is frozen. */
export async function servedVersion() {
  const rows = await db
    .select()
    .from(corpusVersion)
    .where(and(eq(corpusVersion.label, SERVE_LABEL), isNotNull(corpusVersion.frozenAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Scaffold read: top-line counts for the frozen artifact (proves the wire). */
export async function artifactStats() {
  const v = await servedVersion();
  if (!v) return null;
  const [{ count: entities }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entity)
    .where(eq(entity.corpusVersion, v.id));
  const [{ count: claims }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(claim)
    .where(eq(claim.corpusVersion, v.id));
  const [{ count: tensions }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tension)
    .where(eq(tension.corpusVersion, v.id));
  const [{ count: probes }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(probe)
    .where(eq(probe.corpusVersion, v.id));
  return { version: v, entities, claims, tensions, probes };
}
