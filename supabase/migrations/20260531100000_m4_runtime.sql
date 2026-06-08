-- 0004_m4_runtime.sql — M4 runtime/serve-time state (NOT part of the frozen Artifact).
-- These tables hold per-visitor session progress, durable cost counters, the gap
-- queue, and gesture observability. They are written server-side via the postgres
-- role (which BYPASSES RLS); RLS here is defense-in-depth so the public anon key
-- (PostgREST) can never read user data (99_GOTCHAS: "RLS before launch").
-- Mirrors: Drizzle (/web/lib/db) via `pnpm db:pull`. Not part of Pydantic (serve-only).

-- ───────────────────────── session progress (M4 item 1) ─────────────────────────
-- One row per visitor (anonymous-auth uid, or the client session uuid as fallback).
-- Pins corpus_version so a user mid-session on v1 never jumps to v1.1 underfoot.
create table app_session (
  id                 integer generated always as identity primary key,
  user_id            uuid not null unique,
  corpus_version     integer references corpus_version(id),   -- pinned at first goal
  target_entity      integer,
  seen_entity_ids    integer[] not null default '{}',
  grasped_entity_ids integer[] not null default '{}',
  probed_entity_ids  integer[] not null default '{}',
  seen_tension_ids   integer[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ───────────────────────── durable cost guard (M4 item 2) ─────────────────────────
-- Atomic per-user, per-window model-call counters. Survives serverless restarts
-- (the in-memory budget did not). One row per (user, bucket, window_start);
-- bucket = 'hour' | 'day'. Incremented with: insert ... on conflict do update.
create table usage_counter (
  user_id      uuid not null,
  bucket       text not null,                 -- 'hour' | 'day'
  window_start timestamptz not null,          -- truncated to the bucket
  count        integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- ───────────────────────── gap loop (M4 item 3) ─────────────────────────
-- Out-of-corpus goals become curation candidates, not silent dead ends.
create table gap_log (
  id             integer generated always as identity primary key,
  goal_text      text not null,
  user_id        uuid,
  corpus_version integer references corpus_version(id),
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ───────────────────────── observability (M4 item 6) ─────────────────────────
-- One row per gesture: what was served, how long, which model, how many tokens.
-- NO PII (no goal/answer text here — gap_log is the only place goal text lives).
create table gesture_log (
  id             integer generated always as identity primary key,
  user_id        uuid,
  gesture        text not null,                -- 'goal' | 'forward' | 'probe' | 'deeper' | 'source'
  target_entity  integer,
  record_kind    text,                         -- 'briefing' | 'tension' | 'probe' | 'stop'
  record_id      integer,
  latency_ms     integer,
  model          text,                         -- null in template mode
  tokens         integer,
  created_at     timestamptz not null default now()
);

create index gesture_log_created_idx on gesture_log (created_at desc);
create index gap_log_unresolved_idx on gap_log (created_at desc) where not resolved;

-- ───────────────────────── RLS (defense in depth) ─────────────────────────
alter table app_session   enable row level security;
alter table usage_counter enable row level security;
alter table gap_log       enable row level security;
alter table gesture_log   enable row level security;

-- A visitor may read/write only their own session row (via the authenticated
-- anon-auth JWT). The server (postgres role) bypasses RLS for all of these.
create policy app_session_self on app_session
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- usage_counter / gap_log / gesture_log: RLS enabled with NO policy ⇒ the anon &
-- authenticated roles get nothing. Only the server-side postgres role touches them.
