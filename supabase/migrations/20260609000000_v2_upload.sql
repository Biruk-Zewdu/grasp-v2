-- 20260609000000_v2_upload.sql — Grasp v2: loosen the schema for arbitrary uploads.
--
-- v1 overfit the lecture: the `paradigm` enum hardcoded course paradigms
-- (reinforcement/society/shannon/simon/…) and the build validator REQUIRED a
-- two-sided tension per source. An arbitrary uploaded PDF has neither. v2 loosens:
--   • a free-text paradigm_label on claims/tensions (the enum becomes optional)
--   • corpus_version gains origin / owner / status (an upload is a version)
--   • tension stays 0..n and OPTIONAL — detected, never required (V2_DESIGN §5)
--   • new tables: subtopic (decomposition), lesson (generated teaching material),
--     assessment + assessment_question (doc-level pre/post)
-- Backward-compat with v1 rows is NOT required (separate DB) — but we keep the v1
-- columns so the proven loader/serve code keeps working; new columns are additive.

-- ── corpus_version: an upload is a version ───────────────────────────────────
create type corpus_origin as enum ('example', 'uploaded');
create type build_status  as enum ('building', 'ready', 'failed');

alter table corpus_version
  add column origin      corpus_origin not null default 'uploaded',
  add column owner       text,                       -- the uploader's user id (anon-auth uid)
  add column status      build_status  not null default 'ready',
  add column source_name text,                        -- original filename, for display
  add column built_at    timestamptz;

-- ── loosen paradigm: free-text label alongside the (now-optional) enum ────────
-- The enum stays for the curated example corpus; uploads fill the free-text label.
alter table claim    alter column paradigm drop not null;
alter table claim    add column paradigm_label text;   -- free-text for arbitrary docs
alter table viewpoint alter column paradigm drop not null;
alter table viewpoint add column paradigm_label text;

-- tension: side paradigm labels (free-text) so a detected fork in any doc can name
-- its two sides without fitting the course enum. dimension already nullable.
alter table tension
  add column paradigm_label_a text,
  add column paradigm_label_b text,
  add column thinker_a        text,
  add column thinker_b        text;

-- ── subtopic: the decomposition (lesson rail; Simon near-decomposability) ─────
create table subtopic (
  id              integer generated always as identity primary key,
  title           text not null,
  summary         text,                               -- one-line "what you'll grasp"
  concept_ids     integer[] not null default '{}',    -- the artifact concepts it covers
  ordinal         integer not null default 0,         -- display / bottom-up order
  corpus_version  integer not null references corpus_version(id)
);

-- ── lesson: generated teaching material per subtopic (cached) ─────────────────
-- Prose is model-composed (grounded reasoner); a referenced tension is rendered
-- VERBATIM at serve time from the tension row — the model never authors its cells.
create table lesson (
  id              integer generated always as identity primary key,
  subtopic_id     integer not null references subtopic(id),
  headline        text,
  body            text not null,                      -- grounded teaching prose
  key_term_ids    integer[] not null default '{}',    -- concepts named, for inline gloss
  tension_id      integer references tension(id),     -- optional: the catch, if detected
  source_concept_ids integer[] not null default '{}', -- for the provenance pull
  corpus_version  integer not null references corpus_version(id)
);

-- ── assessment: ONE doc-level set, used for both pre and post (V2_DESIGN §6) ──
create table assessment (
  id              integer generated always as identity primary key,
  corpus_version  integer not null references corpus_version(id) unique
);

create table assessment_question (
  id              integer generated always as identity primary key,
  assessment_id   integer not null references assessment(id),
  ordinal         integer not null default 0,
  stem            text not null,                      -- the question
  options         text[] not null,                    -- MC options
  answer_index    integer not null,                   -- the key (grading is deterministic)
  claim_id        integer references claim(id),        -- grounded in this claim
  subtopic_id     integer references subtopic(id),     -- which subtopic it probes (for "shaky" flags)
  rationale       text                                 -- why the answer is correct (shown after)
);

-- a learner's answers, so pre→post delta can be computed (credit assignment, S1)
create type assess_phase as enum ('pre', 'post');
create table assessment_response (
  id              integer generated always as identity primary key,
  user_id         text not null,
  question_id     integer not null references assessment_question(id),
  phase           assess_phase not null,
  chosen_index    integer not null,
  correct         boolean not null,
  created_at      timestamptz not null default now()
);

-- ── indexes for serve-time reads ─────────────────────────────────────────────
create index on subtopic (corpus_version);
create index on lesson (subtopic_id);
create index on lesson (corpus_version);
create index on assessment_question (assessment_id);
create index on assessment_response (user_id, phase);
create index on corpus_version (owner);
