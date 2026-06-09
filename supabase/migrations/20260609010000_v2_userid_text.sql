-- 20260609010000_v2_userid_text.sql — loosen runtime user_id from uuid → text.
--
-- v1 assumed every identity was a Supabase anon-auth UUID, so the runtime tables
-- typed user_id as uuid. v2 identities can be arbitrary strings (a per-session id,
-- an owner label, the build pipeline's sessionId), so a uuid column throws
-- "invalid input syntax for type uuid" — which fail-closes the budget guard and
-- blocks every model call. Widen to text (assessment_response.user_id already is).

alter table usage_counter alter column user_id type text;
alter table gap_log       alter column user_id type text;
alter table gesture_log   alter column user_id type text;

-- app_session has an RLS policy on user_id — drop, widen, recreate (cast auth.uid()
-- to text so the own-row check still holds for real anon-auth UUIDs).
drop policy if exists app_session_self on app_session;
alter table app_session alter column user_id type text;
create policy app_session_self on app_session
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
