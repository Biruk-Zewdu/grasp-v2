import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./client";
import {
  corpusVersion,
  entity,
  relation,
  claim,
  tension,
  probe,
  provenance,
  textUnit,
  beliefNode,
  justification,
} from "./schema";
import { assembleSide } from "@/lib/reasoning/assemble";

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

// The grounded reasoner's substrate (SERVE_DESIGN §9): the typed records around a
// concept that the model is allowed to reason OVER (and only over). Outgoing
// relations + the claims asserted about the concept. NOT the whole graph — the
// node's neighbourhood, so the model synthesises without fabricating.
export type ConceptContext = {
  relations: { relType: string; name: string }[];
  claims: {
    proposition: string;
    thinker: string | null;
    paradigm: string;
    conditions: string | null;
  }[];
};

export async function getConceptContext(
  entityId: number,
  versionId: number,
): Promise<ConceptContext> {
  const [rels, claims] = await Promise.all([
    db
      .select({ relType: relation.relType, name: entity.name })
      .from(relation)
      .innerJoin(entity, eq(entity.id, relation.toEntity))
      .where(and(eq(relation.corpusVersion, versionId), eq(relation.fromEntity, entityId))),
    db
      .select({
        proposition: claim.proposition,
        thinker: claim.thinker,
        paradigm: claim.paradigm,
        conditions: claim.conditions,
        conceptIds: claim.conceptIds,
      })
      .from(claim)
      .where(eq(claim.corpusVersion, versionId)),
  ]);
  return {
    relations: rels.map((r) => ({ relType: r.relType, name: r.name })),
    claims: claims
      .filter((c) => (c.conceptIds ?? []).includes(entityId))
      .map((c) => ({
        proposition: c.proposition,
        thinker: c.thinker,
        paradigm: c.paradigm,
        conditions: c.conditions,
      })),
  };
}

// Depth tier 2 — the "why" (SERVE_DESIGN §9). For a tension, each side's claim
// plus its TMS justification: the rationale and the premise propositions it rests
// on (resolved from the dependency network db/belief.py built). The reasoner
// explains the why from this; it never invents a justification.
export type TensionReasoning = {
  dimension: string | null;
  sideA: { label: string; proposition: string; rationale: string | null; premises: string[] };
  sideB: { label: string; proposition: string; rationale: string | null; premises: string[] };
};

export async function getTensionReasoning(
  tensionId: number,
  versionId: number,
): Promise<TensionReasoning | null> {
  const trows = await db.select().from(tension).where(eq(tension.id, tensionId)).limit(1);
  const t = trows[0];
  if (!t) return null;

  const [claims, bnodes, justs] = await Promise.all([
    db
      .select({
        id: claim.id,
        proposition: claim.proposition,
        paradigm: claim.paradigm,
        thinker: claim.thinker,
      })
      .from(claim)
      .where(eq(claim.corpusVersion, versionId)),
    db.select({ id: beliefNode.id, claimId: beliefNode.claimId }).from(beliefNode),
    db
      .select({
        beliefNode: justification.beliefNode,
        antecedentBeliefIds: justification.antecedentBeliefIds,
        rationale: justification.rationale,
      })
      .from(justification),
  ]);

  const claimProps = new Map(claims.map((c) => [c.id, c.proposition]));
  const meta = new Map(claims.map((c) => [c.id, c]));
  const side = (cid: number) => {
    const m = meta.get(cid);
    const r = assembleSide(cid, bnodes, justs, claimProps);
    return {
      label: m ? `${m.paradigm}${m.thinker ? ` (${m.thinker})` : ""}` : "",
      proposition: m?.proposition ?? "",
      rationale: r.rationale,
      premises: r.premises,
    };
  };
  return { dimension: t.dimension, sideA: side(t.claimA), sideB: side(t.claimB) };
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
