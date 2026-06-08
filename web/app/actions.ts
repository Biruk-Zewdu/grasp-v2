"use server";

import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import {
  resolveVersion,
  getTension,
  getProvenanceForEntity,
  getConceptBriefs,
} from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";
import { runTurn, runBasics } from "@/lib/agent";
import { getUserId } from "@/lib/server/identity";
import { logGap, logGesture } from "@/lib/server/log";
import type { AnswerCard, GlossTerm, PathRung } from "@/lib/guide/types";

/** One conversational turn. The agent frames the question, searches the artifact,
 *  and composes a grounded answer; a pinned tension is rendered verbatim here so
 *  its two sides stay the artifact's, never the model's. */
export async function turn(
  sessionId: string,
  question: string,
  history: string,
  versionId: number | null = null,
): Promise<AnswerCard> {
  const base: AnswerCard = {
    question,
    headline: null,
    reply: "",
    table: null,
    branches: [],
    sourceConceptIds: [],
    outOfScope: false,
  };
  if (!question.trim()) return base;
  try {
    const userId = await getUserId(sessionId);
    const v = await resolveVersion(versionId, SERVE_CORPUS_VERSION);
    if (!v) return { ...base, reply: "No corpus is available.", outOfScope: true };

    const t0 = Date.now();
    const answer = await runTurn(question, history, v.id, userId);

    let table: TensionTable | null = null;
    if (answer.tensionId != null) {
      const rec = await getTension(answer.tensionId);
      table = rec ? renderTension(rec) : null;
    }

    const briefs = await getConceptBriefs(answer.keyTermIds);
    const glossary: GlossTerm[] = briefs
      .filter((b) => b.definition)
      .map((b) => ({ id: b.id, term: b.name, definition: b.definition! }));

    if (answer.outOfScope) await logGap(question, userId, v.id);
    await logGesture({
      userId,
      gesture: "turn",
      targetEntity: answer.sourceConceptIds[0] ?? null,
      recordKind: answer.tensionId != null ? "tension" : "concept",
      recordId: answer.tensionId ?? answer.sourceConceptIds[0] ?? null,
      latencyMs: Date.now() - t0,
      model: null,
      tokens: null,
    });

    return {
      question,
      headline: answer.headline,
      reply: answer.reply,
      table,
      branches: answer.branches,
      sourceConceptIds: answer.sourceConceptIds,
      outOfScope: answer.outOfScope,
      glossary,
    };
  } catch {
    return { ...base, reply: "That didn't go through. Try again, or rephrase your question." };
  }
}

/** "Start from the basics" — a learner-pulled Foundations Path for `topic`
 *  (SERVE_DESIGN §7a-a). Returns an answer card whose `path` is the ladder. */
export async function basics(
  sessionId: string,
  topic: string,
  history: string,
  versionId: number | null = null,
): Promise<AnswerCard> {
  const base: AnswerCard = {
    question: `Start from the basics: ${topic}`,
    headline: `Building up to: ${topic}`,
    reply: "",
    table: null,
    branches: [],
    sourceConceptIds: [],
    outOfScope: false,
  };
  try {
    const userId = await getUserId(sessionId);
    const v = await resolveVersion(versionId, SERVE_CORPUS_VERSION);
    if (!v) return base;

    const t0 = Date.now();
    const result = await runBasics(topic, history, v.id, userId);
    const briefs = await getConceptBriefs(result.basics.map((b) => b.conceptId));
    const byId = new Map(briefs.map((b) => [b.id, b]));
    const path: PathRung[] = result.basics
      .filter((b) => byId.has(b.conceptId))
      .map((b) => ({ id: b.conceptId, name: byId.get(b.conceptId)!.name, why: b.why }));

    await logGesture({
      userId,
      gesture: "basics",
      targetEntity: path[0]?.id ?? null,
      recordKind: "path",
      recordId: path[path.length - 1]?.id ?? null,
      latencyMs: Date.now() - t0,
      model: null,
      tokens: null,
    });

    return { ...base, headline: result.headline, reply: result.reply, path };
  } catch {
    return { ...base, reply: "Couldn't build the basics path. Try again." };
  }
}

/** Depth-on-demand: the source passages behind the concepts the answer cited. */
export async function expandSources(conceptIds: number[]): Promise<string[]> {
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
