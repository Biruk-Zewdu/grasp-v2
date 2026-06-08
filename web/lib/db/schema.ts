import { pgTable, unique, integer, text, timestamp, foreignKey, check, pgPolicy, uuid, index, boolean, primaryKey, pgEnum } from "drizzle-orm/pg-core"
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
// v2 (upload) enums
export const corpusOrigin = pgEnum("corpus_origin", ['example', 'uploaded'])
export const buildStatus = pgEnum("build_status", ['building', 'ready', 'failed'])
export const assessPhase = pgEnum("assess_phase", ['pre', 'post'])


export const corpusVersion = pgTable("corpus_version", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "corpus_version_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	label: text().notNull(),
	frozenAt: timestamp("frozen_at", { withTimezone: true, mode: 'string' }),
	notes: text(),
	// v2 (upload): an upload is a version
	origin: corpusOrigin().default('uploaded').notNull(),
	owner: text(),
	status: buildStatus().default('ready').notNull(),
	sourceName: text("source_name"),
	builtAt: timestamp("built_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("corpus_version_label_key").on(table.label),
	index("corpus_version_owner_idx").on(table.owner),
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
	paradigm: paradigm(),                       // v2: now optional (enum kept for example corpus)
	paradigmLabel: text("paradigm_label"),      // v2: free-text paradigm for arbitrary docs
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
	// v2: free-text side labels so a detected fork in any doc can name both sides
	paradigmLabelA: text("paradigm_label_a"),
	paradigmLabelB: text("paradigm_label_b"),
	thinkerA: text("thinker_a"),
	thinkerB: text("thinker_b"),
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
	paradigm: paradigm(),                       // v2: now optional
	paradigmLabel: text("paradigm_label"),      // v2: free-text
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

export const appSession = pgTable("app_session", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "app_session_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	userId: uuid("user_id").notNull(),
	corpusVersion: integer("corpus_version"),
	targetEntity: integer("target_entity"),
	seenEntityIds: integer("seen_entity_ids").array().default([]).notNull(),
	graspedEntityIds: integer("grasped_entity_ids").array().default([]).notNull(),
	probedEntityIds: integer("probed_entity_ids").array().default([]).notNull(),
	seenTensionIds: integer("seen_tension_ids").array().default([]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "app_session_corpus_version_fkey"
		}),
	unique("app_session_user_id_key").on(table.userId),
	pgPolicy("app_session_self", { as: "permissive", for: "all", to: ["public"], using: sql`(auth.uid() = user_id)`, withCheck: sql`(auth.uid() = user_id)`  }),
]);

export const gapLog = pgTable("gap_log", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "gap_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	goalText: text("goal_text").notNull(),
	userId: uuid("user_id"),
	corpusVersion: integer("corpus_version"),
	resolved: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gap_log_unresolved_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(NOT resolved)`),
	foreignKey({
			columns: [table.corpusVersion],
			foreignColumns: [corpusVersion.id],
			name: "gap_log_corpus_version_fkey"
		}),
]);

export const gestureLog = pgTable("gesture_log", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "gesture_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	userId: uuid("user_id"),
	gesture: text().notNull(),
	targetEntity: integer("target_entity"),
	recordKind: text("record_kind"),
	recordId: integer("record_id"),
	latencyMs: integer("latency_ms"),
	model: text(),
	tokens: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("gesture_log_created_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const usageCounter = pgTable("usage_counter", {
	userId: uuid("user_id").notNull(),
	bucket: text().notNull(),
	windowStart: timestamp("window_start", { withTimezone: true, mode: 'string' }).notNull(),
	count: integer().default(0).notNull(),
}, (table) => [
	primaryKey({ columns: [table.userId, table.bucket, table.windowStart], name: "usage_counter_pkey"}),
]);

// ─────────────────────────── v2 (upload) tables ───────────────────────────

// The decomposition — the lesson rail (Simon near-decomposability).
export const subtopic = pgTable("subtopic", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "subtopic_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	title: text().notNull(),
	summary: text(),
	conceptIds: integer("concept_ids").array().default([]).notNull(),
	ordinal: integer().default(0).notNull(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({ columns: [table.corpusVersion], foreignColumns: [corpusVersion.id], name: "subtopic_corpus_version_fkey" }),
	index("subtopic_corpus_version_idx").on(table.corpusVersion),
]);

// Generated teaching material per subtopic (cached). Prose is model-composed; a
// referenced tension is rendered VERBATIM at serve time, never authored here.
export const lesson = pgTable("lesson", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "lesson_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	subtopicId: integer("subtopic_id").notNull(),
	headline: text(),
	body: text().notNull(),
	keyTermIds: integer("key_term_ids").array().default([]).notNull(),
	tensionId: integer("tension_id"),
	sourceConceptIds: integer("source_concept_ids").array().default([]).notNull(),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({ columns: [table.subtopicId], foreignColumns: [subtopic.id], name: "lesson_subtopic_id_fkey" }),
	foreignKey({ columns: [table.tensionId], foreignColumns: [tension.id], name: "lesson_tension_id_fkey" }),
	foreignKey({ columns: [table.corpusVersion], foreignColumns: [corpusVersion.id], name: "lesson_corpus_version_fkey" }),
	index("lesson_subtopic_idx").on(table.subtopicId),
	index("lesson_corpus_version_idx").on(table.corpusVersion),
]);

// ONE doc-level assessment set, used for both pre and post.
export const assessment = pgTable("assessment", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "assessment_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	corpusVersion: integer("corpus_version").notNull(),
}, (table) => [
	foreignKey({ columns: [table.corpusVersion], foreignColumns: [corpusVersion.id], name: "assessment_corpus_version_fkey" }),
	unique("assessment_corpus_version_key").on(table.corpusVersion),
]);

export const assessmentQuestion = pgTable("assessment_question", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "assessment_question_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	assessmentId: integer("assessment_id").notNull(),
	ordinal: integer().default(0).notNull(),
	stem: text().notNull(),
	options: text().array().notNull(),
	answerIndex: integer("answer_index").notNull(),
	claimId: integer("claim_id"),
	subtopicId: integer("subtopic_id"),
	rationale: text(),
}, (table) => [
	foreignKey({ columns: [table.assessmentId], foreignColumns: [assessment.id], name: "assessment_question_assessment_id_fkey" }),
	foreignKey({ columns: [table.claimId], foreignColumns: [claim.id], name: "assessment_question_claim_id_fkey" }),
	foreignKey({ columns: [table.subtopicId], foreignColumns: [subtopic.id], name: "assessment_question_subtopic_id_fkey" }),
	index("assessment_question_assessment_idx").on(table.assessmentId),
]);

export const assessmentResponse = pgTable("assessment_response", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "assessment_response_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	userId: text("user_id").notNull(),
	questionId: integer("question_id").notNull(),
	phase: assessPhase().notNull(),
	chosenIndex: integer("chosen_index").notNull(),
	correct: boolean().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({ columns: [table.questionId], foreignColumns: [assessmentQuestion.id], name: "assessment_response_question_id_fkey" }),
	index("assessment_response_user_phase_idx").on(table.userId, table.phase),
]);
