-- 0001_init.sql — Grasp schema (the Artifact)
-- Source of truth for the schema. Pydantic (/schemas) and Drizzle (/web/lib/db)
-- MIRROR this file; never hand-edit a mirror in isolation (see 99_GOTCHAS g2).
-- Invariant tags (I1–I6) reference 7_build_playbook/02_DATA_MODEL.md.

-- pgvector is enabled now (cheap; avoids touching frozen data later).
-- The concept_embedding table itself is added in the v2 migration, when the
-- embedding provider/dimension is chosen — v1 uses no embeddings.
create extension if not exists vector;

-- ───────────────────────── enums ─────────────────────────
create type entity_type   as enum ('Problem','Paradigm','Mechanism','Representation','Thinker','Example','Hypothesis');
create type relation_type as enum ('generalizes','specializes','causes','enables','contradicts','composed_of','proposed_by','exemplified_by','addresses','extends');
create type claim_type    as enum ('causal','correlative','contradictory','conditional','definitional','compositional','analogical');
create type paradigm      as enum ('reinforcement','society','shannon','simon','von_neumann','mccarthy_krr','bridging','neutral');
create type abstraction   as enum ('foundational','paradigmatic','mechanism','instance','example');
create type belief_label  as enum ('in','out');
create type claim_status  as enum ('established','contested','conditional','default');
create type source_kind   as enum ('session','paper');   -- 'paper' is v2 only

-- ───────────────────────── corpus / sources ─────────────────────────
create table corpus_version (
  id         integer generated always as identity primary key,
  label      text not null unique,
  frozen_at  timestamptz,                 -- I5: once set, the version is immutable (app/trigger enforced)
  notes      text
);

create table source (
  id              integer generated always as identity primary key,
  kind            source_kind not null,
  title           text not null,
  ref             text,
  corpus_version  integer not null references corpus_version(id)
);

-- Addressable units of source text so provenance can point precisely.
create table text_unit (
  id              integer generated always as identity primary key,
  source_id       integer not null references source(id),
  section         text,
  paragraph_index integer not null,
  char_start      integer not null,
  char_end        integer not null,
  text            text not null,
  corpus_version  integer not null references corpus_version(id)
);

-- ───────────────────────── ontology ─────────────────────────
create table entity (
  id              integer generated always as identity primary key,
  name            text not null,
  type            entity_type not null,
  definition      text,
  abstraction     abstraction,
  source_ids      integer[] not null default '{}',
  corpus_version  integer not null references corpus_version(id),
  unique (name, corpus_version)            -- I6: canonical name per version
);

create table relation (
  id              integer generated always as identity primary key,
  from_entity     integer not null references entity(id),
  rel_type        relation_type not null,
  to_entity       integer not null references entity(id),
  evidence        text,
  source_ids      integer[] not null default '{}',
  corpus_version  integer not null references corpus_version(id)
  -- I4 (hierarchy: generalizes ⇒ abstraction(from) > abstraction(to)) is cross-row;
  -- enforced by the validator/eval, not a CHECK.
);

-- ───────────────────────── claims & beliefs ─────────────────────────
create table claim (
  id              integer generated always as identity primary key,
  proposition     text not null,
  concept_ids     integer[] not null default '{}',
  claim_type      claim_type not null,
  thinker         text,
  paradigm        paradigm not null,
  conditions      text,
  status          claim_status not null default 'default',
  source_id       integer references source(id),
  corpus_version  integer not null references corpus_version(id)
);

-- I2: every claim has >=1 provenance row (validator-enforced at load).
create table provenance (
  id            integer generated always as identity primary key,
  claim_id      integer not null references claim(id),
  source_kind   source_kind not null,
  text_unit_id  integer references text_unit(id),   -- set for sessions; null for v2 paper refs
  source_ref    text,                               -- free-form fallback (e.g. paper id)
  asserted_by   text
);

-- TMS (M6): in/out belief state wrapping a claim.
create table belief_node (
  id        integer generated always as identity primary key,
  claim_id  integer not null unique references claim(id),
  label     belief_label not null default 'in'
);

create table justification (
  id                   integer generated always as identity primary key,
  belief_node          integer not null references belief_node(id),
  antecedent_belief_ids integer[] not null default '{}',
  rationale            text
);

-- ───────────────────────── tensions & viewpoints ─────────────────────────
create table tension (
  id              integer generated always as identity primary key,
  claim_a         integer not null references claim(id),
  claim_b         integer not null references claim(id),
  dimension       text,
  conditions_a    text not null,
  conditions_b    text not null,
  session_ids     integer[] not null default '{}',
  corpus_version  integer not null references corpus_version(id),
  constraint tension_two_sided check (length(trim(conditions_a)) > 0 and length(trim(conditions_b)) > 0)  -- I3
);

-- Society / due-process register (M7). Monotonic: never delete; mark superseded (I1).
create table viewpoint (
  id            integer generated always as identity primary key,
  claim_id      integer not null references claim(id),
  paradigm      paradigm not null,
  thinker       text,
  conditions    text,
  superseded_by integer references viewpoint(id)
);

-- Indexes are added in a later migration when serve queries appear (02_DATA_MODEL §Indexes).
