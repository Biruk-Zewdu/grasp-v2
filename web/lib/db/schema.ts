import { pgTable, unique, integer, text, timestamp, foreignKey, check, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const abstraction = pgEnum("abstraction", ['foundational', 'paradigmatic', 'mechanism', 'instance', 'example'])
export const beliefLabel = pgEnum("belief_label", ['in', 'out'])
export const claimStatus = pgEnum("claim_status", ['established', 'contested', 'conditional', 'default'])
export const claimType = pgEnum("claim_type", ['causal', 'correlative', 'contradictory', 'conditional', 'definitional', 'compositional', 'analogical'])
export const entityType = pgEnum("entity_type", ['Problem', 'Paradigm', 'Mechanism', 'Representation', 'Thinker', 'Example', 'Hypothesis'])
export const paradigm = pgEnum("paradigm", ['reinforcement', 'society', 'shannon', 'simon', 'von_neumann', 'mccarthy_krr', 'bridging', 'neutral'])
export const probeKind = pgEnum("probe_kind", ['concept', 'tension'])
export const relationType = pgEnum("relation_type", ['generalizes', 'specializes', 'causes', 'enables', 'contradicts', 'composed_of', 'proposed_by', 'exemplified_by', 'addresses', 'extends'])
export const sourceKind = pgEnum("source_kind", ['session', 'paper'])


export const corpusVersion = pgTable("corpus_version", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "corpus_version_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	label: text().notNull(),
	frozenAt: timestamp("frozen_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
}, (table) => [
	unique("corpus_version_label_key").on(table.label),
]);

export const source = pgTable("source", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "source_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	kind: sourceKind().notNull(),
	title: text().notNull(),
	ref: text(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "source_corpus_version_fkey"
		}),
]);

export const textUnit = pgTable("text_unit", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "text_unit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	sourceId: integer("source_id").notNull(),
	section: text(),
	paragraphIndex: integer("paragraph_index").notNull(),
	charStart: integer("char_start").notNull(),
	charEnd: integer("char_end").notNull(),
	text: text().notNull(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "text_unit_corpus_version_fkey"
		}),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [source.id],
			name: "text_unit_source_id_fkey"
		}),
]);

export const entity = pgTable("entity", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "entity_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: text().notNull(),
	type: entityType().notNull(),
	definition: text(),
	abstraction: abstraction(),
	sourceIds: integer("source_ids").array().default([]).notNull(),
	corpusVersion: integer("corpus_version").notNull(),
	paradigm: paradigm(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "entity_corpus_version_fkey"
		}),
	unique("entity_name_corpus_version_key").on(table.name, table.corpusVersion),
]);

export const relation = pgTable("relation", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "relation_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	fromEntity: integer("from_entity").notNull(),
	relType: relationType("rel_type").notNull(),
	toEntity: integer("to_entity").notNull(),
	evidence: text(),
	sourceIds: integer("source_ids").array().default([]).notNull(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "relation_corpus_version_fkey"
		}),
	foreignKey({
			columns: [table.fromEntity],
			foreignColumns: [entity.id],
			name: "relation_from_entity_fkey"
		}),
	foreignKey({
			columns: [table.toEntity],
			foreignColumns: [entity.id],
			name: "relation_to_entity_fkey"
		}),
]);

export const claim = pgTable("claim", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "claim_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	proposition: text().notNull(),
	conceptIds: integer("concept_ids").array().default([]).notNull(),
	claimType: claimType("claim_type").notNull(),
	thinker: text(),
	paradigm: paradigm().notNull(),
	conditions: text(),
	status: claimStatus().default('default').notNull(),
	sourceId: integer("source_id"),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "claim_corpus_version_fkey"
		}),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [source.id],
			name: "claim_source_id_fkey"
		}),
]);

export const provenance = pgTable("provenance", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "provenance_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	claimId: integer("claim_id").notNull(),
	sourceKind: sourceKind("source_kind").notNull(),
	textUnitId: integer("text_unit_id"),
	sourceRef: text("source_ref"),
	assertedBy: text("asserted_by"),
}, (table) => [
	foreignKey({
			columns: [table.claimId],
			foreignColumns: [claim.id],
			name: "provenance_claim_id_fkey"
		}),
	foreignKey({
			columns: [table.textUnitId],
			foreignColumns: [textUnit.id],
			name: "provenance_text_unit_id_fkey"
		}),
]);

export const beliefNode = pgTable("belief_node", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "belief_node_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	claimId: integer("claim_id").notNull(),
	label: beliefLabel().default('in').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.claimId],
			foreignColumns: [claim.id],
			name: "belief_node_claim_id_fkey"
		}),
	unique("belief_node_claim_id_key").on(table.claimId),
]);

export const justification = pgTable("justification", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "justification_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	beliefNode: integer("belief_node").notNull(),
	antecedentBeliefIds: integer("antecedent_belief_ids").array().default([]).notNull(),
	rationale: text(),
}, (table) => [
	foreignKey({
			columns: [table.beliefNode],
			foreignColumns: [beliefNode.id],
			name: "justification_belief_node_fkey"
		}),
]);

export const tension = pgTable("tension", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "tension_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	claimA: integer("claim_a").notNull(),
	claimB: integer("claim_b").notNull(),
	dimension: text(),
	conditionsA: text("conditions_a").notNull(),
	conditionsB: text("conditions_b").notNull(),
	sessionIds: integer("session_ids").array().default([]).notNull(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.claimA],
			foreignColumns: [claim.id],
			name: "tension_claim_a_fkey"
		}),
	foreignKey({
			columns: [table.claimB],
			foreignColumns: [claim.id],
			name: "tension_claim_b_fkey"
		}),
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "tension_corpus_version_fkey"
		}),
	check("tension_two_sided", sql`(length(TRIM(BOTH FROM conditions_a)) > 0) AND (length(TRIM(BOTH FROM conditions_b)) > 0)`),
]);

export const viewpoint = pgTable("viewpoint", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "viewpoint_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	claimId: integer("claim_id").notNull(),
	paradigm: paradigm().notNull(),
	thinker: text(),
	conditions: text(),
	supersededBy: integer("superseded_by"),
}, (table) => [
	foreignKey({
			columns: [table.claimId],
			foreignColumns: [claim.id],
			name: "viewpoint_claim_id_fkey"
		}),
	foreignKey({
			columns: [table.supersededBy],
			foreignColumns: [table.id],
			name: "viewpoint_superseded_by_fkey"
		}),
]);

export const probe = pgTable("probe", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "probe_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	kind: probeKind().notNull(),
	prompt: text().notNull(),
	conceptIds: integer("concept_ids").array().default([]).notNull(),
	tensionId: integer("tension_id"),
	expectedSignals: text("expected_signals").array().notNull(),
	sourceId: integer("source_id"),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "probe_corpus_version_fkey"
		}),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [source.id],
			name: "probe_source_id_fkey"
		}),
	foreignKey({
			columns: [table.tensionId],
			foreignColumns: [tension.id],
			name: "probe_tension_id_fkey"
		}),
	check("probe_has_signals", sql`array_length(expected_signals, 1) >= 1`),
	check("probe_target", sql`((kind = 'tension'::probe_kind) AND (tension_id IS NOT NULL)) OR ((kind = 'concept'::probe_kind) AND (array_length(concept_ids, 1) >= 1))`),
]);
