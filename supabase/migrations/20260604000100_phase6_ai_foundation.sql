-- ===========================================================================
-- 20260604000100_phase6_ai_foundation.sql — Phase 6 slice 11a foundation.
--
-- Three coupled concerns shipped together because they form the structural
-- AI write-side discipline that the real LLM call (Phase 6.1) requires:
--
--   1. ai_logs cost-tracking columns. Every real Claude call records
--      tokens consumed + cost in cents + model name so per-org observability
--      is queryable from day one (per PHASE_6_PLAN.md §0.5 decision 14).
--      All four columns nullable — existing placeholder-triage rows have
--      no LLM cost to record, which is the correct historical state.
--
--   2. is_ai_actor() helper. Reads a session-local Postgres setting
--      (`app.is_ai_actor`) and COALESCEs to false when unset. Phase 6.1
--      ships no code that flips this setting — the helper exists as the
--      seam for a future AI write path's RESTRICTIVE-policy block to fire
--      against. Deferred-activation defense-in-depth per §0.5 decision 13.
--
--   3. RESTRICTIVE policies on rent_charges + payments. SPEC line 465
--      ("AI cannot modify financial data") gets structural enforcement
--      via Postgres' AS RESTRICTIVE clause, ANDing with the four
--      PERMISSIVE policies already shipped in Phase 5 slices 10a/10b.
--      Today the policy is a no-op (is_ai_actor() always returns false).
--      Tomorrow, if a future migration accidentally enables an AI write
--      surface, this policy denies the write structurally.
--
-- Mechanism precedent: 20260519001200_vendor_invoice_status_restriction.sql
-- (Phase 2 §8.2 vendor-invoice status RESTRICTIVE clamp) — same `as
-- restrictive` pattern; same drop-and-recreate idempotency posture.
-- ===========================================================================

-- ---- 1. ai_logs cost-tracking columns -------------------------------------
alter table public.ai_logs
  add column if not exists tokens_input  int,
  add column if not exists tokens_output int,
  add column if not exists cost_cents    int,
  add column if not exists model_name    text;

-- ---- 2. is_ai_actor() helper ----------------------------------------------
create or replace function public.is_ai_actor() returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select coalesce(
    current_setting('app.is_ai_actor', true)::boolean,
    false
  );
$$;

grant execute on function public.is_ai_actor() to authenticated;

-- ---- 3. RESTRICTIVE policies on rent_charges + payments -------------------
drop policy if exists rent_charges_no_ai_writes on public.rent_charges;
create policy rent_charges_no_ai_writes on public.rent_charges
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());

drop policy if exists payments_no_ai_writes on public.payments;
create policy payments_no_ai_writes on public.payments
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());
