import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySheet, tension } from "@/lib/db/schema";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext, getConceptBriefs } from "@/lib/db/records";

// The Study Sheet — what a student actually wants before an exam. NOT a paragraph:
// a structured prep sheet built from the typed records — a one-line TL;DR, the
// must-know concepts ranked by exam-importance (each with its verbatim definition
// + a one-line "why it matters"), the key claims to remember, and the contested
// point. The model ORGANISES and PRIORITISES (which concepts matter most, a sharp
// TL;DR, the why-lines); the definitions/claims stay the artifact's, verbatim.
// Cached in study_sheet (JSON).

export type SheetConcept = { id: number; name: string; definition: string; why: string };
export type StudySheetData = {
  tldr: string;
  concepts: SheetConcept[];
  keyPoints: string[]; // the claims worth memorising, in the model's words but grounded
  tensionId: number | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    tldr: { type: "string" },
    conceptOrder: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, why: { type: "string" } },
        required: ["id", "why"],
        additionalProperties: false,
      },
    },
    keyPoints: { type: "array", items: { type: "string" } },
  },
  required: ["tldr", "conceptOrder", "keyPoints"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are building an EXAM-PREP study sheet from the curated artifact below. A student will use " +
  "this to revise. Rules:\n" +
  "1. tldr: one or two sharp sentences — the single thing to take away. Concrete, not fluffy.\n" +
  "2. conceptOrder: rank the artifact's concepts by how important they are to KNOW for an exam " +
  "(most important first). For each, give a one-line 'why it matters' (what it's for / what it " +
  "unlocks / a trap to avoid). Use the real concept ids. Include the concepts worth revising; you " +
  "may drop trivial ones.\n" +
  "3. keyPoints: 4–7 crisp, memorisable takeaways grounded in the artifact's claims — the things " +
  "most likely to be tested. Each one sentence.\n" +
  "4. Ground everything in the artifact. Never invent facts.";

/** Fetch the cached sheet, or compose + cache it. The concept DEFINITIONS are
 *  always the artifact's verbatim text — the model only ranks + writes why-lines. */
export async function getOrBuildSheet(versionId: number, sessionId: string): Promise<StudySheetData | null> {
  const cached = await db
    .select({ data: studySheet.data })
    .from(studySheet)
    .where(eq(studySheet.corpusVersion, versionId))
    .limit(1);
  if (cached[0]?.data) {
    try {
      return JSON.parse(cached[0].data) as StudySheetData;
    } catch {
      /* recompute */
    }
  }

  const tens = await db
    .select({ id: tension.id })
    .from(tension)
    .where(eq(tension.corpusVersion, versionId))
    .limit(1);
  const tensionId = tens[0]?.id ?? null;

  const artifact = await getArtifactContext(versionId);
  const res = await structuredCall<{
    tldr: string;
    conceptOrder: { id: number; why: string }[];
    keyPoints: string[];
  }>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system: `${SYSTEM}\n\n=== ARTIFACT ===\n${artifact}`,
    user: "Build the exam-prep study sheet for this document.",
    schemaName: "sheet",
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1200,
  });
  if (!res.ok) return null;

  // Attach the VERBATIM definitions to the model's ranked concepts.
  const order = res.data.conceptOrder ?? [];
  const briefs = await getConceptBriefs(order.map((o) => o.id));
  const defById = new Map(briefs.map((b) => [b.id, b]));
  const concepts: SheetConcept[] = order
    .filter((o) => defById.has(o.id))
    .map((o) => {
      const b = defById.get(o.id)!;
      return { id: o.id, name: b.name, definition: b.definition ?? "", why: o.why };
    });

  const data: StudySheetData = {
    tldr: res.data.tldr.trim(),
    concepts,
    keyPoints: res.data.keyPoints ?? [],
    tensionId,
  };

  try {
    await db
      .insert(studySheet)
      .values({ corpusVersion: versionId, data: JSON.stringify(data) })
      .onConflictDoUpdate({ target: studySheet.corpusVersion, set: { data: JSON.stringify(data) } });
  } catch {
    /* cache best-effort */
  }
  return data;
}
