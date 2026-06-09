import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySheet, subtopic } from "@/lib/db/schema";
import { structuredCall } from "@/lib/server/model";
import { getArtifactContext } from "@/lib/db/records";

// The DEFAULT study sheet — built from the document so the sheet is complete even
// if the student never interacts. One section per First Principles subtopic, each
// with a key idea + a few exam-ready takeaways, grounded in the artifact. Cached
// per version (shared, deterministic-ish). The page then ENRICHES studied sections
// with the student's own captured work (operators, Q&A) from their journey.

export type DefaultSection = {
  subtopicId: number;
  title: string;
  keyIdea: string; // the one-line "what this section is about"
  takeaways: string[]; // 2-4 exam-ready points grounded in the artifact
};

export type DefaultSheet = { sections: DefaultSection[] };

const SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subtopicId: { type: "integer" },
          keyIdea: { type: "string" },
          takeaways: { type: "array", items: { type: "string" } },
        },
        required: ["subtopicId", "keyIdea", "takeaways"],
        additionalProperties: false,
      },
    },
  },
  required: ["sections"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You are building a study sheet from the curated artifact below, organised by the document's " +
  "sections (subtopics). For EACH section id given, produce:\n" +
  "- keyIdea: one sharp sentence — the thing to take away from that section.\n" +
  "- takeaways: 2–4 crisp, exam-ready points grounded in the artifact's concepts/claims for that " +
  "section. Each one sentence, memorisable.\n" +
  "Ground everything in the artifact; never invent facts. Cover every section id provided.";

/** Build (or fetch cached) the default per-section sheet for a version. */
export async function getDefaultSheet(versionId: number, sessionId: string): Promise<DefaultSheet | null> {
  const cached = await db
    .select({ data: studySheet.data })
    .from(studySheet)
    .where(eq(studySheet.corpusVersion, versionId))
    .limit(1);
  if (cached[0]?.data) {
    try {
      return JSON.parse(cached[0].data) as DefaultSheet;
    } catch {
      /* recompute */
    }
  }

  const subs = await db
    .select({ id: subtopic.id, title: subtopic.title, summary: subtopic.summary })
    .from(subtopic)
    .where(eq(subtopic.corpusVersion, versionId));
  if (!subs.length) return { sections: [] };

  const subList = subs.map((s) => `[section ${s.id}] ${s.title}${s.summary ? ` — ${s.summary}` : ""}`).join("\n");
  const artifact = await getArtifactContext(versionId);
  const res = await structuredCall<DefaultSheet>({
    sessionId,
    role: "reason",
    cacheSystem: true,
    system: `${SYSTEM}\n\n=== ARTIFACT ===\n${artifact}`,
    user: `Build a study sheet for these sections:\n${subList}`,
    schemaName: "sheet",
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1400,
  });
  if (!res.ok) return null;

  const titleById = new Map(subs.map((s) => [s.id, s.title]));
  const sections: DefaultSection[] = (res.data.sections ?? [])
    .filter((s) => titleById.has(s.subtopicId))
    .map((s) => ({
      subtopicId: s.subtopicId,
      title: titleById.get(s.subtopicId)!,
      keyIdea: s.keyIdea?.trim() ?? "",
      takeaways: (s.takeaways ?? []).map((t) => t.trim()).filter(Boolean),
    }));

  // ensure every section appears (fall back to title if the model skipped one)
  for (const s of subs) {
    if (!sections.find((x) => x.subtopicId === s.id)) {
      sections.push({ subtopicId: s.id, title: s.title, keyIdea: s.summary ?? "", takeaways: [] });
    }
  }

  const data: DefaultSheet = { sections };
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
