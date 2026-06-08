"""Pydantic v2 models mirroring db/migrations/0001_init.sql.

These validate agent-produced records before load — the substitute for the
API's structured-output guarantee (PRODUCT_SPEC §11). `id` fields are assigned
by the DB, so they are optional on input. Invariant checks that a single record
can see are enforced here; cross-record invariants (I2, I4) are checked by the
loader/eval.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from .enums import (
    Abstraction,
    BeliefLabel,
    ClaimStatus,
    ClaimType,
    EntityType,
    Paradigm,
    ProbeKind,
    RelationType,
    SourceKind,
)


class CorpusVersion(BaseModel):
    id: int | None = None
    label: str
    frozen_at: str | None = None
    notes: str | None = None
    # v2 (upload): an upload is a version.
    origin: str = "uploaded"           # 'example' | 'uploaded'
    owner: str | None = None
    status: str = "ready"              # 'building' | 'ready' | 'failed'
    source_name: str | None = None
    built_at: str | None = None


class Source(BaseModel):
    id: int | None = None
    kind: SourceKind
    title: str
    ref: str | None = None
    corpus_version: int


class TextUnit(BaseModel):
    id: int | None = None
    source_id: int
    section: str | None = None
    paragraph_index: int
    char_start: int
    char_end: int
    text: str
    corpus_version: int


class Entity(BaseModel):
    id: int | None = None
    name: str
    type: EntityType
    definition: str | None = None
    abstraction: Abstraction | None = None
    paradigm: Paradigm | None = None  # Module E TAG_PARADIGM; null for thinkers/examples
    source_ids: list[int] = Field(default_factory=list)
    corpus_version: int


class Relation(BaseModel):
    id: int | None = None
    from_entity: int
    rel_type: RelationType
    to_entity: int
    evidence: str | None = None
    source_ids: list[int] = Field(default_factory=list)
    corpus_version: int


class Provenance(BaseModel):
    id: int | None = None
    claim_id: int | None = None  # filled by loader when the claim row lands
    source_kind: SourceKind
    text_unit_id: int | None = None
    source_ref: str | None = None
    asserted_by: str | None = None


class Claim(BaseModel):
    id: int | None = None
    proposition: str
    concept_ids: list[int] = Field(default_factory=list)
    claim_type: ClaimType
    thinker: str | None = None
    paradigm: Paradigm | None = None        # v2: optional (enum kept for example corpus)
    paradigm_label: str | None = None       # v2: free-text paradigm for arbitrary docs
    conditions: str | None = None
    status: ClaimStatus = ClaimStatus.default
    source_id: int | None = None
    corpus_version: int
    # I2: provenance carried inline at build time; loader splits it into the table.
    provenance: list[Provenance] = Field(min_length=1)


class BeliefNode(BaseModel):
    id: int | None = None
    claim_id: int
    label: BeliefLabel = BeliefLabel.in_


class Justification(BaseModel):
    id: int | None = None
    belief_node: int
    antecedent_belief_ids: list[int] = Field(default_factory=list)
    rationale: str | None = None


class Tension(BaseModel):
    id: int | None = None
    claim_a: int
    claim_b: int
    dimension: str | None = None
    conditions_a: str
    conditions_b: str
    session_ids: list[int] = Field(default_factory=list)
    corpus_version: int
    # v2: free-text side labels so a detected fork in any doc can name both sides.
    paradigm_label_a: str | None = None
    paradigm_label_b: str | None = None
    thinker_a: str | None = None
    thinker_b: str | None = None

    @model_validator(mode="after")
    def _two_sided(self) -> "Tension":
        # I3: a tension is two-sided — both conditions non-empty. (Tensions remain
        # two-sided when present; in v2 they are OPTIONAL — 0..n per artifact —
        # detected, never required. The two-sided rule only applies once one exists.)
        if not self.conditions_a.strip() or not self.conditions_b.strip():
            raise ValueError("tension must have both conditions_a and conditions_b (I3)")
        return self


class Viewpoint(BaseModel):
    id: int | None = None
    claim_id: int
    paradigm: Paradigm | None = None        # v2: optional
    paradigm_label: str | None = None       # v2: free-text
    thinker: str | None = None
    conditions: str | None = None
    superseded_by: int | None = None


class Probe(BaseModel):
    """A Socratic check (reverse registration, M5). `expected_signals` is the GROUNDED
    rubric — at serve time the model checks coverage of these, never truth (g12)."""

    id: int | None = None
    kind: ProbeKind
    prompt: str
    concept_ids: list[int] = Field(default_factory=list)
    tension_id: int | None = None
    expected_signals: list[str] = Field(min_length=1)
    source_id: int | None = None
    corpus_version: int

    @model_validator(mode="after")
    def _target(self) -> "Probe":
        # mirrors the DB probe_target check
        if self.kind == ProbeKind.tension and self.tension_id is None:
            raise ValueError("tension-probe requires tension_id")
        if self.kind == ProbeKind.concept and not self.concept_ids:
            raise ValueError("concept-probe requires concept_ids")
        return self


# ─────────────────────────── v2 (upload) models ───────────────────────────


class Subtopic(BaseModel):
    """A unit of the decomposition — a rung of the lesson rail."""
    id: int | None = None
    title: str
    summary: str | None = None
    concept_ids: list[int] = Field(default_factory=list)
    ordinal: int = 0
    corpus_version: int


class Lesson(BaseModel):
    """Generated teaching material for a subtopic. Prose is model-composed; a
    referenced tension is rendered verbatim at serve time, never authored here."""
    id: int | None = None
    subtopic_id: int
    headline: str | None = None
    body: str
    key_term_ids: list[int] = Field(default_factory=list)
    tension_id: int | None = None
    source_concept_ids: list[int] = Field(default_factory=list)
    corpus_version: int


class AssessmentQuestion(BaseModel):
    id: int | None = None
    ordinal: int = 0
    stem: str
    options: list[str] = Field(min_length=2)
    answer_index: int
    claim_id: int | None = None
    subtopic_id: int | None = None
    rationale: str | None = None

    @model_validator(mode="after")
    def _answer_in_range(self) -> "AssessmentQuestion":
        if not (0 <= self.answer_index < len(self.options)):
            raise ValueError("answer_index out of range for options")
        return self


class Assessment(BaseModel):
    """One doc-level question set, used for both pre and post."""
    id: int | None = None
    corpus_version: int
    questions: list[AssessmentQuestion] = Field(default_factory=list)
