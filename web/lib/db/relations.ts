import { relations } from "drizzle-orm/relations";
import { corpusVersion, source, textUnit, entity, relation, claim, provenance, beliefNode, justification, tension, viewpoint, probe } from "./schema";

export const sourceRelations = relations(source, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [source.corpusVersion],
		references: [corpusVersion.id]
	}),
	textUnits: many(textUnit),
	claims: many(claim),
	probes: many(probe),
}));

export const corpusVersionRelations = relations(corpusVersion, ({many}) => ({
	sources: many(source),
	textUnits: many(textUnit),
	entities: many(entity),
	relations: many(relation),
	claims: many(claim),
	tensions: many(tension),
	probes: many(probe),
}));

export const textUnitRelations = relations(textUnit, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [textUnit.corpusVersion],
		references: [corpusVersion.id]
	}),
	source: one(source, {
		fields: [textUnit.sourceId],
		references: [source.id]
	}),
	provenances: many(provenance),
}));

export const entityRelations = relations(entity, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [entity.corpusVersion],
		references: [corpusVersion.id]
	}),
	relations_fromEntity: many(relation, {
		relationName: "relation_fromEntity_entity_id"
	}),
	relations_toEntity: many(relation, {
		relationName: "relation_toEntity_entity_id"
	}),
}));

export const relationRelations = relations(relation, ({one}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [relation.corpusVersion],
		references: [corpusVersion.id]
	}),
	entity_fromEntity: one(entity, {
		fields: [relation.fromEntity],
		references: [entity.id],
		relationName: "relation_fromEntity_entity_id"
	}),
	entity_toEntity: one(entity, {
		fields: [relation.toEntity],
		references: [entity.id],
		relationName: "relation_toEntity_entity_id"
	}),
}));

export const claimRelations = relations(claim, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [claim.corpusVersion],
		references: [corpusVersion.id]
	}),
	source: one(source, {
		fields: [claim.sourceId],
		references: [source.id]
	}),
	provenances: many(provenance),
	beliefNodes: many(beliefNode),
	tensions_claimA: many(tension, {
		relationName: "tension_claimA_claim_id"
	}),
	tensions_claimB: many(tension, {
		relationName: "tension_claimB_claim_id"
	}),
	viewpoints: many(viewpoint),
}));

export const provenanceRelations = relations(provenance, ({one}) => ({
	claim: one(claim, {
		fields: [provenance.claimId],
		references: [claim.id]
	}),
	textUnit: one(textUnit, {
		fields: [provenance.textUnitId],
		references: [textUnit.id]
	}),
}));

export const beliefNodeRelations = relations(beliefNode, ({one, many}) => ({
	claim: one(claim, {
		fields: [beliefNode.claimId],
		references: [claim.id]
	}),
	justifications: many(justification),
}));

export const justificationRelations = relations(justification, ({one}) => ({
	beliefNode: one(beliefNode, {
		fields: [justification.beliefNode],
		references: [beliefNode.id]
	}),
}));

export const tensionRelations = relations(tension, ({one, many}) => ({
	claim_claimA: one(claim, {
		fields: [tension.claimA],
		references: [claim.id],
		relationName: "tension_claimA_claim_id"
	}),
	claim_claimB: one(claim, {
		fields: [tension.claimB],
		references: [claim.id],
		relationName: "tension_claimB_claim_id"
	}),
	corpusVersion: one(corpusVersion, {
		fields: [tension.corpusVersion],
		references: [corpusVersion.id]
	}),
	probes: many(probe),
}));

export const viewpointRelations = relations(viewpoint, ({one, many}) => ({
	claim: one(claim, {
		fields: [viewpoint.claimId],
		references: [claim.id]
	}),
	viewpoint: one(viewpoint, {
		fields: [viewpoint.supersededBy],
		references: [viewpoint.id],
		relationName: "viewpoint_supersededBy_viewpoint_id"
	}),
	viewpoints: many(viewpoint, {
		relationName: "viewpoint_supersededBy_viewpoint_id"
	}),
}));

export const probeRelations = relations(probe, ({one}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [probe.corpusVersion],
		references: [corpusVersion.id]
	}),
	source: one(source, {
		fields: [probe.sourceId],
		references: [source.id]
	}),
	tension: one(tension, {
		fields: [probe.tensionId],
		references: [tension.id]
	}),
}));