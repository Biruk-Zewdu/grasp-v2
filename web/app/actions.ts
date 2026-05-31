"use server";

import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import {
  frozenVersion,
  getEntity,
  getConceptContext,
  getTension,
  getTensionReasoning,
  getProbe,
  getProvenanceForEntity,
} from "@/lib/db/records";
import { loadGraph } from "@/lib/db/graph";
import { nextStep, type SeqGraph } from "@/lib/sequencer";
import {
  renderEntity,
  renderTension,
  renderReasoning,
  renderProbe,
  renderStop,
  type Step,
  type ModelUsage,
} from "@/lib/render";
import { classifyGoal, routeAsk } from "@/lib/index";
import { checkProbe } from "@/lib/probe";
import { getUserId } from "@/lib/server/identity";
import { logGap, logGesture } from "@/lib/server/log";
import { loadProgress, saveProgress, type Progress } from "@/lib/db/session";
import { type GuideState, type Advance } from "@/lib/guide/types";

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
// Graceful failure — no raw stack trace ever reaches the learner (M4 error states).
function errorStep(): Step {
  return {
    kind: "stop",
    title: "Something hiccuped",
    point: "That didn't go through. Try again, or set a new goal.",
  };
}

const uniq = (xs: number[]) => [...new Set(xs)];
const toProgress = (s: GuideState): Progress => ({
  target: s.target,
  seen: s.seen,
  grasped: s.grasped,
  probed: s.probed,
  seenTensions: s.seenTensions,
});
const toState = (sessionId: string, p: Progress): GuideState => ({ sessionId, ...p });

// D2 reasoning Step for a tension (the "why" — shared by Go-deeper and a probe
// breakdown). Returns null when there's no justification to surface.
async function reasoningStep(
  userId: string,
  versionId: number,
  tensionId: number,
  targetEntity: number | null,
  gesture: string,
): Promise<(Step & { kind: "reasoning" }) | null> {
  const reasoning = await getTensionReasoning(tensionId, versionId);
  if (!reasoning) return null;
  const r = await renderReasoning(reasoning, userId);
  await logGesture({
    userId,
    gesture,
    targetEntity,
    recordKind: "reasoning",
    recordId: tensionId,
    model: r.usage?.model ?? null,
    tokens: r.usage?.tokens ?? null,
  });
  return { ...r.step, tensionId };
}

// An unsurfaced tension in a concept's neighbourhood (itself or a related concept).
function neighbourhoodTension(graph: SeqGraph, entityId: number, seenTensions: number[]) {
  const seen = new Set(seenTensions);
  const relevant = new Set<number>([entityId, ...(graph.related?.get(entityId) ?? [])]);
  return graph.tensions.find(
    (t) => !seen.has(t.id) && t.conceptIds.some((c) => relevant.has(c)),
  );
}

// Core: run the sequencer once over server-side progress, render the chosen
// record, log the gesture. Returns the Step and the next progress (caller persists).
async function step(
  userId: string,
  versionId: number,
  progress: Progress,
  gesture: string,
): Promise<{ step: Step; next: Progress }> {
  const t0 = Date.now();
  const target = progress.target;
  if (target == null) return { step: renderStop(), next: progress };

  const graph = await loadGraph(versionId);
  const ref = nextStep(graph, { ...progress, target });

  let s: Step;
  let next = progress;
  let usage: ModelUsage | undefined;
  let recordId: number | null = null;

  if (ref.kind === "entity") {
    const rec = await getEntity(ref.entityId);
    if (!rec) return { step: renderStop(), next: progress };
    const context = await getConceptContext(ref.entityId, versionId);
    // The catch ships INLINE with the briefing — but only for the goal concept
    // itself (economy: don't dump every prerequisite's tension, SERVE_DESIGN §5).
    // When shown inline, mark the tension seen so the sequencer doesn't re-emit
    // it as a separate Step.
    const nt =
      ref.entityId === target
        ? neighbourhoodTension(graph, ref.entityId, progress.seenTensions)
        : undefined;
    let catchTable: import("@/lib/render").TensionTable | undefined;
    let seenTensions = progress.seenTensions;
    if (nt) {
      const trec = await getTension(nt.id);
      const tstep = trec ? renderTension(trec) : null;
      if (tstep && tstep.kind === "tension") {
        catchTable = tstep.table;
        seenTensions = uniq([...progress.seenTensions, nt.id]);
      }
    }
    const r = await renderEntity(rec, userId, { context, catch: catchTable });
    s = r.step;
    usage = r.usage;
    next = { ...progress, seen: uniq([...progress.seen, ref.entityId]), seenTensions };
    recordId = ref.entityId;
  } else if (ref.kind === "tension") {
    const rec = await getTension(ref.tensionId);
    if (!rec) return { step: renderStop(), next: progress };
    s = renderTension(rec);
    next = { ...progress, seenTensions: uniq([...progress.seenTensions, ref.tensionId]) };
    recordId = ref.tensionId;
  } else if (ref.kind === "probe") {
    const rec = await getProbe(ref.probeId);
    if (!rec) return { step: renderStop(), next: progress };
    s = renderProbe(rec);
    recordId = ref.probeId;
  } else {
    s = renderStop();
  }

  await logGesture({
    userId,
    gesture,
    targetEntity: progress.target,
    recordKind: s.kind,
    recordId,
    latencyMs: Date.now() - t0,
    model: usage?.model ?? null,
    tokens: usage?.tokens ?? null,
  });

  return { step: s, next };
}

/** Set (or change) the goal from free text, then advance. Accumulated grasp is
 *  kept across goals (loaded from the persisted session); only the target changes. */
export async function startGoal(state: GuideState, goal: string): Promise<Advance> {
  try {
    const userId = await getUserId(state.sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { step: noVersionStep(), state };

    const match = await classifyGoal(goal, v.id, userId);
    if ("gap" in match) {
      await logGap(goal, userId, v.id); // out-of-corpus -> curation candidate
      return { step: gapStep(goal), state, gap: true };
    }

    const loaded = await loadProgress(userId, toProgress(state));
    const { step: s, next } = await step(userId, v.id, { ...loaded, target: match.entityId }, "goal");
    await saveProgress(userId, v.id, next);
    return { step: s, state: toState(state.sessionId, next) };
  } catch {
    return { step: errorStep(), state };
  }
}

/** Handle the "Ask a follow-up, or set a new goal" box. Unlike startGoal this is
 *  aware of the concept being read: a clarification deepens the CURRENT idea
 *  instead of being re-classified into the nearest neighbour; only a clearly-named
 *  different concept switches; a genuinely off-corpus topic logs a gap. */
export async function ask(state: GuideState, text: string): Promise<Advance> {
  try {
    const userId = await getUserId(state.sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { step: noVersionStep(), state };

    const loaded = await loadProgress(userId, toProgress(state));
    const current = loaded.target != null ? await getEntity(loaded.target) : null;
    const route = await routeAsk(
      text,
      v.id,
      userId,
      current ? { id: current.id, name: current.name } : null,
    );

    if (route.kind === "deepen") {
      // Stay on the current concept and pull its tension (or move on if none left).
      return goDeeper(toState(state.sessionId, loaded), loaded.target!);
    }
    if (route.kind === "gap") {
      await logGap(text, userId, v.id);
      return { step: gapStep(text), state, gap: true };
    }
    const { step: s, next } = await step(userId, v.id, { ...loaded, target: route.entityId }, "goal");
    await saveProgress(userId, v.id, next);
    return { step: s, state: toState(state.sessionId, next), concept: route.name };
  } catch {
    return { step: errorStep(), state };
  }
}

/** Forward: the next Step. */
export async function forward(state: GuideState): Promise<Advance> {
  try {
    const userId = await getUserId(state.sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { step: noVersionStep(), state };
    const loaded = await loadProgress(userId, toProgress(state));
    const { step: s, next } = await step(userId, v.id, loaded, "forward");
    await saveProgress(userId, v.id, next);
    return { step: s, state: toState(state.sessionId, next) };
  } catch {
    return { step: errorStep(), state };
  }
}

/** Answer a probe: record coverage (never a score), then advance. A miss simply
 *  opens the next deeper Step — the concept is marked probed so it won't repeat. */
export async function submitProbe(
  state: GuideState,
  probeId: number,
  response: string,
): Promise<Advance> {
  try {
    const userId = await getUserId(state.sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { step: noVersionStep(), state };

    const loaded = await loadProgress(userId, toProgress(state));
    const probe = await getProbe(probeId);
    if (!probe) {
      const { step: s, next } = await step(userId, v.id, loaded, "probe");
      await saveProgress(userId, v.id, next);
      return { step: s, state: toState(state.sessionId, next) };
    }

    const result = await checkProbe(probe, response, userId);
    const applied: Progress = {
      ...loaded,
      seen: uniq([...loaded.seen, ...probe.conceptIds]),
      probed: uniq([...loaded.probed, ...probe.conceptIds]),
      grasped: result.grasped ? uniq([...loaded.grasped, ...probe.conceptIds]) : loaded.grasped,
    };
    const coverage = {
      covered: result.covered,
      total: probe.expectedSignals.length,
      grasped: result.grasped,
    };

    // BREAKDOWN (SERVE_DESIGN §8): a miss opens the deeper structure right where
    // understanding is thin — the "why" of the probed concept's tension — instead
    // of advancing. A hit just moves on. The miss never traps the learner (the
    // concept is marked probed, so it won't be re-asked).
    if (!result.grasped) {
      const graph = await loadGraph(v.id);
      const concept = probe.conceptIds[0];
      const t =
        probe.tensionId != null
          ? { id: probe.tensionId }
          : concept != null
            ? neighbourhoodTension(graph, concept, [])
            : undefined;
      const bd = t ? await reasoningStep(userId, v.id, t.id, applied.target, "breakdown") : null;
      if (bd) {
        const next: Progress = t
          ? { ...applied, seenTensions: uniq([...applied.seenTensions, t.id]) }
          : applied;
        await saveProgress(userId, v.id, next);
        return { step: bd, state: toState(state.sessionId, next), coverage };
      }
    }

    const { step: s, next } = await step(userId, v.id, applied, "probe");
    await saveProgress(userId, v.id, next);
    return { step: s, state: toState(state.sessionId, next), coverage };
  } catch {
    return { step: errorStep(), state };
  }
}

/** Pull deeper (D2 — the "why", SERVE_DESIGN §9). The catch (the tension table)
 *  is already shown inline at D0; going deeper surfaces the rival *reasoning* — why
 *  each side holds and the premises it rests on (from the TMS). If the concept has
 *  no tension/justification to deepen, move on. */
export async function goDeeper(state: GuideState, entityId: number): Promise<Advance> {
  try {
    const userId = await getUserId(state.sessionId);
    const v = await frozenVersion(SERVE_CORPUS_VERSION);
    if (!v) return { step: noVersionStep(), state };

    const loaded = await loadProgress(userId, toProgress(state));
    const graph = await loadGraph(v.id);
    // Find the concept's tension regardless of seen status — we're deepening the
    // one whose catch already showed, not surfacing a new one.
    const t = neighbourhoodTension(graph, entityId, []);
    const s = t ? await reasoningStep(userId, v.id, t.id, loaded.target, "deeper") : null;
    if (!s) {
      const { step: adv, next } = await step(userId, v.id, loaded, "deeper"); // nothing deeper — move on
      await saveProgress(userId, v.id, next);
      return { step: adv, state: toState(state.sessionId, next) };
    }
    return { step: s, state: toState(state.sessionId, loaded) };
  } catch {
    return { step: errorStep(), state };
  }
}

/** Depth tier 3: the source passages behind a concept (raw records, no model). */
export async function expandSource(entityId: number): Promise<string[]> {
  try {
    return await getProvenanceForEntity(entityId);
  } catch {
    return [];
  }
}
