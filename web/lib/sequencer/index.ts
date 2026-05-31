// Deterministic means-ends sequencer. PURE: no model, no network, no clock (g5).
// Picks the single next Step that most reduces the "difference" between the
// learner's grasped state and the goal concept. Unit-testable over a fixture
// graph (see index.test.ts).

export type Abstraction =
  | "foundational"
  | "paradigmatic"
  | "mechanism"
  | "instance"
  | "example";

const RANK: Record<Abstraction, number> = {
  foundational: 4,
  paradigmatic: 3,
  mechanism: 2,
  instance: 1,
  example: 0,
};

export interface SeqEntity {
  id: number;
  name: string;
  abstraction: Abstraction | null;
}

/** `from` depends on `to` — `to` is a prerequisite of `from`
 *  (built from composed_of / specializes edges toward the target). */
export interface PrereqEdge {
  from: number;
  to: number;
}

/** A tension and the concept ids it involves (union of its two claims' concepts). */
export interface SeqTension {
  id: number;
  conceptIds: number[];
}

export interface SeqProbe {
  id: number;
  conceptIds: number[];
  tensionId: number | null;
}

export interface SeqGraph {
  entities: Map<number, SeqEntity>;
  prereqs: PrereqEdge[];
  tensions: SeqTension[];
  probes: SeqProbe[];
  /** Optional: concept -> directly-related concept ids (any relation, both
   *  directions). Lets a concept surface a tension in its neighborhood (e.g.
   *  "reinforcement learning" -> the reward-vs-management tension keyed to
   *  "reward hypothesis"). Falls back to direct conceptId match when absent. */
  related?: Map<number, number[]>;
}

export interface SeqState {
  target: number;
  seen: number[]; // concept ids whose briefing was shown
  grasped: number[]; // concept ids demonstrated via a probe (probe hit)
  probed: number[]; // concept ids already probed (hit OR miss) — never re-probe
  seenTensions: number[]; // tension ids already surfaced
}

export type StepRef =
  | { kind: "entity"; entityId: number }
  | { kind: "probe"; probeId: number }
  | { kind: "tension"; tensionId: number }
  | { kind: "stop" };

function transitivePrereqs(graph: SeqGraph, target: number): Set<number> {
  const out = new Set<number>();
  const frontier = [target];
  const seen = new Set<number>([target]);
  while (frontier.length) {
    const cur = frontier.pop()!;
    for (const e of graph.prereqs) {
      if (e.from === cur && !seen.has(e.to)) {
        seen.add(e.to);
        out.add(e.to);
        frontier.push(e.to);
      }
    }
  }
  return out;
}

function directPrereqs(graph: SeqGraph, id: number): number[] {
  return graph.prereqs.filter((e) => e.from === id).map((e) => e.to);
}

function abstractionRank(graph: SeqGraph, id: number): number {
  const a = graph.entities.get(id)?.abstraction;
  return a ? RANK[a] : -1;
}

/** A concept-probe for an ungrasped, already-seen concept (seen -> grasped). */
function conceptProbeFor(graph: SeqGraph, id: number): SeqProbe | undefined {
  return graph.probes.find((p) => p.tensionId === null && p.conceptIds.includes(id));
}

// A concept stops blocking once grasped OR probed (a missed probe opens depth, it
// does not trap the learner re-answering the same question). Only needs the
// settled-sets, so it accepts any progress-shaped value (e.g. Progress).
type Settled = Pick<SeqState, "grasped" | "probed">;
function isDone(state: Settled, id: number): boolean {
  return state.grasped.includes(id) || state.probed.includes(id);
}

// The unsurfaced tension in the target's neighbourhood (itself or a directly
// related concept), or null. The "catch" the learner hasn't met yet.
function openTension(graph: SeqGraph, state: SeqState): number | null {
  const seen = new Set(state.seenTensions);
  const relevant = new Set<number>([state.target, ...(graph.related?.get(state.target) ?? [])]);
  const t = graph.tensions.find(
    (x) => !seen.has(x.id) && x.conceptIds.some((c) => relevant.has(c)),
  );
  return t ? t.id : null;
}

/** The learner's gap toward the goal, as a typed vector over the relevant set
 *  (SERVE_DESIGN §5). The connection table in nextStep reduces these in priority
 *  order; satisficed() is true when the vector is empty on the spine. */
export interface Difference {
  unsettledPrereqs: number[]; // transitive prereqs of the target not yet done
  targetSeen: boolean; // the target's own briefing has been shown (D0)
  targetDone: boolean; // the target is grasped or probed (settled)
  openTensionId: number | null; // an unsurfaced tension in the target's neighbourhood
}

export function difference(graph: SeqGraph, state: SeqState): Difference {
  return {
    unsettledPrereqs: [...transitivePrereqs(graph, state.target)].filter(
      (p) => !isDone(state, p),
    ),
    targetSeen: state.seen.includes(state.target),
    targetDone: isDone(state, state.target),
    openTensionId: openTension(graph, state),
  };
}

/** Satisfice (SERVE_DESIGN §7): a good-enough grip on the TARGET — its briefing
 *  seen, it's grasped/probed, and its tension surfaced. Prerequisites are NOT
 *  required: we economise the learner's capacity and trust they may already hold
 *  the foundations (begin at the difference, not a syllabus — §2). A foundation
 *  surfaces only when a breakdown reveals it's actually missing (nextPrereq). */
export function satisficed(graph: SeqGraph, state: SeqState): boolean {
  const d = difference(graph, state);
  return d.targetSeen && d.targetDone && d.openTensionId === null;
}

/** Scaffolding on demand: the deepest unmet prerequisite of `conceptId`, or null.
 *  Surfaced only when a breakdown (a missed concept probe) reveals a foundation is
 *  missing — never front-loaded ahead of the learner's actual goal. */
export function nextPrereq(graph: SeqGraph, state: Settled, conceptId: number): number | null {
  const unmet = [...transitivePrereqs(graph, conceptId)].filter((p) => !isDone(state, p));
  return unmet.length ? selectPrereq(graph, state, unmet) : null;
}

// Which unsettled prerequisite to reduce first: one that is "ready" (its own
// prereqs settled), most foundational, then lowest id — deterministic.
function selectPrereq(graph: SeqGraph, state: Settled, prereqs: number[]): number {
  const ready = prereqs.filter((p) => directPrereqs(graph, p).every((d) => isDone(state, d)));
  const pool = ready.length ? ready : prereqs;
  return [...pool].sort(
    (a, b) => abstractionRank(graph, b) - abstractionRank(graph, a) || a - b,
  )[0];
}

/**
 * The next Step — TARGET-FIRST (SERVE_DESIGN §2, §6). The forward walk begins at
 * the concept the learner asked about and stays on it; prerequisites are NOT a
 * forced prefix (they surface only on a breakdown — see nextPrereq). Pure — no
 * model, no network, no clock.
 *
 *   target unseen          -> Briefing the target (its catch ships inline)
 *   target undemonstrated  -> Probe the target
 *   open tension           -> the Catch
 *   nothing left           -> satisfice (good-enough grip on the target)
 */
export function nextStep(graph: SeqGraph, state: SeqState): StepRef {
  const d = difference(graph, state);

  if (!d.targetSeen) return { kind: "entity", entityId: state.target };

  if (!d.targetDone) {
    const probe = conceptProbeFor(graph, state.target);
    if (probe) return { kind: "probe", probeId: probe.id };
  }

  if (d.openTensionId !== null) return { kind: "tension", tensionId: d.openTensionId };

  return { kind: "stop" };
}
