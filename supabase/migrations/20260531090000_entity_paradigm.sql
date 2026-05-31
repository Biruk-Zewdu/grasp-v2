-- 0003_entity_paradigm — give concepts a first-class paradigm tag (Module E, TAG_PARADIGM)
-- The `entity` table previously carried no paradigm; paradigm lived only on `claim`. But
-- the design tags every concept with the intellectual tradition it belongs to (reinforcement,
-- society, simon, …) so the sequencer can surface a concept under its paradigm. Nullable:
-- thinkers/examples may stay untagged. Reuses the existing `paradigm` enum.
-- Mirrors: schemas/ (Pydantic), web/lib/db (Drizzle, later).

alter table entity add column paradigm paradigm;
