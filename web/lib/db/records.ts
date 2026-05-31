import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./client";
import {
  corpusVersion,
  entity,
  claim,
  tension,
  probe,
  provenance,
  textUnit,
} from "./schema";

export type EntityRecord = {
  id: number;
  name: string;
  type: string;
  definition: string | null;
  abstraction: string | null;
  paradigm: string | null;
};

export type TensionRecord = {
  id: number;
  dimension: string | null;
  conditionsA: string;
  conditionsB: string;
  claimA: { proposition: string; paradigm: string; thinker: string | null };
  claimB: { proposition: string; paradigm: string; thinker: string | null };
};

export type ProbeRecord = {
  id: number;
  kind: string;
  prompt: string;
  expectedSignals: string[];
  conceptIds: number[];
  tensionId: number | null;
};

/** The single frozen version serve reads (label + frozen). */
export async function frozenVersion(label: string) {
  const rows = await db
    .select()
    .from(corpusVersion)
    .where(and(eq(corpusVersion.label, label), isNotNull(corpusVersion.frozenAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEntity(id: number): Promise<EntityRecord | null> {
  const rows = await db.select().from(entity).where(eq(entity.id, id)).limit(1);
  const e = rows[0];
  return e
    ? {
        id: e.id,
        name: e.name,
        type: e.type,
        definition: e.definition,
        abstraction: e.abstraction,
        paradigm: e.paradigm,
      }
    : null;
}

export async function getEntitiesForVersion(versionId: number): Promise<EntityRecord[]> {
  const rows = await db
    .select()
    .from(entity)
    .where(eq(entity.corpusVersion, versionId));
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    definition: e.definition,
    abstraction: e.abstraction,
    paradigm: e.paradigm,
  }));
}

export async function getTension(id: number): Promise<TensionRecord | null> {
  const rows = await db.select().from(tension).where(eq(tension.id, id)).limit(1);
  const t = rows[0];
  if (!t) return null;
  const claims = await db
    .select({
      id: claim.id,
      proposition: claim.proposition,
      paradigm: claim.paradigm,
      thinker: claim.thinker,
    })
    .from(claim)
    .where(inArray(claim.id, [t.claimA, t.claimB]));
  const byId = new Map(claims.map((c) => [c.id, c]));
  const a = byId.get(t.claimA)!;
  const b = byId.get(t.claimB)!;
  return {
    id: t.id,
    dimension: t.dimension,
    conditionsA: t.conditionsA,
    conditionsB: t.conditionsB,
    claimA: { proposition: a.proposition, paradigm: a.paradigm, thinker: a.thinker },
    claimB: { proposition: b.proposition, paradigm: b.paradigm, thinker: b.thinker },
  };
}

export async function getProbe(id: number): Promise<ProbeRecord | null> {
  const rows = await db.select().from(probe).where(eq(probe.id, id)).limit(1);
  const p = rows[0];
  return p
    ? {
        id: p.id,
        kind: p.kind,
        prompt: p.prompt,
        expectedSignals: p.expectedSignals ?? [],
        conceptIds: p.conceptIds ?? [],
        tensionId: p.tensionId,
      }
    : null;
}

/** Depth tier 3: the source passages behind a concept's claims (raw, no model). */
export async function getProvenanceForEntity(entityId: number): Promise<string[]> {
  const rows = await db
    .select({ text: textUnit.text, claimId: provenance.claimId, conceptIds: claim.conceptIds })
    .from(provenance)
    .innerJoin(claim, eq(claim.id, provenance.claimId))
    .innerJoin(textUnit, eq(textUnit.id, provenance.textUnitId));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!(r.conceptIds ?? []).includes(entityId)) continue;
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    out.push(r.text);
  }
  return out;
}
