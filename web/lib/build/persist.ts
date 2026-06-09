import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  corpusVersion,
  source,
  textUnit,
  entity,
  relation,
  claim,
  provenance,
  tension,
  subtopic,
} from "@/lib/db/schema";
import type { TextUnit } from "./normalize";
import type { Artifact } from "./extract";

// Persist a freshly-extracted artifact as a NEW corpus_version (origin='uploaded').
// Concept references in claims/relations/tension/subtopics are by NAME in the
// extractor output; here we resolve them to the inserted entity ids. Provenance is
// anchored by paragraph index → the text_unit row. The version is created with
// status='building' by the caller and flipped to 'ready' on success.

export type PersistResult = { versionId: number; conceptCount: number; hasTension: boolean };

/** Create the building version up front so the reveal UI can poll its status. */
export async function createBuildingVersion(
  label: string,
  owner: string | null,
  sourceName: string,
): Promise<number> {
  const [v] = await db
    .insert(corpusVersion)
    .values({ label, origin: "uploaded", owner, status: "building", sourceName })
    .returning({ id: corpusVersion.id });
  return v.id;
}

export async function markFailed(versionId: number): Promise<void> {
  try {
    await db.update(corpusVersion).set({ status: "failed" }).where(eqVersion(versionId));
  } catch {
    /* best-effort */
  }
}

function eqVersion(id: number) {
  return eq(corpusVersion.id, id);
}

/** Write the whole artifact under `versionId`, then flip the version to ready. */
export async function persistArtifact(
  versionId: number,
  units: TextUnit[],
  artifact: Artifact,
): Promise<PersistResult> {
  // 1. source + text units (provenance anchors).
  const [src] = await db
    .insert(source)
    .values({ kind: "paper", title: artifact.title, corpusVersion: versionId })
    .returning({ id: source.id });

  const unitRows = await db
    .insert(textUnit)
    .values(
      units.map((u) => ({
        sourceId: src.id,
        section: u.section,
        paragraphIndex: u.paragraphIndex,
        charStart: u.charStart,
        charEnd: u.charEnd,
        text: u.text,
        corpusVersion: versionId,
      })),
    )
    .returning({ id: textUnit.id, paragraphIndex: textUnit.paragraphIndex });
  const unitByPara = new Map(unitRows.map((r) => [r.paragraphIndex, r.id]));

  // 2. concepts (entities). Map name → id for later reference resolution.
  const conceptByName = new Map<string, number>();
  if (artifact.concepts.length) {
    const entRows = await db
      .insert(entity)
      .values(
        artifact.concepts.map((c) => ({
          name: c.name,
          type: "Mechanism" as const, // generic for uploads; v1's fine-grained typing was course-specific
          definition: c.definition,
          sourceIds: [src.id],
          corpusVersion: versionId,
        })),
      )
      .returning({ id: entity.id, name: entity.name });
    for (const r of entRows) conceptByName.set(r.name, r.id);
  }
  const ids = (names: string[]): number[] =>
    names.map((n) => conceptByName.get(n)).filter((x): x is number => x != null);

  // 3. relations (skip any whose endpoints didn't resolve).
  const relValues = artifact.relations
    .map((r) => ({ from: conceptByName.get(r.from), to: conceptByName.get(r.to), r }))
    .filter((x) => x.from != null && x.to != null)
    .map((x) => ({
      fromEntity: x.from!,
      relType: x.r.relType,
      toEntity: x.to!,
      evidence: x.r.evidence,
      sourceIds: [src.id],
      corpusVersion: versionId,
    }));
  if (relValues.length) await db.insert(relation).values(relValues);

  // 4. claims + provenance (I2: every claim gets >=1 provenance row).
  const claimIdByProp = new Map<string, number>();
  for (const c of artifact.claims) {
    const [cr] = await db
      .insert(claim)
      .values({
        proposition: c.proposition,
        conceptIds: ids(c.conceptNames),
        claimType: c.claimType,
        thinker: c.thinker,
        paradigmLabel: c.paradigmLabel,
        conditions: c.conditions,
        status: "default",
        sourceId: src.id,
        corpusVersion: versionId,
      })
      .returning({ id: claim.id });
    claimIdByProp.set(c.proposition, cr.id);

    const provRows = c.paragraphRefs
      .map((p) => unitByPara.get(p))
      .filter((x): x is number => x != null)
      .map((tuId) => ({
        claimId: cr.id,
        sourceKind: "paper" as const,
        textUnitId: tuId,
        assertedBy: "extractor",
      }));
    // I2 fallback: if the model cited no resolvable paragraph, anchor to unit 0
    // so the claim still has provenance (never a dangling claim).
    if (provRows.length) {
      await db.insert(provenance).values(provRows);
    } else if (unitRows.length) {
      await db.insert(provenance).values({
        claimId: cr.id,
        sourceKind: "paper",
        textUnitId: unitRows[0].id,
        assertedBy: "extractor",
      });
    }
  }

  // 5. the tension, if one was detected (two new claims for its sides + the row).
  if (artifact.hasTension && artifact.tension) {
    const t = artifact.tension;
    const mkSideClaim = async (prop: string, label: string, thinker: string | null) => {
      const [cr] = await db
        .insert(claim)
        .values({
          proposition: prop,
          conceptIds: [],
          claimType: "contradictory",
          thinker,
          paradigmLabel: label,
          status: "contested",
          sourceId: src.id,
          corpusVersion: versionId,
        })
        .returning({ id: claim.id });
      if (unitRows.length)
        await db.insert(provenance).values({
          claimId: cr.id,
          sourceKind: "paper",
          textUnitId: unitRows[0].id,
          assertedBy: "extractor",
        });
      return cr.id;
    };
    const aId = await mkSideClaim(t.sideAClaim, t.sideALabel, t.sideAThinker);
    const bId = await mkSideClaim(t.sideBClaim, t.sideBLabel, t.sideBThinker);
    await db.insert(tension).values({
      claimA: aId,
      claimB: bId,
      dimension: t.dimension,
      conditionsA: t.sideAConditions,
      conditionsB: t.sideBConditions,
      paradigmLabelA: t.sideALabel,
      paradigmLabelB: t.sideBLabel,
      thinkerA: t.sideAThinker,
      thinkerB: t.sideBThinker,
      corpusVersion: versionId,
    });
  }

  // 6. subtopics (the decomposition / lesson rail).
  if (artifact.subtopics.length) {
    await db.insert(subtopic).values(
      artifact.subtopics.map((s, i) => ({
        title: s.title,
        summary: s.summary,
        conceptIds: ids(s.conceptNames),
        ordinal: i,
        corpusVersion: versionId,
      })),
    );
  }

  // 7. flip to ready.
  await db
    .update(corpusVersion)
    .set({ status: "ready", builtAt: new Date().toISOString() })
    .where(eqVersion(versionId));

  return {
    versionId,
    conceptCount: artifact.concepts.length,
    hasTension: artifact.hasTension,
  };
}
