"""Enums mirroring db/migrations/0001_init.sql. Keep in lockstep with the SQL."""
from enum import Enum


class EntityType(str, Enum):
    problem = "Problem"
    paradigm = "Paradigm"
    mechanism = "Mechanism"
    representation = "Representation"
    thinker = "Thinker"
    example = "Example"
    hypothesis = "Hypothesis"


class RelationType(str, Enum):
    generalizes = "generalizes"
    specializes = "specializes"
    causes = "causes"
    enables = "enables"
    contradicts = "contradicts"
    composed_of = "composed_of"
    proposed_by = "proposed_by"
    exemplified_by = "exemplified_by"
    addresses = "addresses"
    extends = "extends"


class ClaimType(str, Enum):
    causal = "causal"
    correlative = "correlative"
    contradictory = "contradictory"
    conditional = "conditional"
    definitional = "definitional"
    compositional = "compositional"
    analogical = "analogical"


class Paradigm(str, Enum):
    reinforcement = "reinforcement"
    society = "society"
    shannon = "shannon"
    simon = "simon"
    von_neumann = "von_neumann"
    mccarthy_krr = "mccarthy_krr"
    bridging = "bridging"
    neutral = "neutral"


class Abstraction(str, Enum):
    foundational = "foundational"
    paradigmatic = "paradigmatic"
    mechanism = "mechanism"
    instance = "instance"
    example = "example"


class BeliefLabel(str, Enum):
    in_ = "in"
    out = "out"


class ClaimStatus(str, Enum):
    established = "established"
    contested = "contested"
    conditional = "conditional"
    default = "default"


class SourceKind(str, Enum):
    session = "session"
    paper = "paper"
