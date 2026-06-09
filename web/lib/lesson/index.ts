import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { lesson, tension } from "@/lib/db/schema";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext, getSubtopic, getConceptBriefs } from "@/lib/db/records";

// The Lesson generator (Phase F / V2_DESIGN §6): a readable teaching write-up for
// one subtopic, composed FROM the artifact. The "tutor" is this generated material
// (calm, text) — the interactivity lives in the Guide beside it.
//
// Guard (the thesis line): the model composes the PROSE (grounded reasoner) and
// may POINT at one relevant tension by id — but it never authors the tension's
// cells. The tension is rendered verbatim from its record at serve time, exactly
// like the Guide. Cached in the `lesson` table so re-viewing costs nothing.

export type LessonContent = {
  headline: string;
  body: string;
  keyTermIds: number[];
  tensionId: number | null;
  sourceConceptIds: number[];
};

const LESSON_SYSTEM =
  "You are Grasp composing a short LESSON for one subtopic, grounded ENTIRELY in the curated " +
  "artifact below. Rules:\n" +
  "1. Teach the subtopic clearly and concisely — a few grounded paragraphs a learner can read in " +
  "a minute or two. Use the document's own concepts and claims; never invent facts.\n" +
  "2. headline: a short title for the lesson.\n" +
  "3. body: the teaching prose. Name real artifact concepts where they help (so they can be " +
  "glossed inline). Build understanding bottom-up.\n" +
  "4. keyTermIds: ids of artifact concepts you NAME in the body that a learner may want defined.\n" +
  "5. tensionId: if — and ONLY if — this subtopic genuinely turns on a contested point present in " +
  "the artifact, set the relevant tension id; the system renders both sides verbatim. Do NOT " +
  "write the two sides yourself, pick a winner, or invent a tension. Otherwise null.\n" +
  "6. sourceConceptIds: the concept ids the lesson rests on (for the provenance pull).";

const LESSON_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    keyTermIds: { type: "array", items: { type: "integer" } },
    tensionId: { type: ["integer", "null"] },
    sourceConceptIds: { type: "array", items: { type: "integer" } },
  },
  required: ["headline", "body", "keyTermIds", "tensionId", "sourceConceptIds"],
  additionalProperties: false,
} as const;

/** Fetch the cached lesson for a subtopic, or compose + cache it. Returns null in
 *  template/no-key mode if nothing is cached (lessons need the live model once). */
export async function getOrBuildLesson(
  subtopicId: number,
  sessionId: string,
): Promise<LessonContent | null> {
  const cached = await db.select().from(lesson).where(eq(lesson.subtopicId, subtopicId)).limit(1);
  if (cached[0]) {
    return {
      headline: cached[0].headline ?? "",
      body: cached[0].body,
      keyTermIds: cached[0].keyTermIds,
      tensionId: cached[0].tensionId,
      sourceConceptIds: cached[0].sourceConceptIds,
    };
  }

  const sub = await getSubtopic(subtopicId);
  if (!sub) return null;

  const artifact = await getArtifactContext(sub.corpusVersion);
  const focus = await getConceptBriefs(sub.conceptIds);
  const focusList = focus.map((c) => `- ${c.name}`).join("\n");

  const res = await structuredCall<LessonContent>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system: `${LESSON_SYSTEM}\n\n=== ARTIFACT ===\n${artifact}`,
    user:
      `Compose the lesson for subtopic: "${sub.title}"` +
      (sub.summary ? `\nWhat the learner should grasp: ${sub.summary}` : "") +
      (focusList ? `\nIt centres on these concepts:\n${focusList}` : ""),
    schemaName: "lesson",
    schema: LESSON_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1200,
  });
  if (!res.ok) return null;

  const data = res.data;
  // Validate the pointed tension belongs to this version (never trust a stray id).
  let tensionId: number | null = null;
  if (data.tensionId != null) {
    const t = await db
      .select({ id: tension.id })
      .from(tension)
      .where(and(eq(tension.id, data.tensionId), eq(tension.corpusVersion, sub.corpusVersion)))
      .limit(1);
    tensionId = t[0]?.id ?? null;
  }

  const content: LessonContent = {
    headline: data.headline?.trim() || sub.title,
    body: data.body?.trim() || "",
    keyTermIds: data.keyTermIds ?? [],
    tensionId,
    sourceConceptIds: data.sourceConceptIds ?? [],
  };

  // Cache (best-effort — a write failure just means we recompute next time).
  try {
    await db.insert(lesson).values({
      subtopicId,
      headline: content.headline,
      body: content.body,
      keyTermIds: content.keyTermIds,
      tensionId: content.tensionId,
      sourceConceptIds: content.sourceConceptIds,
      corpusVersion: sub.corpusVersion,
    });
  } catch {
    /* cache best-effort */
  }
  return content;
}
