-- ===========================================================================
-- 20260524000100_phase3_tenant_self_rls.sql — Phase 3: tenant-self read scope
--
-- The Phase 1 RLS for units / properties was staff-only on SELECT:
--   (organization_id = current_user_org_id() AND is_org_staff())
--   OR is_super_admin()
-- The tenant portal (slice 6c+6d) needs a tenant to read THEIR OWN unit and
-- the property that unit belongs to so the welcome page can render.
--
-- This migration drops and recreates both *_select policies with an added
-- tenant-self branch — matching the single-policy-with-multiple-OR-branches
-- pattern established by leases_select in 20260521000100_phase3_leases.
--
-- The tenant-self predicate uses tenants.user_id = auth.uid() as the anchor
-- and chases the FK chain inside an EXISTS:
--   units      — direct: tenants.unit_id = units.id
--   properties — one hop via units: tenants.unit_id → units.property_id
-- buildings is intentionally NOT in scope here — the welcome page does not
-- surface building information; it can layer in when a later portal slice
-- needs it.
--
-- Write policies (*_write) are unchanged: a tenant cannot mutate any of these
-- rows, only read their own. The existing org-manager + super-admin branches
-- on the write side remain authoritative.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

-- ---- units_select ---------------------------------------------------------
alter table public.units enable row level security;

drop policy if exists units_select on public.units;
create policy units_select on public.units
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.unit_id = units.id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- properties_select ----------------------------------------------------
alter table public.properties enable row level security;

drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      join public.units u on u.id = t.unit_id
      where u.property_id = properties.id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );
