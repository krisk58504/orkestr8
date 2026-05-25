-- ===========================================================================
-- 20260603000100_phase5_owner_portal.sql — Phase 5 slice 10e: owner portal
--
-- The novel-pattern migration of Phase 5. Two coherent changes in one
-- migration (reviewed as a unit per slice 10e audit acceptance):
--
--   1. NEW TABLE  public.property_owners — junction linking users to
--                                          properties they own. Minimal
--                                          6-column shape per
--                                          PHASE_5_PLAN.md §2c (reconciled
--                                          per slice 10e audit:
--                                          id + organization_id added vs
--                                          original sketch; revoked_at /
--                                          revoked_by / updated_at dropped
--                                          — revocation is DELETE captured
--                                          by audit log). UNIQUE (user_id,
--                                          property_id) prevents duplicate
--                                          grants.
--
--   2. SIX EXISTING `_select` POLICIES extended with owner-self branch
--      via drop-and-recreate:
--        - properties_select   (was M3LU 4-branch — adds branch 5)
--        - units_select        (was M3LU 4-branch — adds branch 5)
--        - buildings_select    (was M0700 2-branch — adds branch 3;
--                               closes §11.5 item 1 incidentally — the
--                               buildings tenant-self gap stays open but
--                               buildings-via-owner is now wired)
--        - leases_select       (was M3L  3-branch — adds branch 4)
--        - rent_charges_select (was 10a  3-branch — adds branch 4)
--        - payments_select     (was 10b  3-branch — adds branch 4)
--      Each rewrite preserves all existing branches VERBATIM and appends
--      the owner-self branch immediately before is_super_admin().
--
-- ===========================================================================
-- REVIEWER ATTENTION — §13.5 NOVEL PATTERN
-- ===========================================================================
-- This is Phase 5's load-bearing novel pattern: **junction-table-mediated
-- portal isolation**. Unlike Phase 3's tenant-self pattern (single-FK chain
-- via tenants.user_id), the owner-self chain goes through the
-- property_owners junction. Key invariants for §13 sign-off:
--
-- (a) The owner-self read predicate is ROLE-AGNOSTIC. It checks only
--     `property_owners.user_id = auth.uid()` — not is_investor or any
--     role membership. This is the dual-mode-access enabler per
--     PHASE_5_PLAN.md §0.5 decision 4: a user holding OWNER (staff) +
--     property_owners rows is admitted via the same predicate as an
--     INVESTOR-only user. No role check; no role-cohort check.
--
-- (b) property_owners writes are is_org_manager()-gated — NOT
--     can_write_tenants. Granting property ownership has financial-data
--     implications closer to "change billing details" than "edit tenant
--     record." LEASING_AGENT is explicitly excluded. An INVESTOR cannot
--     self-grant additional property visibility (only managers grant).
--
-- (c) §8.1 cross-org FK pin pattern applies to property_owners writes —
--     both user_id and property_id must resolve to rows in the manager's
--     own org. Plus the junction row's own organization_id must match.
--     Without these pins, a manager in Org A could craft a grant with
--     organization_id = A pointing at Org B's user or property.
--
-- (d) The six drop-and-recreate rewrites preserve all prior branches
--     verbatim. §13 reviewer MUST diff each policy against the
--     corresponding prior-migration source (M3LU / M3L / M0700 / 10a /
--     10b) and confirm zero branches were lost or modified — only the
--     owner-self branch was added. The cumulative RLS test suite
--     regression must still pass post-migration: Suite 7 (leases
--     tenant-self), Suite 10 (units/properties tenant-self direct +
--     lease-mediated), Suite 11 (maintenance — unaffected, sanity),
--     Suite 14 (Phase 5 entity tables) — none should regress.
--
-- (e) property_owners_select includes a SELF-READ branch
--     (`user_id = auth.uid()`) so INVESTOR users can introspect their
--     own ownership grants. This is intentional per slice 10e audit
--     decision 11 — without it, INVESTORs see properties (via the
--     owner-self chain) but cannot verify "what am I marked as owning?"
--
-- ===========================================================================
-- KNOWN LIMITATION — INVESTOR invite flow
-- ===========================================================================
-- Slice 10e does NOT ship a way to invite a brand-new user as an
-- INVESTOR (analog of Phase 3's invite-tenant flow). To grant property
-- ownership, the target user must FIRST be added to the org with
-- INVESTOR or OWNER role via existing user management. The
-- grantPropertyOwnership server action accepts only existing users from
-- the eligible-owner cohort dropdown.
--
-- This is tracked as Phase 5 known limitation #N for §13.6 sign-off.
-- Future work: invite-investor flow paired with the property_owners
-- grant in a single onboarding action.
-- ===========================================================================

-- ===========================================================================
-- 1. property_owners table — junction linking users to properties they own
-- ===========================================================================

create table if not exists public.property_owners (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id) on delete set null,
  constraint property_owners_user_property_unique unique (user_id, property_id)
);

create index if not exists property_owners_user_id_idx on public.property_owners(user_id);
create index if not exists property_owners_property_id_idx on public.property_owners(property_id);

-- ===========================================================================
-- RLS — property_owners
--   * SELECT: org staff + self-read (the linked user) + super_admin
--   * INSERT/UPDATE/DELETE: is_org_manager() + §8.1 cross-org FK pins on
--                            user_id and property_id (both must resolve
--                            to rows in the row's own organization_id)
-- ===========================================================================
alter table public.property_owners enable row level security;

drop policy if exists property_owners_select on public.property_owners;
create policy property_owners_select on public.property_owners
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or user_id = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists property_owners_insert on public.property_owners;
create policy property_owners_insert on public.property_owners
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.is_org_manager()
      and exists (
        select 1 from public.users u
        where u.id = property_owners.user_id
          and u.organization_id = property_owners.organization_id
      )
      and exists (
        select 1 from public.properties p
        where p.id = property_owners.property_id
          and p.organization_id = property_owners.organization_id
      )
    )
    or public.is_super_admin()
  );

drop policy if exists property_owners_update on public.property_owners;
create policy property_owners_update on public.property_owners
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.is_org_manager()
      and exists (
        select 1 from public.users u
        where u.id = property_owners.user_id
          and u.organization_id = property_owners.organization_id
      )
      and exists (
        select 1 from public.properties p
        where p.id = property_owners.property_id
          and p.organization_id = property_owners.organization_id
      )
    )
    or public.is_super_admin()
  )
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.is_org_manager()
      and exists (
        select 1 from public.users u
        where u.id = property_owners.user_id
          and u.organization_id = property_owners.organization_id
      )
      and exists (
        select 1 from public.properties p
        where p.id = property_owners.property_id
          and p.organization_id = property_owners.organization_id
      )
    )
    or public.is_super_admin()
  );

drop policy if exists property_owners_delete on public.property_owners;
create policy property_owners_delete on public.property_owners
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- 2. Six existing _select policies extended with owner-self branch
--    Each preserves prior branches VERBATIM; owner-self appended as
--    penultimate branch (just before is_super_admin).
-- ===========================================================================

-- ---- properties_select (was M3LU 4-branch — adds branch 5) ---------------
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select to authenticated
  using (
    -- Preserves 4 branches from 20260525000100_phase3_tenant_lease_unit_rls.sql
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
    -- New owner-self branch (slice 10e)
    or exists (
      select 1 from public.property_owners po
      where po.property_id = properties.id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- units_select (was M3LU 4-branch — adds branch 5) --------------------
drop policy if exists units_select on public.units;
create policy units_select on public.units
  for select to authenticated
  using (
    -- Preserves 4 branches from 20260525000100_phase3_tenant_lease_unit_rls.sql
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
    -- New owner-self branch (slice 10e)
    or exists (
      select 1 from public.property_owners po
      where po.property_id = units.property_id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- buildings_select (was M0700 2-branch — adds branch 3) ---------------
-- Note: no tenant-self branch is added here in slice 10e. §11.5 item 1
-- (deferred buildings tenant-self) remains open. Owner-self lands first
-- because the owner portal needs it; tenant-self can be added later via
-- the same drop-and-recreate pattern if a portal slice needs it.
drop policy if exists buildings_select on public.buildings;
create policy buildings_select on public.buildings
  for select to authenticated
  using (
    -- Preserves 2 branches from 20260518000700_rls.sql (Phase 1 minimal)
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    -- New owner-self branch (slice 10e)
    or exists (
      select 1 from public.property_owners po
      where po.property_id = buildings.property_id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- leases_select (was M3L 3-branch — adds branch 4) --------------------
drop policy if exists leases_select on public.leases;
create policy leases_select on public.leases
  for select to authenticated
  using (
    -- Preserves 3 branches from 20260521000100_phase3_leases.sql
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.lease_id = leases.id and t.user_id = auth.uid()
    )
    -- New owner-self branch (slice 10e): chain leases.unit_id → units.property_id → property_owners
    or exists (
      select 1 from public.property_owners po
      join public.units u on u.property_id = po.property_id
      where u.id = leases.unit_id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- rent_charges_select (was 10a 3-branch — adds branch 4) --------------
drop policy if exists rent_charges_select on public.rent_charges;
create policy rent_charges_select on public.rent_charges
  for select to authenticated
  using (
    -- Preserves 3 branches from 20260601000100_phase5_rent_charges.sql
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or exists (
      select 1 from public.tenants t
      where t.id = rent_charges.tenant_id
        and t.user_id = auth.uid()
    )
    -- New owner-self branch (slice 10e): rent_charges.lease_id → leases.unit_id → units.property_id → property_owners
    or exists (
      select 1 from public.property_owners po
      join public.units u on u.property_id = po.property_id
      join public.leases l on l.unit_id = u.id
      where l.id = rent_charges.lease_id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ---- payments_select (was 10b 3-branch — adds branch 4) ------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    -- Preserves 3 branches from 20260602000100_phase5_payments.sql
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or exists (
      select 1 from public.tenants t
      where t.id = payments.tenant_id
        and t.user_id = auth.uid()
    )
    -- New owner-self branch (slice 10e): payments.charge_id → rent_charges.lease_id → leases.unit_id → units.property_id → property_owners
    or exists (
      select 1 from public.property_owners po
      join public.units u on u.property_id = po.property_id
      join public.leases l on l.unit_id = u.id
      join public.rent_charges rc on rc.lease_id = l.id
      where rc.id = payments.charge_id
        and po.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new property_owners table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
