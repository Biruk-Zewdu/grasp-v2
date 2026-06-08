"use server";

import { getOrBuildLesson } from "@/lib/lesson";
import { runTurn } from "@/lib/agent";
import {
  resolveVersion,
  getTension,
  getConceptBriefs,
  getProvenanceForEntity,
} from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";
import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import { getUserId } from "@/lib/server/identity";
import { logGesture } from "@/lib/server/log";
import type { GlossTerm } from "@/lib/guide/types";

// Actions for the revamped "Understand" lesson-reader. A subtopic renders as a
// real lesson (teaching prose + glossed key terms + the verbatim tension if it
// turns on one + sources); the learner can ask a follow-up that stays in context.

export type LessonView = {
  headline: string;
  body: string;
  glossary: GlossTerm[];
  table: TensionTable | null;
  sourceConceptIds: number[];
  unavailable?: boolean; // live model needed to compose (template/no-key)
};

/** Compose (or fetch cached) the lesson for one subtopic. */
export async function readLesson(sessionId: string, subtopicId: number): Promise<LessonView> {
  const userId = await getUserId(sessionId);
  const content = await getOrBuildLesson(subtopicId, userId);
  if (!content) {
    return {
      headline: "",
      body: "",
      glossary: [],
      table: null,
      sourceConceptIds: [],
      unavailable: true,
    };
  }
  let table: TensionTable | null = null;
  if (content.tensionId != null) {
    const rec = await getTension(content.tensionId);
    table = rec ? renderTension(rec) : null;
  }
  const briefs = await getConceptBriefs(content.keyTermIds);
  const glossary: GlossTerm[] = briefs
    .filter((b) => b.definition)
    .map((b) => ({ id: b.id, term: b.name, definition: b.definition! }));

  await logGesture({
    userId,
    gesture: "lesson",
    targetEntity: content.sourceConceptIds[0] ?? null,
    recordKind: content.tensionId != null ? "tension" : "concept",
    recordId: content.tensionId ?? content.sourceConceptIds[0] ?? null,
  });

  return { headline: content.headline, body: content.body, glossary, table, sourceConceptIds: content.sourceConceptIds };
}

export type AskAnswer = {
  reply: string;
  glossary: GlossTerm[];
  table: TensionTable | null;
  sourceConceptIds: number[];
};

/** A follow-up question within a lesson (stays grounded in the same artifact). */
export async function ask(
  sessionId: string,
  question: string,
  context: string,
  versionId: number | null,
): Promise<AskAnswer> {
  const empty: AskAnswer = { reply: "", glossary: [], table: null, sourceConceptIds: [] };
  if (!question.trim()) return empty;
  const userId = await getUserId(sessionId);
  const v = await resolveVersion(versionId, SERVE_CORPUS_VERSION);
  if (!v) return { ...empty, reply: "No corpus is available." };

  const a = await runTurn(question, context, v.id, userId);
  let table: TensionTable | null = null;
  if (a.tensionId != null) {
    const rec = await getTension(a.tensionId);
    table = rec ? renderTension(rec) : null;
  }
  const briefs = await getConceptBriefs(a.keyTermIds);
  const glossary: GlossTerm[] = briefs
    .filter((b) => b.definition)
    .map((b) => ({ id: b.id, term: b.name, definition: b.definition! }));
  return { reply: a.reply, glossary, table, sourceConceptIds: a.sourceConceptIds };
}

/** Provenance passages behind cited concepts. */
export async function lessonSources(conceptIds: number[]): Promise<string[]> {
  try {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of conceptIds.slice(0, 3)) {
      for (const p of await getProvenanceForEntity(id)) {
        if (!seen.has(p)) {
          seen.add(p);
          out.push(p);
        }
      }
    }
    return out.slice(0, 4);
  } catch {
    return [];
  }
}
