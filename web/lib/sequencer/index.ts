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
}

export interface SeqState {
  target: number;
  seen: number[]; // concept ids whose briefing was shown
  grasped: number[]; // concept ids demonstrated via a probe
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

/**
 * The next Step. Order of difference-reduction:
 *  1. an ungrasped prerequisite of the target (foundations first; probe it if it
 *     was already shown but not yet demonstrated),
 *  2. the target's own briefing, then its probe,
 *  3. the nearest unsurfaced tension involving the target,
 *  4. otherwise satisfice (stop).
 */
export function nextStep(graph: SeqGraph, state: SeqState): StepRef {
  const grasped = new Set(state.grasped);
  const seen = new Set(state.seen);
  const seenTensions = new Set(state.seenTensions);

  // 1. ungrasped prerequisites
  const prereqs = [...transitivePrereqs(graph, state.target)].filter(
    (p) => !grasped.has(p),
  );
  if (prereqs.length) {
    // prefer a prereq that is "ready" (all its own prereqs grasped), most
    // foundational first, then lowest id — deterministic.
    const ready = prereqs.filter((p) =>
      directPrereqs(graph, p).every((d) => grasped.has(d)),
    );
    const pool = ready.length ? ready : prereqs;
    const pick = [...pool].sort(
      (a, b) => abstractionRank(graph, b) - abstractionRank(graph, a) || a - b,
    )[0];

    if (seen.has(pick)) {
      const probe = conceptProbeFor(graph, pick);
      if (probe) return { kind: "probe", probeId: probe.id };
    }
    return { kind: "entity", entityId: pick };
  }

  // 2. the target itself
  if (!seen.has(state.target)) return { kind: "entity", entityId: state.target };
  if (!grasped.has(state.target)) {
    const probe = conceptProbeFor(graph, state.target);
    if (probe) return { kind: "probe", probeId: probe.id };
  }

  // 3. nearest unsurfaced tension involving the target
  const tension = graph.tensions.find(
    (t) => t.conceptIds.includes(state.target) && !seenTensions.has(t.id),
  );
  if (tension) return { kind: "tension", tensionId: tension.id };

  // 4. satisfice
  return { kind: "stop" };
}
