import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./client";
import { corpusVersion, entity, claim, tension, provenance, textUnit, subtopic } from "./schema";
import type { Catalog } from "@/lib/guide/types";

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

/** A subtopic's title/summary/concepts — for the lesson generator. */
export async function getSubtopic(
  id: number,
): Promise<{ id: number; title: string; summary: string | null; conceptIds: number[]; corpusVersion: number } | null> {
  const rows = await db
    .select({
      id: subtopic.id,
      title: subtopic.title,
      summary: subtopic.summary,
      conceptIds: subtopic.conceptIds,
      corpusVersion: subtopic.corpusVersion,
    })
    .from(subtopic)
    .where(eq(subtopic.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** A ready example/frozen version, if any — the "explore an example" shortcut. */
export async function exampleVersion(): Promise<{ id: number } | null> {
  const frozen = await db
    .select({ id: corpusVersion.id })
    .from(corpusVersion)
    .where(isNotNull(corpusVersion.frozenAt))
    .limit(1);
  if (frozen[0]) return frozen[0];
  const ex = await db
    .select({ id: corpusVersion.id })
    .from(corpusVersion)
    .where(and(eq(corpusVersion.origin, "example"), eq(corpusVersion.status, "ready")))
    .limit(1);
  return ex[0] ?? null;
}

/** Resolve which artifact a session learns over. v2 prefers an explicit uploaded
 *  version id; falls back to the frozen/example corpus by label. Returns null if
 *  neither resolves (no DB / nothing built). */
export async function resolveVersion(
  versionId: number | null,
  fallbackLabel: string,
): Promise<{ id: number } | null> {
  if (versionId != null) {
    const rows = await db
      .select({ id: corpusVersion.id, status: corpusVersion.status })
      .from(corpusVersion)
      .where(eq(corpusVersion.id, versionId))
      .limit(1);
    if (rows[0] && rows[0].status === "ready") return { id: rows[0].id };
  }
  const fz = await frozenVersion(fallbackLabel);
  if (fz) return { id: fz.id };
  // last resort: any ready example version
  const ex = await db
    .select({ id: corpusVersion.id })
    .from(corpusVersion)
    .where(and(eq(corpusVersion.origin, "example"), eq(corpusVersion.status, "ready")))
    .limit(1);
  return ex[0] ?? null;
}

/** A built/building uploaded version's status — for the reveal UI to poll. */
export async function versionStatus(
  versionId: number,
): Promise<{ id: number; status: string; sourceName: string | null } | null> {
  const rows = await db
    .select({ id: corpusVersion.id, status: corpusVersion.status, sourceName: corpusVersion.sourceName })
    .from(corpusVersion)
    .where(eq(corpusVersion.id, versionId))
    .limit(1);
  return rows[0] ?? null;
}

/** The single frozen version serve reads (label + frozen). */
export async function frozenVersion(label: string) {
  const rows = await db
    .select()
    .from(corpusVersion)
    .where(and(eq(corpusVersion.label, label), isNotNull(corpusVersion.frozenAt)))
    .limit(1);
  return rows[0] ?? null;
}

// The whole frozen artifact, serialized as the agent's grounded system context
// (SERVE_DESIGN §9 / agentic model). It's small and frozen, so we build it once
// per version and cache in memory — the model reasons over ALL of it, grounded.
const _artifactContext = new Map<number, string>();

export async function getArtifactContext(versionId: number): Promise<string> {
  const hit = _artifactContext.get(versionId);
  if (hit) return hit;

  const [ents, claims, tensions] = await Promise.all([
    db
      .select({ id: entity.id, name: entity.name, definition: entity.definition })
      .from(entity)
      .where(eq(entity.corpusVersion, versionId)),
    db
      .select({
        id: claim.id,
        proposition: claim.proposition,
        paradigm: claim.paradigm,
        thinker: claim.thinker,
        conditions: claim.conditions,
      })
      .from(claim)
      .where(eq(claim.corpusVersion, versionId)),
    db
      .select({
        id: tension.id,
        dimension: tension.dimension,
        claimA: tension.claimA,
        claimB: tension.claimB,
        conditionsA: tension.conditionsA,
        conditionsB: tension.conditionsB,
      })
      .from(tension)
      .where(eq(tension.corpusVersion, versionId)),
  ]);

  const claimById = new Map(claims.map((c) => [c.id, c]));
  const side = (id: number, cond: string) => {
    const c = claimById.get(id);
    if (!c) return "(missing)";
    const who = `${c.paradigm}${c.thinker ? `/${c.thinker}` : ""}`;
    return `${who}: ${c.proposition} — holds when ${cond}`;
  };

  const conceptLines = ents
    .map((e) => `${e.id}: ${e.name} — ${e.definition ?? ""}`)
    .join("\n");
  const tensionLines = tensions
    .map(
      (t) =>
        `${t.id}: ${t.dimension ?? "(contested)"}\n` +
        `   A) ${side(t.claimA, t.conditionsA)}\n` +
        `   B) ${side(t.claimB, t.conditionsB)}`,
    )
    .join("\n");
  const claimLines = claims
    .map(
      (c) =>
        `- ${c.proposition} (${c.paradigm}${c.thinker ? `/${c.thinker}` : ""})` +
        (c.conditions ? ` — when ${c.conditions}` : ""),
    )
    .join("\n");

  const ctx =
    `# CONCEPTS (id: name — definition)\n${conceptLines}\n\n` +
    `# TENSIONS (id: contested dimension, with both sides + when each holds)\n${tensionLines}\n\n` +
    `# CLAIMS\n${claimLines}`;
  _artifactContext.set(versionId, ctx);
  return ctx;
}

/** The dashboard browse catalog: contested "big questions" (tension dimensions,
 *  shortened to the head before the colon) + "key ideas" (concept names A–Z). */
export async function getCatalog(versionId: number): Promise<Catalog> {
  const [ents, tens, subs] = await Promise.all([
    db.select({ id: entity.id, name: entity.name }).from(entity).where(eq(entity.corpusVersion, versionId)),
    db.select({ id: tension.id, dimension: tension.dimension }).from(tension).where(eq(tension.corpusVersion, versionId)),
    db
      .select({ id: subtopic.id, title: subtopic.title, summary: subtopic.summary, ordinal: subtopic.ordinal })
      .from(subtopic)
      .where(eq(subtopic.corpusVersion, versionId)),
  ]);
  const shortQ = (dim: string | null): string => {
    if (!dim) return "";
    const head = dim.split(":")[0].trim();
    return head ? head.charAt(0).toUpperCase() + head.slice(1) + "?" : "";
  };
  return {
    subtopics: subs
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => ({ id: s.id, title: s.title, summary: s.summary })),
    questions: tens.map((t) => ({ id: t.id, text: shortQ(t.dimension) })).filter((q) => q.text),
    ideas: ents
      .map((e) => ({ id: e.id, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Concepts (id, name, definition) — used by the deterministic template fallback. */
export async function getEntitiesForVersion(versionId: number): Promise<EntityRecord[]> {
  const rows = await db.select().from(entity).where(eq(entity.corpusVersion, versionId));
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    definition: e.definition,
    abstraction: e.abstraction,
    paradigm: e.paradigm,
  }));
}

/** Name + definition for a set of concept ids — for inline glossing and the
 *  Foundations Path rungs (definitions stay the artifact's, verbatim). */
export async function getConceptBriefs(
  ids: number[],
): Promise<{ id: number; name: string; definition: string | null }[]> {
  if (!ids.length) return [];
  return db
    .select({ id: entity.id, name: entity.name, definition: entity.definition })
    .from(entity)
    .where(inArray(entity.id, ids));
}

/** A single tension as the verbatim two-column record (cells the model never writes). */
export async function getTension(id: number): Promise<TensionRecord | null> {
  const rows = await db.select().from(tension).where(eq(tension.id, id)).limit(1);
  const t = rows[0];
  if (!t) return null;
  const claims = await db
    .select({
      id: claim.id,
      proposition: claim.proposition,
      paradigm: claim.paradigm,
      paradigmLabel: claim.paradigmLabel,
      thinker: claim.thinker,
    })
    .from(claim)
    .where(inArray(claim.id, [t.claimA, t.claimB]));
  const byId = new Map(claims.map((c) => [c.id, c]));
  const a = byId.get(t.claimA)!;
  const b = byId.get(t.claimB)!;
  // v2: a detected tension may name its own sides (free-text), else fall back to
  // the claim's enum paradigm or its free-text label. Always resolves to a string.
  const label = (
    side: string | null,
    cParadigm: string | null,
    cLabel: string | null,
  ): string => side ?? cParadigm ?? cLabel ?? "";
  return {
    id: t.id,
    dimension: t.dimension,
    conditionsA: t.conditionsA,
    conditionsB: t.conditionsB,
    claimA: {
      proposition: a.proposition,
      paradigm: label(t.paradigmLabelA, a.paradigm, a.paradigmLabel),
      thinker: t.thinkerA ?? a.thinker,
    },
    claimB: {
      proposition: b.proposition,
      paradigm: label(t.paradigmLabelB, b.paradigm, b.paradigmLabel),
      thinker: t.thinkerB ?? b.thinker,
    },
  };
}

/** The source passages behind a concept's claims (raw, no model) — provenance pull. */
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
