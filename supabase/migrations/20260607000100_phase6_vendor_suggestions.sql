-- ===========================================================================
-- 20260607000100_phase6_vendor_suggestions.sql — Phase 6 slice 11d.
--
-- AI vendor suggestion persistence columns on maintenance_requests. Mirrors
-- the column-pair precedent on host entities:
--   * Phase 2:  maintenance_requests.ai_triage jsonb + ai_triaged_at
--   * Phase 6.1 properties.ai_summary jsonb + ai_summary_generated_at
-- and now:
--   * Phase 6.2 maintenance_requests.ai_vendor_suggestions jsonb +
--     ai_vendor_suggestions_generated_at
--
-- No RLS changes. Existing maintenance_requests_select/insert/update policies
-- cover SELECT access on the new columns automatically. Writes flow through
-- the generateVendorSuggestion server action which uses the cookie-bound
-- client. Slice 11a RESTRICTIVE policy on rent_charges + payments does NOT
-- extend to maintenance_requests (it's an operational table, not financial).
-- ===========================================================================

alter table public.maintenance_requests
  add column if not exists ai_vendor_suggestions              jsonb,
  add column if not exists ai_vendor_suggestions_generated_at timestamptz;
