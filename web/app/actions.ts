"use server";

import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import { frozenVersion, getTension, getProvenanceForEntity } from "@/lib/db/records";
import { renderTension, type TensionTable } from "@/lib/render";
import { runTurn } from "@/lib/agent";
import { getUserId } from "@/lib/server/identity";
import { logGap, logGesture } from "@/lib/server/log";
import type { AnswerCard } from "@/lib/guide/types";

/** One conversational turn. The agent frames the question, searches the artifact,
 *  and composes a grounded answer; a pinned tension is rendered verbatim here so
 *  its two sides stay the artifact's, never the model's. */
export async function turn(
  sessionId: string,
  question: string,
  history: string,
): Promise<AnswerCard> {
  const base: AnswerCard = {
    question,
    framing: question,
    prose: "",
    table: null,
    sourceConceptIds: [],
    outOfScope: false,
  };
  if (!question.trim()) return base;
  try {
    const userId = await getUserId(sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { ...base, prose: "No frozen corpus is available.", outOfScope: true };

    const t0 = Date.now();
    const answer = await runTurn(question, history, v.id, userId);

    let table: TensionTable | null = null;
    if (answer.tensionId != null) {
      const rec = await getTension(answer.tensionId);
      table = rec ? renderTension(rec) : null;
    }

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
      framing: answer.framing,
      prose: answer.prose,
      table,
      sourceConceptIds: answer.sourceConceptIds,
      outOfScope: answer.outOfScope,
    };
  } catch {
    return { ...base, prose: "That didn't go through. Try again, or rephrase your question." };
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
