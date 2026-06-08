-- 0002_probes — the Probe (Socratic check / reverse registration, M5)
-- A Probe is authored content with a GROUNDED rubric (expected_signals). At serve
-- time the model checks only *coverage* of those signals — never truth, never a score
-- (see 7_build_playbook/99_GOTCHAS.md#g12). Mirrors: schemas/ (Pydantic), web/lib/db (Drizzle).

create type probe_kind as enum ('concept', 'tension');

create table probe (
  id               integer generated always as identity primary key,
  kind             probe_kind not null,
  prompt           text not null,                          -- the Socratic question
  concept_ids      integer[] not null default '{}',        -- concepts it checks (kind=concept)
  tension_id       integer references tension(id),         -- the tension it checks (kind=tension)
  expected_signals text[] not null,                        -- rubric: points/conditions a good answer should touch
  source_id        integer references source(id),
  corpus_version   integer not null references corpus_version(id),
  -- a probe targets either a tension or >=1 concept, matching its kind
  constraint probe_target check (
    (kind = 'tension' and tension_id is not null)
    or (kind = 'concept' and array_length(concept_ids, 1) >= 1)
  ),
  -- the rubric must be non-empty (coverage needs signals to match against)
  constraint probe_has_signals check (array_length(expected_signals, 1) >= 1)
);
