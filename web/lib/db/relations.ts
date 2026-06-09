import { relations } from "drizzle-orm/relations";
import { corpusVersion, source, textUnit, entity, relation, claim, provenance, beliefNode, justification, probe, tension, gapLog, viewpoint, appSession, subtopic, lesson, assessment, assessmentQuestion, assessmentResponse } from "./schema";

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
	probes: many(probe),
	gapLogs: many(gapLog),
	appSessions: many(appSession),
	tensions: many(tension),
	subtopics: many(subtopic),
	lessons: many(lesson),
	assessments: many(assessment),
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
	viewpoints: many(viewpoint),
	tensions_claimA: many(tension, {
		relationName: "tension_claimA_claim_id"
	}),
	tensions_claimB: many(tension, {
		relationName: "tension_claimB_claim_id"
	}),
	assessmentQuestions: many(assessmentQuestion),
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

export const tensionRelations = relations(tension, ({one, many}) => ({
	probes: many(probe),
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
	lessons: many(lesson),
}));

export const gapLogRelations = relations(gapLog, ({one}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [gapLog.corpusVersion],
		references: [corpusVersion.id]
	}),
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

export const appSessionRelations = relations(appSession, ({one}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [appSession.corpusVersion],
		references: [corpusVersion.id]
	}),
}));

export const subtopicRelations = relations(subtopic, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [subtopic.corpusVersion],
		references: [corpusVersion.id]
	}),
	lessons: many(lesson),
	assessmentQuestions: many(assessmentQuestion),
}));

export const lessonRelations = relations(lesson, ({one}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [lesson.corpusVersion],
		references: [corpusVersion.id]
	}),
	subtopic: one(subtopic, {
		fields: [lesson.subtopicId],
		references: [subtopic.id]
	}),
	tension: one(tension, {
		fields: [lesson.tensionId],
		references: [tension.id]
	}),
}));

export const assessmentRelations = relations(assessment, ({one, many}) => ({
	corpusVersion: one(corpusVersion, {
		fields: [assessment.corpusVersion],
		references: [corpusVersion.id]
	}),
	assessmentQuestions: many(assessmentQuestion),
}));

export const assessmentQuestionRelations = relations(assessmentQuestion, ({one, many}) => ({
	assessment: one(assessment, {
		fields: [assessmentQuestion.assessmentId],
		references: [assessment.id]
	}),
	claim: one(claim, {
		fields: [assessmentQuestion.claimId],
		references: [claim.id]
	}),
	subtopic: one(subtopic, {
		fields: [assessmentQuestion.subtopicId],
		references: [subtopic.id]
	}),
	assessmentResponses: many(assessmentResponse),
}));

export const assessmentResponseRelations = relations(assessmentResponse, ({one}) => ({
	assessmentQuestion: one(assessmentQuestion, {
		fields: [assessmentResponse.questionId],
		references: [assessmentQuestion.id]
	}),
}));