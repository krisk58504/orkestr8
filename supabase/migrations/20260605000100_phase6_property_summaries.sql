-- ===========================================================================
-- 20260605000100_phase6_property_summaries.sql — Phase 6 slice 11b.
--
-- AI summary persistence columns on properties. Mirrors the Phase 2
-- precedent (maintenance_requests.ai_triage jsonb + ai_triaged_at
-- timestamptz) — same shape, same nullability, same semantics.
--
-- No RLS changes. Existing properties_select policies (manager + owner-
-- self via M5RF + tenant-self via M3LU) cover SELECT access on the new
-- columns automatically. Writes to these columns flow through the
-- generatePropertySummary server action which uses the cookie-bound
-- client; ai-actor write paths to properties are still blocked by the
-- slice 11a RESTRICTIVE policy on rent_charges + payments (financial
-- tables) — properties is not financial, so no RESTRICTIVE addition
-- here.
-- ===========================================================================

alter table public.properties
  add column if not exists ai_summary              jsonb,
  add column if not exists ai_summary_generated_at timestamptz;
