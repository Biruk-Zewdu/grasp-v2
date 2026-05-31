"use server";

import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import {
  frozenVersion,
  getEntity,
  getTension,
  getProbe,
  getProvenanceForEntity,
} from "@/lib/db/records";
import { loadGraph } from "@/lib/db/graph";
import { nextStep, type SeqGraph } from "@/lib/sequencer";
import { renderEntity, renderTension, renderProbe, renderStop, type Step } from "@/lib/render";
import { classifyGoal } from "@/lib/index";
import { checkProbe } from "@/lib/probe";
import {
  type GuideState,
  type Advance,
  withSeen,
  withSeenTension,
} from "@/lib/guide/types";

function noVersionStep(): Step {
  return {
    kind: "stop",
    title: "No frozen corpus",
    point: "Freeze a corpus version first (db/freeze.py freeze).",
  };
}
function gapStep(goal: string): Step {
  return {
    kind: "stop",
    title: "That's outside this corpus",
    point: `"${goal}" doesn't map to a concept in the v1 course corpus. Try a topic from the AI-foundations sessions (credit assignment, search, representation, …).`,
  };
}

// An unsurfaced tension in a concept's neighbourhood (itself or a related concept).
function neighbourhoodTension(graph: SeqGraph, entityId: number, seenTensions: number[]) {
  const seen = new Set(seenTensions);
  const relevant = new Set<number>([entityId, ...(graph.related?.get(entityId) ?? [])]);
  return graph.tensions.find(
    (t) => !seen.has(t.id) && t.conceptIds.some((c) => relevant.has(c)),
  );
}

// Internal: run the sequencer once and render the chosen record.
async function advance(state: GuideState): Promise<Advance> {
  const v = await frozenVersion(SERVE_CORPUS_VERSION);
  if (!v) return { step: noVersionStep(), state };
  if (state.target == null) return { step: renderStop(), state };

  const graph = await loadGraph(v.id);
  const ref = nextStep(graph, {
    target: state.target,
    seen: state.seen,
    grasped: state.grasped,
    probed: state.probed,
    seenTensions: state.seenTensions,
  });

  if (ref.kind === "entity") {
    const rec = await getEntity(ref.entityId);
    if (!rec) return { step: renderStop(), state };
    const hasTension = !!neighbourhoodTension(graph, ref.entityId, state.seenTensions);
    const step = await renderEntity(rec, state.sessionId, { hasTension });
    return { step, state: withSeen(state, ref.entityId) };
  }
  if (ref.kind === "tension") {
    const rec = await getTension(ref.tensionId);
    if (!rec) return { step: renderStop(), state };
    return { step: renderTension(rec), state: withSeenTension(state, ref.tensionId) };
  }
  if (ref.kind === "probe") {
    const rec = await getProbe(ref.probeId);
    if (!rec) return { step: renderStop(), state };
    return { step: renderProbe(rec), state };
  }
  return { step: renderStop(), state };
}

/** Set (or change) the goal from free text, then advance. Accumulated grasp is
 *  kept across goals; only the target changes. */
export async function startGoal(state: GuideState, goal: string): Promise<Advance> {
  const v = await frozenVersion(SERVE_CORPUS_VERSION);
  if (!v) return { step: noVersionStep(), state };
  const match = await classifyGoal(goal, v.id, state.sessionId);
  if ("gap" in match) return { step: gapStep(goal), state, gap: true };
  return advance({ ...state, target: match.entityId });
}

/** Forward: the next Step. */
export async function forward(state: GuideState): Promise<Advance> {
  return advance(state);
}

/** Answer a probe: record coverage (never a score), then advance. A miss simply
 *  opens the next deeper Step — the concept is marked probed so it won't repeat. */
export async function submitProbe(
  state: GuideState,
  probeId: number,
  response: string,
): Promise<Advance> {
  const probe = await getProbe(probeId);
  if (!probe) return advance(state);
  const result = await checkProbe(probe, response, state.sessionId);

  const next: GuideState = {
    ...state,
    seen: [...new Set([...state.seen, ...probe.conceptIds])],
    probed: [...new Set([...state.probed, ...probe.conceptIds])],
    grasped: result.grasped
      ? [...new Set([...state.grasped, ...probe.conceptIds])]
      : state.grasped,
  };
  const adv = await advance(next);
  return {
    ...adv,
    coverage: { covered: result.covered, total: probe.expectedSignals.length, grasped: result.grasped },
  };
}

/** Pull deeper: surface this concept's tension (the rival views + when each
 *  holds) on demand, rather than waiting for the sequencer to reach it. */
export async function goDeeper(state: GuideState, entityId: number): Promise<Advance> {
  const v = await frozenVersion(SERVE_CORPUS_VERSION);
  if (!v) return { step: noVersionStep(), state };
  const graph = await loadGraph(v.id);
  const t = neighbourhoodTension(graph, entityId, state.seenTensions);
  if (!t) return advance(state); // nothing deeper here — just move on
  const rec = await getTension(t.id);
  if (!rec) return advance(state);
  return { step: renderTension(rec), state: withSeenTension(state, t.id) };
}

/** Depth tier 3: the source passages behind a concept (raw records, no model). */
export async function expandSource(entityId: number): Promise<string[]> {
  return getProvenanceForEntity(entityId);
}
