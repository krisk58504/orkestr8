-- ===========================================================================
-- 20260603000200_phase5_owner_portal_recursion_fix.sql
--   Critical follow-up to slice 10e (9685840). Fixes mutual RLS recursion
--   introduced by the owner-self branches added in 20260603000100.
--
-- ===========================================================================
-- FAILURE MODE
-- ===========================================================================
-- Slice 10e added owner-self branches to six _select policies:
--   properties / units / buildings / leases / rent_charges / payments
--
-- Each owner-self branch was an inline EXISTS subquery that joined the
-- property_owners junction to ANOTHER RLS-protected table (units, leases,
-- and/or rent_charges) in a chain. For example, leases_select's owner-self
-- branch joined property_owners → units. units_select's tenant-lease-
-- mediated branch (preserved from M3LU) joins back to leases. The chain
-- forms a cycle:
--
--     units ⇄ leases ⇄ rent_charges ⇄ payments
--
-- When a query (or query plan) traverses any of these tables, the policy
-- evaluator re-enters each table's _select policy for the subquery join.
-- Postgres detects the cycle and aborts with:
--
--   SQLSTATE 42P17  "infinite recursion detected in policy for relation X"
--
-- Manifest symptom: managers loading /properties saw ZERO rows. The
-- staff-org-scoped branch is correct at the policy-evaluation level, but
-- the planner attempted the recursive owner-self subqueries first; the
-- abort short-circuited the entire query and Supabase returned an empty
-- set (with the error surfaced in network/logs).
--
-- ===========================================================================
-- ROOT CAUSE
-- ===========================================================================
-- The owner-self subqueries violated the established Phase 1 helper
-- pattern. EVERY existing RLS-bypassing helper in this codebase
-- (current_user_org_id, is_super_admin, has_role, is_org_staff,
-- is_org_manager, can_write_tenants) is `LANGUAGE sql STABLE SECURITY
-- DEFINER SET search_path TO 'public'`. The SECURITY DEFINER attribute
-- is load-bearing — it runs the function as the function owner
-- (postgres / table owner), which bypasses RLS on any table the function
-- reads. That bypass is what breaks recursion when reading
-- RLS-protected tables (notably public.users / public.user_roles in
-- the existing helpers).
--
-- The slice 10e owner-self subqueries inlined table reads directly
-- inside policy USING expressions — RLS applied recursively to each
-- read — cycle.
--
-- ===========================================================================
-- FIX
-- ===========================================================================
-- Introduce SIX SECURITY DEFINER helper functions, one per affected
-- table. Each walks the property_owners chain inside the function body.
-- The body runs as the function owner, bypassing RLS on its internal
-- reads. The owner-self branch on each policy becomes a single helper
-- call (boolean return), breaking the recursion cleanly.
--
-- Pattern mirrors current_user_org_id() exactly: same language, same
-- volatility (STABLE), same security attribute, same search_path
-- pinning, same GRANT EXECUTE to authenticated.
--
-- All TENANT-SELF branches on the six policies are preserved VERBATIM
-- from the live state (captured via pg_get_expr post-slice-10e). Only
-- the owner-self branch is substituted.
--
-- ===========================================================================
-- §13.5 REVIEWER-ATTENTION UPDATE
-- ===========================================================================
-- Junction-table-mediated portal isolation patterns (the slice 10e
-- novel pattern) require SECURITY DEFINER helpers when the chain
-- walks tables that themselves have RLS branches using the same
-- junction. The recursive-EXISTS pitfall is a real risk; the helper
-- pattern is the standard mitigation. This lesson should be:
--   (1) reflected in the §13.5 sign-off paragraph,
--   (2) surfaced as a Phase 5 RLS authoring discipline for any
--       future portal-mediated isolation work (e.g., Phase 6 amenity
--       reservations if portal users get scoped views),
--   (3) referenced from the Phase 5 known-limitations list as a
--       resolved-during-execution gap.
-- ===========================================================================

-- ---- 1. SECURITY DEFINER helpers ----------------------------------------

create or replace function public.user_can_see_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.property_owners po
    where po.property_id = p_property_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_see_unit(p_unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.units u
    join public.property_owners po on po.property_id = u.property_id
    where u.id = p_unit_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_see_building(p_building_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.buildings b
    join public.property_owners po on po.property_id = b.property_id
    where b.id = p_building_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_see_lease(p_lease_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.leases l
    join public.units u on u.id = l.unit_id
    join public.property_owners po on po.property_id = u.property_id
    where l.id = p_lease_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_see_rent_charge(p_charge_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rent_charges rc
    join public.leases l on l.id = rc.lease_id
    join public.units u on u.id = l.unit_id
    join public.property_owners po on po.property_id = u.property_id
    where rc.id = p_charge_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_see_payment(p_payment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payments p
    join public.rent_charges rc on rc.id = p.charge_id
    join public.leases l on l.id = rc.lease_id
    join public.units u on u.id = l.unit_id
    join public.property_owners po on po.property_id = u.property_id
    where p.id = p_payment_id and po.user_id = auth.uid()
  );
$$;

grant execute on function public.user_can_see_property(uuid)    to authenticated;
grant execute on function public.user_can_see_unit(uuid)         to authenticated;
grant execute on function public.user_can_see_building(uuid)     to authenticated;
grant execute on function public.user_can_see_lease(uuid)        to authenticated;
grant execute on function public.user_can_see_rent_charge(uuid)  to authenticated;
grant execute on function public.user_can_see_payment(uuid)      to authenticated;

-- ===========================================================================
-- 2. Drop-and-recreate the six _select policies with helper calls
--    Tenant-self branches preserved VERBATIM from the post-slice-10e live
--    state (captured via pg_get_expr in the diagnostic). Only the
--    owner-self branch is substituted — every other branch is identical.
-- ===========================================================================

-- ---- properties_select ---------------------------------------------------
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim)
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    -- Branch 2: tenant-direct (preserved verbatim from M3T/M3LU)
    or exists (
      select 1 from public.tenants t
      join public.units u on u.id = t.unit_id
      where u.property_id = properties.id and t.user_id = auth.uid()
    )
    -- Branch 3: tenant-lease-mediated (preserved verbatim from M3LU)
    or exists (
      select 1 from public.tenants t
      join public.leases l on l.id = t.lease_id
      join public.units u on u.id = l.unit_id
      where u.property_id = properties.id and t.user_id = auth.uid()
    )
    -- Branch 4: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_property(properties.id)
    -- Branch 5: super_admin
    or public.is_super_admin()
  );

-- ---- units_select --------------------------------------------------------
drop policy if exists units_select on public.units;
create policy units_select on public.units
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim)
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    -- Branch 2: tenant-direct via tenants.unit_id (preserved verbatim from M3T)
    or exists (
      select 1 from public.tenants t
      where t.unit_id = units.id and t.user_id = auth.uid()
    )
    -- Branch 3: tenant-lease-mediated (preserved verbatim from M3LU)
    or exists (
      select 1 from public.tenants t
      join public.leases l on l.id = t.lease_id
      where l.unit_id = units.id and t.user_id = auth.uid()
    )
    -- Branch 4: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_unit(units.id)
    -- Branch 5: super_admin
    or public.is_super_admin()
  );

-- ---- buildings_select ----------------------------------------------------
drop policy if exists buildings_select on public.buildings;
create policy buildings_select on public.buildings
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim from Phase 1 minimal)
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    -- Branch 2: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_building(buildings.id)
    -- Branch 3: super_admin
    or public.is_super_admin()
  );

-- ---- leases_select -------------------------------------------------------
drop policy if exists leases_select on public.leases;
create policy leases_select on public.leases
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim from M3L)
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    -- Branch 2: tenant-self via tenants.lease_id (preserved verbatim from M3L)
    or exists (
      select 1 from public.tenants t
      where t.lease_id = leases.id and t.user_id = auth.uid()
    )
    -- Branch 3: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_lease(leases.id)
    -- Branch 4: super_admin
    or public.is_super_admin()
  );

-- ---- rent_charges_select -------------------------------------------------
drop policy if exists rent_charges_select on public.rent_charges;
create policy rent_charges_select on public.rent_charges
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim from slice 10a — can_write_tenants gate)
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    -- Branch 2: tenant-self via tenants.user_id (preserved verbatim from slice 10a)
    or exists (
      select 1 from public.tenants t
      where t.id = rent_charges.tenant_id and t.user_id = auth.uid()
    )
    -- Branch 3: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_rent_charge(rent_charges.id)
    -- Branch 4: super_admin
    or public.is_super_admin()
  );

-- ---- payments_select -----------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    -- Branch 1: staff (preserved verbatim from slice 10b — can_write_tenants gate)
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    -- Branch 2: tenant-self via tenants.user_id (preserved verbatim from slice 10b)
    or exists (
      select 1 from public.tenants t
      where t.id = payments.tenant_id and t.user_id = auth.uid()
    )
    -- Branch 3: owner-self (recursion-fixed via SECURITY DEFINER helper)
    or public.user_can_see_payment(payments.id)
    -- Branch 4: super_admin
    or public.is_super_admin()
  );

-- Note: property_owners_select is NOT modified — it does not have an
-- owner-self chain branch (it has a direct self-read on user_id =
-- auth.uid() which is recursion-safe).
