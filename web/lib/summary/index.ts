import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { corpusVersion } from "@/lib/db/schema";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext } from "@/lib/db/records";

// The concept-applied summary (dashboard hero). Not a generic abstract — it
// explains the document THROUGH its own concepts, naming and applying them, so the
// summary itself teaches the vocabulary. The named concepts become interactive
// chips (explore each). Cached in corpus_version.notes (free, no migration).

export type Summary = {
  text: string;
  conceptIds: number[]; // the concepts named in the summary, for chips
};

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    conceptIds: { type: "array", items: { type: "integer" } },
  },
  required: ["summary", "conceptIds"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are writing a short orientation summary of a document for a learner, grounded ENTIRELY in " +
  "the curated artifact below. Rules:\n" +
  "1. In 2–3 sentences, explain what this document is really about — but do it BY USING the " +
  "document's own key concepts, naming them explicitly, so the summary itself teaches the " +
  "vocabulary. Apply the concepts; don't describe them generically.\n" +
  "2. If the document turns on a contested point, name it in one clause (the reader can explore it).\n" +
  "3. conceptIds: the ids of the artifact concepts you NAMED in the summary (so they become " +
  "clickable). Use each concept's exact name in the text.\n" +
  "4. Ground everything in the artifact — never invent facts.";

/** Fetch the cached summary, or compose + cache it. */
export async function getOrBuildSummary(versionId: number, sessionId: string): Promise<Summary | null> {
  const row = await db
    .select({ notes: corpusVersion.notes })
    .from(corpusVersion)
    .where(eq(corpusVersion.id, versionId))
    .limit(1);
  if (row[0]?.notes) {
    try {
      return JSON.parse(row[0].notes) as Summary;
    } catch {
      /* not a cached summary — recompute */
    }
  }

  const artifact = await getArtifactContext(versionId);
  const res = await structuredCall<{ summary: string; conceptIds: number[] }>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system: `${SYSTEM}\n\n=== ARTIFACT ===\n${artifact}`,
    user: "Write the concept-applied summary for this document.",
    schemaName: "summary",
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 400,
  });
  if (!res.ok) return null;

  const summary: Summary = { text: res.data.summary.trim(), conceptIds: res.data.conceptIds ?? [] };
  try {
    await db.update(corpusVersion).set({ notes: JSON.stringify(summary) }).where(eq(corpusVersion.id, versionId));
  } catch {
    /* cache best-effort */
  }
  return summary;
}
