-- ===========================================================================
-- 20260610000000_fix_is_ai_actor_empty_string.sql
--
-- Pre-existing Phase 6 helper bug discovered during Phase 7 slice 1 RLS
-- regression run (2026-05-26).
--
-- Symptom: SQLSTATE 22P02 — "invalid input syntax for type boolean: ''".
--
-- Root cause: pgbouncer Session pooling reuses backend sessions across pg
-- client connections. When a prior transaction touches a custom GUC via
-- `set_config('app.is_ai_actor', ..., true)`, the GUC parameter becomes
-- "registered" in the backend session. After ROLLBACK, the value reverts
-- to '' (empty string) rather than being fully cleared. On the next
-- connection that reuses that backend, `current_setting('app.is_ai_actor',
-- true)` returns '' instead of NULL — and the prior helper's
-- `::boolean` cast raises 22P02 before the `coalesce` default could
-- apply.
--
-- Fix: wrap `current_setting` in `nullif(_, '')` so empty string maps
-- to NULL, which then COALESCEs to false correctly. Behavior is
-- unchanged for the 'true'/'false' cases — only the empty-string path
-- is repaired.
--
-- Original helper: 20260604000100_phase6_ai_foundation.sql lines 40-48.
-- Verification: docs/PHASE_7_SLICE_1_IMPLEMENTATION_DECISIONS.md §G
-- (post-fix RLS regression run = 20/20 suites pass, 286 / 286
-- cumulative assertions).
-- ===========================================================================

create or replace function public.is_ai_actor() returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select coalesce(
    nullif(current_setting('app.is_ai_actor', true), '')::boolean,
    false
  );
$$;
