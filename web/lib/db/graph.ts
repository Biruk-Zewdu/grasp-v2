import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { entity, relation, claim, tension, probe } from "./schema";
import type { SeqGraph, Abstraction } from "@/lib/sequencer";

// Build the sequencer's in-memory graph from one frozen corpus version.
// Prerequisite edges come from composed_of / specializes: `from` depends on `to`,
// so `to` is a prerequisite of `from` (e.g. "reinforcement learning composed_of
// policy" => grasp policy before reinforcement learning).
const PREREQ_RELS = ["composed_of", "specializes"] as const;

export async function loadGraph(versionId: number): Promise<SeqGraph> {
  const [ents, rels, allRels, claims, tensions, probes] = await Promise.all([
    db
      .select({ id: entity.id, name: entity.name, abstraction: entity.abstraction })
      .from(entity)
      .where(eq(entity.corpusVersion, versionId)),
    db
      .select({ from: relation.fromEntity, rel: relation.relType, to: relation.toEntity })
      .from(relation)
      .where(
        and(
          eq(relation.corpusVersion, versionId),
          inArray(relation.relType, PREREQ_RELS),
        ),
      ),
    db
      .select({ from: relation.fromEntity, to: relation.toEntity })
      .from(relation)
      .where(eq(relation.corpusVersion, versionId)),
    db
      .select({ id: claim.id, conceptIds: claim.conceptIds })
      .from(claim)
      .where(eq(claim.corpusVersion, versionId)),
    db
      .select({ id: tension.id, a: tension.claimA, b: tension.claimB })
      .from(tension)
      .where(eq(tension.corpusVersion, versionId)),
    db
      .select({ id: probe.id, conceptIds: probe.conceptIds, tensionId: probe.tensionId })
      .from(probe)
      .where(eq(probe.corpusVersion, versionId)),
  ]);

  const conceptsByClaim = new Map<number, number[]>(
    claims.map((c) => [c.id, c.conceptIds ?? []]),
  );

  // undirected neighborhood for tension matching
  const related = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!related.has(a)) related.set(a, []);
    related.get(a)!.push(b);
  };
  for (const r of allRels) {
    link(r.from, r.to);
    link(r.to, r.from);
  }

  return {
    entities: new Map(
      ents.map((e) => [
        e.id,
        { id: e.id, name: e.name, abstraction: (e.abstraction as Abstraction) ?? null },
      ]),
    ),
    prereqs: rels.map((r) => ({ from: r.from, to: r.to })),
    tensions: tensions.map((t) => ({
      id: t.id,
      conceptIds: [
        ...new Set([...(conceptsByClaim.get(t.a) ?? []), ...(conceptsByClaim.get(t.b) ?? [])]),
      ],
    })),
    probes: probes.map((p) => ({
      id: p.id,
      conceptIds: p.conceptIds ?? [],
      tensionId: p.tensionId ?? null,
    })),
    related,
  };
}
