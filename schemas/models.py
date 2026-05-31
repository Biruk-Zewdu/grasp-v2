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
    RelationType,
    SourceKind,
)


class CorpusVersion(BaseModel):
    id: int | None = None
    label: str
    frozen_at: str | None = None
    notes: str | None = None


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
    paradigm: Paradigm
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

    @model_validator(mode="after")
    def _two_sided(self) -> "Tension":
        # I3: a tension is two-sided — both conditions non-empty.
        if not self.conditions_a.strip() or not self.conditions_b.strip():
            raise ValueError("tension must have both conditions_a and conditions_b (I3)")
        return self


class Viewpoint(BaseModel):
    id: int | None = None
    claim_id: int
    paradigm: Paradigm
    thinker: str | None = None
    conditions: str | None = None
    superseded_by: int | None = None
