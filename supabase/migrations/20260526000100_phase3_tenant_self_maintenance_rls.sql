-- ===========================================================================
-- 20260526000100_phase3_tenant_self_maintenance_rls.sql — Phase 3 slice 7:
-- tenant-self RLS branches for maintenance_requests.
--
-- The Phase 2 RLS policies (20260519000800_phase2_rls.sql) covered:
--   SELECT: org-staff OR reported_by = auth.uid() OR super-admin
--   INSERT: org-staff OR super-admin
-- which let a tenant re-read a request they reported but did NOT let a tenant
-- INSERT a request from the portal, nor see staff-created requests that name
-- the tenant via tenant_id.
--
-- This migration adds two additive branches:
--   * SELECT (new): tenant can read any maintenance_request whose tenant_id
--     points to their own tenant row — so a staff-created request on the
--     tenant's behalf is visible to them.
--   * INSERT (new): tenant can self-insert a request, defense-in-depth:
--       - reported_by must equal the inserter's auth uid
--       - the inserter must own a tenant row in the same organization
--       - if tenant_id is set, it must equal the inserter's own tenant.id
--
-- All previously-allowed branches are preserved. Update and delete policies
-- are unchanged in this slice — tenant cancellation of their own pending
-- requests is deferred to a future slice.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

alter table public.maintenance_requests enable row level security;

-- ---- maintenance_requests_select -----------------------------------------
drop policy if exists maintenance_requests_select on public.maintenance_requests;
create policy maintenance_requests_select on public.maintenance_requests
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or reported_by = auth.uid()
    or exists (
      select 1 from public.tenants t
      where t.id = maintenance_requests.tenant_id
        and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- maintenance_requests_insert -----------------------------------------
drop policy if exists maintenance_requests_insert on public.maintenance_requests;
create policy maintenance_requests_insert on public.maintenance_requests
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or (
      reported_by = auth.uid()
      and exists (
        select 1 from public.tenants t
        where t.user_id = auth.uid()
          and t.organization_id = maintenance_requests.organization_id
          and (
            maintenance_requests.tenant_id is null
            or maintenance_requests.tenant_id = t.id
          )
      )
    )
    or public.is_super_admin()
  );
