-- ===========================================================================
-- 20260525000100_phase3_tenant_lease_unit_rls.sql — Phase 3: lease-mediated
-- tenant-self read scope for units and properties.
--
-- 20260524000100 added tenant-self SELECT branches keyed on tenants.unit_id
-- and the one-hop tenants.unit_id → units.property_id. That covers tenants
-- whose unit assignment lives on the tenant row directly. But the canonical
-- record of a tenant's residence is their lease — leases.unit_id is required
-- and never null — and in practice tenants often have a lease without ever
-- having tenants.unit_id / tenants.property_id populated.
--
-- This migration adds a fourth branch to each *_select policy so a tenant
-- can also reach the unit (and its property) referenced by their lease:
--   units      — exists tenants JOIN leases on l.id = t.lease_id
--                 where l.unit_id = units.id and t.user_id = auth.uid()
--   properties — exists tenants JOIN leases JOIN units
--                 where u.property_id = properties.id and t.user_id = auth.uid()
--
-- All previously-allowed branches are preserved (org-staff, tenant-direct,
-- super-admin) — this is purely additive. No status filter on the lease
-- join: it matches leases_select precedent, which allows tenant-self read
-- on ended/upcoming leases too. A tenant whose only lease is ended retains
-- visibility into the associated unit/property; consistent with the rest of
-- the tenant-self read scope.
--
-- Write policies (*_write) are unchanged: a tenant still cannot mutate any
-- of these rows.
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
    or exists (
      select 1 from public.tenants t
      join public.leases l on l.id = t.lease_id
      where l.unit_id = units.id and t.user_id = auth.uid()
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
    or exists (
      select 1 from public.tenants t
      join public.leases l on l.id = t.lease_id
      join public.units u on u.id = l.unit_id
      where u.property_id = properties.id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );
