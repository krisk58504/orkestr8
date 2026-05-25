-- ===========================================================================
-- 20260608000100_phase6_cost_precision.sql — Phase 6 slice 11f.
--
-- Upgrades cost_cents from int to numeric(10,4) on the two tables that
-- store per-call AI cost. The int rounding in src/lib/ai/client.ts:78
-- erased sub-cent precision (every real Sonnet triage call rounded to
-- $0.01 even when the computed cost was ~$0.006). numeric(10,4) preserves
-- four decimal places of cents — i.e. 0.0001¢ resolution, with headroom
-- up to ~$10,000 per call.
--
-- Existing rows (16 total at write time, all from today's walk-tests)
-- cast cleanly: int 1 → numeric 1.0000. No backfill needed per B2 lock —
-- pre-Phase-6.2 cost data is walk-test only, not load-bearing.
--
-- Deviation from PHASE_6_PLAN.md §2a + §0.5 decision 14 (which specified
-- cost_cents int). Intentional precision improvement; not an architectural
-- shape change. Noted in slice 11f commit message per K1 lock.
-- ===========================================================================

alter table public.ai_logs
  alter column cost_cents type numeric(10,4) using cost_cents::numeric(10,4);

alter table public.report_insights
  alter column cost_cents type numeric(10,4) using cost_cents::numeric(10,4);
