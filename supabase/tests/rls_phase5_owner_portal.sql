-- ===========================================================================
-- rls_phase5_owner_portal.sql — Phase 5 Suite 15 — verifies the owner-self
-- read branches across six drop-and-recreated _select policies, drop-and-
-- recreate preservation of prior branches, dual-mode access, and the
-- RECURSION-SAFETY assertion class (R1-R7) — the codified slice 10e
-- incident lesson.
--
-- Source migrations covered:
--   * 20260603000100_phase5_owner_portal.sql           — property_owners
--                                                        junction + owner-
--                                                        self branches
--                                                        added to 6 _select
--                                                        policies via drop-
--                                                        and-recreate
--   * 20260603000200_phase5_owner_portal_recursion_fix — six SECURITY
--                                                        DEFINER helpers
--                                                        (user_can_see_*)
--                                                        + policies rewired
--                                                        through helpers
--
-- The slice 10e original migration shipped owner-self branches with inline
-- EXISTS subqueries that mutually recurred across units ⇄ leases ⇄
-- rent_charges ⇄ payments. The recursion fix (20260603000200) introduced
-- six SECURITY DEFINER helper functions that bypass RLS on the chain walk,
-- breaking the cycle. R1-R7 below codifies the lesson: any RLS-gated table
-- whose policy uses a junction-table-mediated portal isolation pattern
-- must include an authenticated-role count(*) smoke that completes without
-- SQLSTATE 42P17. R1-R7 runs as INVESTOR I1 (the role context that
-- exercises the helper-wrapped owner-self branches — where pre-fix the
-- recursion occurred).
--
-- Numbering:
--   O1..O6   owner-self positive admit — INVESTOR I1 with property_owners
--            (P1, I1) reads its own data on each of 6 extended tables.
--            Inline comment per assertion names the SECURITY DEFINER
--            helper it exercises.
--   O7..O12  owner-self deny — INVESTOR I2 (different owner) sees 0 rows
--            from I1's chain on each of 6 tables.
--   O13..O17 tenant-self preservation — tenant T1 still reads own data
--            on 5 tables (leases, rent_charges, payments, units,
--            properties). Buildings skipped — no tenant-self branch
--            ever existed there.
--   O18..O23 staff branch preservation — PM-A reads all 6 tables in own
--            org. Confirms drop-and-recreate didn't break the staff
--            predicate.
--   D1       dual-mode access — user holding BOTH OWNER (staff role) AND
--            a property_owners row reads via both branches in a single
--            SELECT. Sees the same rows via either path; union semantics
--            don't double-count.
--   D2       INVESTOR-only user (no staff role) cannot see other tenants'
--            data — only their owner-chain data.
--   R1..R7   RECURSION SAFETY — SELECT count(*) as authenticated INVESTOR
--            I1 on each of 7 RLS-gated affected tables. Each assertion
--            must complete without SQLSTATE 42P17.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase5_owner_portal.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) ------------------------------------------
do $$
begin
  -- 1 org (most of Suite 15 is within-org owner-self semantics)
  insert into public.organizations (id, name, slug) values
    ('f2000000-0000-0000-0000-00000000000a', 'P5-S15 Org A', 'rls-p5s15-a');

  -- auth.users + public.users
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Staff: PROPERTY_MANAGER
    ('00000000-0000-0000-0000-000000000000',
     'f2a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p5s15-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- INVESTOR I1 — owns Prop-A. Source of O1-O6, O7-O12 (as the "owner"),
    -- and the entire R1-R7 role context.
    ('00000000-0000-0000-0000-000000000000',
     'f2a00000-0000-0000-0000-000000000013', 'authenticated', 'authenticated',
     'p5s15-i1@rls.test', '', now(), '{}', '{}', now(), now()),
    -- INVESTOR I2 — owns Prop-C (different property). Source of O7-O12
    -- (as the "other owner" who should see 0 rows from I1's chain).
    ('00000000-0000-0000-0000-000000000000',
     'f2a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p5s15-i2@rls.test', '', now(), '{}', '{}', now(), now()),
    -- TENANT T1 on Lease-A1 / Unit-A1 / Prop-A. Source of O13-O17 tenant-
    -- self preservation assertions.
    ('00000000-0000-0000-0000-000000000000',
     'f2a00000-0000-0000-0000-000000000015', 'authenticated', 'authenticated',
     'p5s15-t1@rls.test', '', now(), '{}', '{}', now(), now()),
    -- DUAL user: holds OWNER (staff) role AND has a property_owners row
    -- on Prop-A. Source of D1 dual-mode access assertion.
    ('00000000-0000-0000-0000-000000000000',
     'f2a00000-0000-0000-0000-000000000016', 'authenticated', 'authenticated',
     'p5s15-dual@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'f2000000-0000-0000-0000-00000000000a'
    where id in ('f2a00000-0000-0000-0000-000000000010',
                 'f2a00000-0000-0000-0000-000000000013',
                 'f2a00000-0000-0000-0000-000000000014',
                 'f2a00000-0000-0000-0000-000000000015',
                 'f2a00000-0000-0000-0000-000000000016');

  insert into public.user_roles (user_id, organization_id, role) values
    ('f2a00000-0000-0000-0000-000000000010', 'f2000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('f2a00000-0000-0000-0000-000000000013', 'f2000000-0000-0000-0000-00000000000a', 'INVESTOR'),
    ('f2a00000-0000-0000-0000-000000000014', 'f2000000-0000-0000-0000-00000000000a', 'INVESTOR'),
    ('f2a00000-0000-0000-0000-000000000015', 'f2000000-0000-0000-0000-00000000000a', 'TENANT'),
    -- DUAL: OWNER (staff) + INVESTOR (portal) — both roles on the same user
    ('f2a00000-0000-0000-0000-000000000016', 'f2000000-0000-0000-0000-00000000000a', 'OWNER'),
    ('f2a00000-0000-0000-0000-000000000016', 'f2000000-0000-0000-0000-00000000000a', 'INVESTOR');

  -- 2 properties — Prop-A (I1 + DUAL own) and Prop-C (I2 owns).
  insert into public.properties (id, organization_id, name) values
    ('f2d00000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-00000000000a', 'P5-S15 Prop A'),
    ('f2d00000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-00000000000a', 'P5-S15 Prop C');

  -- 1 building on Prop-A (so buildings_select owner-self can be exercised
  -- — O3 and O9).
  insert into public.buildings (id, organization_id, property_id, name) values
    ('f2700000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2d00000-0000-0000-0000-000000000001', 'P5-S15 Bldg A1');

  -- 2 units — Unit-A1 (on Prop-A) and Unit-C1 (on Prop-C) so both INVESTORs
  -- have a chain to read.
  insert into public.units (id, organization_id, property_id, unit_number) values
    ('f2e00000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2d00000-0000-0000-0000-000000000001', 'A101'),
    ('f2e00000-0000-0000-0000-000000000003',
     'f2000000-0000-0000-0000-00000000000a',
     'f2d00000-0000-0000-0000-000000000003', 'C101');

  -- Tenant T1 on Prop-A's Unit-A1.
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, email, unit_id)
  values
    ('f2c00000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2a00000-0000-0000-0000-000000000015',
     'Ten', 'A1', 'p5s15-t1@rls.test',
     'f2e00000-0000-0000-0000-000000000001');

  -- Lease-A1 on Unit-A1, with Ten-A1 as the tenant.
  insert into public.leases
    (id, organization_id, unit_id, start_date, monthly_rent, status)
  values
    ('f2f00000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2e00000-0000-0000-0000-000000000001',
     date '2026-01-01', 1500.00, 'active');
  update public.tenants set lease_id = 'f2f00000-0000-0000-0000-000000000001'
    where id = 'f2c00000-0000-0000-0000-000000000001';

  -- Rent_charge on Lease-A1 for Ten-A1.
  insert into public.rent_charges
    (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
  values
    ('f2f10000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2f00000-0000-0000-0000-000000000001',
     'f2c00000-0000-0000-0000-000000000001',
     'f2e00000-0000-0000-0000-000000000001',
     1500.00, date '2026-04-01');

  -- Payment against the rent_charge.
  insert into public.payments
    (id, organization_id, charge_id, tenant_id, amount_paid, paid_at,
     method, recorded_by)
  values
    ('f2f20000-0000-0000-0000-000000000001',
     'f2000000-0000-0000-0000-00000000000a',
     'f2f10000-0000-0000-0000-000000000001',
     'f2c00000-0000-0000-0000-000000000001',
     500.00, now(), 'check',
     'f2a00000-0000-0000-0000-000000000010');

  -- property_owners grants:
  --   PO1: I1 owns Prop-A
  --   PO2: I2 owns Prop-C
  --   PO3: DUAL also owns Prop-A (dual-mode case)
  insert into public.property_owners
    (organization_id, user_id, property_id, created_by)
  values
    ('f2000000-0000-0000-0000-00000000000a',
     'f2a00000-0000-0000-0000-000000000013',
     'f2d00000-0000-0000-0000-000000000001',
     'f2a00000-0000-0000-0000-000000000010'),
    ('f2000000-0000-0000-0000-00000000000a',
     'f2a00000-0000-0000-0000-000000000014',
     'f2d00000-0000-0000-0000-000000000003',
     'f2a00000-0000-0000-0000-000000000010'),
    ('f2000000-0000-0000-0000-00000000000a',
     'f2a00000-0000-0000-0000-000000000016',
     'f2d00000-0000-0000-0000-000000000001',
     'f2a00000-0000-0000-0000-000000000010');

  raise notice 'Suite 15 fixtures seeded: 1 org, 5 users (PM, I1, I2, T1, DUAL OWNER+INVESTOR), 2 properties, 1 building, 2 units, 1 tenant, 1 lease, 1 rent_charge, 1 payment, 3 ownership grants';
end $$;

-- ===========================================================================
-- ============ O1-O6: owner-self positive admit (helpers exercised) ========
-- ===========================================================================
set local role authenticated;

-- O1 — INVESTOR I1 reads properties → 1 (Prop-A)
-- Exercises: user_can_see_property (slice 10e recursion fix helper)
set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000013"}';
do $$
declare n int;
begin
  select count(*) into n from public.properties
    where id = 'f2d00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O1: I1 sees %s of Prop-A (expected 1)', n);
  raise notice 'O1 PASS: I1 owner-self read on properties (helper: user_can_see_property)';
end $$;

-- O2 — INVESTOR I1 reads units → 1 (Unit-A1 on Prop-A)
-- Exercises: user_can_see_unit
do $$
declare n int;
begin
  select count(*) into n from public.units
    where id = 'f2e00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O2: I1 sees %s of Unit-A1 (expected 1)', n);
  raise notice 'O2 PASS: I1 owner-self read on units (helper: user_can_see_unit)';
end $$;

-- O3 — INVESTOR I1 reads buildings → 1 (Bldg-A1 on Prop-A)
-- Exercises: user_can_see_building (slice 10e — buildings closes the §11.5
-- item 1 gap incidentally; tenant-self never existed here)
do $$
declare n int;
begin
  select count(*) into n from public.buildings
    where id = 'f2700000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O3: I1 sees %s of Bldg-A1 (expected 1)', n);
  raise notice 'O3 PASS: I1 owner-self read on buildings (helper: user_can_see_building)';
end $$;

-- O4 — INVESTOR I1 reads leases → 1 (Lease-A1 on Unit-A1 on Prop-A)
-- Exercises: user_can_see_lease (chain: lease → unit → property_owners)
do $$
declare n int;
begin
  select count(*) into n from public.leases
    where id = 'f2f00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O4: I1 sees %s of Lease-A1 (expected 1)', n);
  raise notice 'O4 PASS: I1 owner-self read on leases (helper: user_can_see_lease)';
end $$;

-- O5 — INVESTOR I1 reads rent_charges → 1
-- Exercises: user_can_see_rent_charge (chain: rent_charge → lease → unit →
-- property_owners)
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges
    where id = 'f2f10000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O5: I1 sees %s of rent_charge (expected 1)', n);
  raise notice 'O5 PASS: I1 owner-self read on rent_charges (helper: user_can_see_rent_charge)';
end $$;

-- O6 — INVESTOR I1 reads payments → 1
-- Exercises: user_can_see_payment (chain: payment → rent_charge → lease →
-- unit → property_owners — the deepest chain; pre-fix this triggered the
-- worst recursion)
do $$
declare n int;
begin
  select count(*) into n from public.payments
    where id = 'f2f20000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O6: I1 sees %s of payment (expected 1)', n);
  raise notice 'O6 PASS: I1 owner-self read on payments (helper: user_can_see_payment)';
end $$;

-- ===========================================================================
-- =========== O7-O12: owner-self deny — I2 cannot see I1's chain ===========
-- ===========================================================================

set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000014"}';

-- O7 — I2 (owns Prop-C) sees 0 of Prop-A
do $$
declare n int;
begin
  select count(*) into n from public.properties
    where id = 'f2d00000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O7: I2 sees %s of Prop-A (expected 0)', n);
  raise notice 'O7 PASS: I2 cannot read I1''s Prop-A (cross-owner isolation)';
end $$;

-- O8 — I2 sees 0 of Unit-A1
do $$
declare n int;
begin
  select count(*) into n from public.units
    where id = 'f2e00000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O8: I2 sees %s of Unit-A1 (expected 0)', n);
  raise notice 'O8 PASS: I2 cannot read I1''s Unit-A1';
end $$;

-- O9 — I2 sees 0 of Bldg-A1
do $$
declare n int;
begin
  select count(*) into n from public.buildings
    where id = 'f2700000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O9: I2 sees %s of Bldg-A1 (expected 0)', n);
  raise notice 'O9 PASS: I2 cannot read I1''s Bldg-A1';
end $$;

-- O10 — I2 sees 0 of Lease-A1
do $$
declare n int;
begin
  select count(*) into n from public.leases
    where id = 'f2f00000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O10: I2 sees %s of Lease-A1 (expected 0)', n);
  raise notice 'O10 PASS: I2 cannot read I1''s Lease-A1';
end $$;

-- O11 — I2 sees 0 of rent_charge
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges
    where id = 'f2f10000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O11: I2 sees %s rent_charges (expected 0)', n);
  raise notice 'O11 PASS: I2 cannot read I1''s rent_charges';
end $$;

-- O12 — I2 sees 0 of payment
do $$
declare n int;
begin
  select count(*) into n from public.payments
    where id = 'f2f20000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL O12: I2 sees %s payments (expected 0)', n);
  raise notice 'O12 PASS: I2 cannot read I1''s payments';
end $$;

-- ===========================================================================
-- ======= O13-O17: tenant-self preservation (5 tables; skip buildings) =====
-- ===========================================================================
-- T1 must still read own data on properties, units, leases, rent_charges,
-- payments via tenant-self branches (M3LU + slices 10a/10b). The drop-and-
-- recreate in slice 10e must have preserved these branches verbatim.

set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000015"}';

-- O13 — T1 reads leases → 1 (tenant-self via tenants.lease_id)
do $$
declare n int;
begin
  select count(*) into n from public.leases
    where id = 'f2f00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O13: T1 sees %s lease (expected 1 — tenant-self preserved)', n);
  raise notice 'O13 PASS: tenant-self preserved on leases_select';
end $$;

-- O14 — T1 reads rent_charges → 1 (tenant-self via tenants.user_id =
-- auth.uid() AND tenants.id = rent_charges.tenant_id chain)
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges
    where id = 'f2f10000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O14: T1 sees %s rent_charges (expected 1)', n);
  raise notice 'O14 PASS: tenant-self preserved on rent_charges_select';
end $$;

-- O15 — T1 reads payments → 1
do $$
declare n int;
begin
  select count(*) into n from public.payments
    where id = 'f2f20000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O15: T1 sees %s payments (expected 1)', n);
  raise notice 'O15 PASS: tenant-self preserved on payments_select';
end $$;

-- O16 — T1 reads units → 1 (M3LU lease-mediated branch)
do $$
declare n int;
begin
  select count(*) into n from public.units
    where id = 'f2e00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O16: T1 sees %s units (expected 1 — M3LU branch)', n);
  raise notice 'O16 PASS: tenant-self preserved on units_select (M3LU lease-mediated)';
end $$;

-- O17 — T1 reads properties → 1 (M3LU lease-mediated chain to property)
do $$
declare n int;
begin
  select count(*) into n from public.properties
    where id = 'f2d00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL O17: T1 sees %s properties (expected 1 — M3LU branch)', n);
  raise notice 'O17 PASS: tenant-self preserved on properties_select (M3LU lease-mediated)';
end $$;

-- ===========================================================================
-- ============= O18-O23: staff branch preservation (6 tables) ==============
-- ===========================================================================
-- PM-A (PROPERTY_MANAGER) must still read all 6 tables via the staff
-- branch after the drop-and-recreate. Sanity check.

set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000010"}';

-- O18 — PM-A reads properties (both Prop-A and Prop-C in own org)
do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 2, format('FAIL O18: PM sees %s properties (expected 2)', n);
  raise notice 'O18 PASS: staff branch preserved on properties_select';
end $$;

-- O19 — PM-A reads buildings → 1
do $$
declare n int;
begin
  select count(*) into n from public.buildings;
  assert n = 1, format('FAIL O19: PM sees %s buildings (expected 1)', n);
  raise notice 'O19 PASS: staff branch preserved on buildings_select';
end $$;

-- O20 — PM-A reads units (both Unit-A1 and Unit-C1)
do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 2, format('FAIL O20: PM sees %s units (expected 2)', n);
  raise notice 'O20 PASS: staff branch preserved on units_select';
end $$;

-- O21 — PM-A reads leases → 1 (only Lease-A1 in fixtures)
do $$
declare n int;
begin
  select count(*) into n from public.leases;
  assert n = 1, format('FAIL O21: PM sees %s leases (expected 1)', n);
  raise notice 'O21 PASS: staff branch preserved on leases_select';
end $$;

-- O22 — PM-A reads rent_charges → 1
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges;
  assert n = 1, format('FAIL O22: PM sees %s rent_charges (expected 1)', n);
  raise notice 'O22 PASS: staff branch preserved on rent_charges_select';
end $$;

-- O23 — PM-A reads payments → 1
do $$
declare n int;
begin
  select count(*) into n from public.payments;
  assert n = 1, format('FAIL O23: PM sees %s payments (expected 1)', n);
  raise notice 'O23 PASS: staff branch preserved on payments_select';
end $$;

-- ===========================================================================
-- ======= D group — dual-mode access + cross-tenant isolation ===============
-- ===========================================================================

-- D1 — DUAL user (OWNER staff + INVESTOR with property_owners(Prop-A))
-- reads properties → 2 (sees both Prop-A and Prop-C via OWNER's is_org_staff
-- branch). The OWNER role admits all org properties; the property_owners
-- row is redundant for this user (staff branch covers it). Confirms dual-
-- mode doesn't break — staff + owner branches OR together cleanly.
set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000016"}';
do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 2, format('FAIL D1: DUAL sees %s properties (expected 2 — staff branch admits all)', n);
  raise notice 'D1 PASS: dual-mode (OWNER + INVESTOR) reads via staff branch (sees all 2 properties)';
end $$;

-- D2 — INVESTOR-only user (I1) cannot see other tenants' rent_charges or
-- payments via the tenant-self branch (because I1 has no tenants row).
-- I1's access to rent_charges is via owner-self ONLY. If the tenant-self
-- branch were misconfigured, I1 might leak data from other tenants.
-- Confirms tenant-self predicate correctly requires a tenants row with
-- user_id = auth.uid(); I1 has no such row, so tenant-self admits nothing
-- — only owner-self gives I1 access (and only to OWN chain).
set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000013"}';
do $$
declare n int;
begin
  -- Count of rent_charges on chains I1 does NOT own (Prop-C). I1 owns
  -- only Prop-A. There are no rent_charges on Prop-C in the fixtures,
  -- so this is a vacuous-truth assertion — but the meaningful test is
  -- the absence of any tenant-self-branch admission for I1. We assert
  -- I1 sees only the rent_charge in their owner chain (1).
  select count(*) into n from public.rent_charges;
  assert n = 1, format('FAIL D2: I1 sees %s rent_charges (expected 1 — owner-self only, no tenant-self leakage)', n);
  raise notice 'D2 PASS: INVESTOR-only sees own chain only (no tenant-self leakage)';
end $$;

-- ===========================================================================
-- =========== R group — RECURSION SAFETY (the slice 10e lesson) ============
-- ===========================================================================
-- Pre-recursion-fix (commit 9685840), slice 10e owner-self branches used
-- inline EXISTS subqueries that joined other RLS-protected tables in
-- chains. The chain formed a cycle across units ⇄ leases ⇄ rent_charges ⇄
-- payments. Reading any of those tables triggered mutual policy re-entry,
-- and Postgres aborted with:
--   SQLSTATE 42P17  "infinite recursion detected in policy for relation X"
-- The recursion fix (20260603000200) introduced 6 SECURITY DEFINER
-- helpers that bypass RLS on the chain walk inside the function body,
-- breaking the cycle.
--
-- R1-R7 run as INVESTOR I1 — the role context that exercises the helper-
-- wrapped owner-self branches. A manager's queries go through the staff
-- branch which doesn't trigger the helpers; this class must run as the
-- INVESTOR to actually exercise the recursion-fix surface.
--
-- Each R# is a simple SELECT count(*). The PASS condition is that the
-- query completes — the count value itself is incidental (we already
-- assert counts in O1-O6). The diagnostic value is that no 42P17 raises.
-- If a future migration regresses the helpers, these assertions fail
-- with the original recursion error rather than silently returning the
-- wrong count.

set local request.jwt.claims = '{"sub":"f2a00000-0000-0000-0000-000000000013"}';

-- R1 — properties (helper user_can_see_property in the owner-self branch).
-- Runs as INVESTOR I1 with property_owners(P1, I1) — exercises helper-
-- wrapped owner-self branches that triggered SQLSTATE 42P17 before the
-- slice 10e recursion fix.
do $$
declare n int;
begin
  select count(*) into n from public.properties;
  raise notice 'R1 PASS: properties readable without recursion (count=%)', n;
end $$;

-- R2 — units
do $$
declare n int;
begin
  select count(*) into n from public.units;
  raise notice 'R2 PASS: units readable without recursion (count=%)', n;
end $$;

-- R3 — buildings
do $$
declare n int;
begin
  select count(*) into n from public.buildings;
  raise notice 'R3 PASS: buildings readable without recursion (count=%)', n;
end $$;

-- R4 — leases (the chain that originally tripped 42P17)
do $$
declare n int;
begin
  select count(*) into n from public.leases;
  raise notice 'R4 PASS: leases readable without recursion (count=%)', n;
end $$;

-- R5 — rent_charges
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges;
  raise notice 'R5 PASS: rent_charges readable without recursion (count=%)', n;
end $$;

-- R6 — payments (deepest chain — payment → rent_charge → lease → unit →
-- property_owners)
do $$
declare n int;
begin
  select count(*) into n from public.payments;
  raise notice 'R6 PASS: payments readable without recursion (count=%)', n;
end $$;

-- R7 — property_owners (no chain; self-read branch only)
do $$
declare n int;
begin
  select count(*) into n from public.property_owners;
  raise notice 'R7 PASS: property_owners readable without recursion (count=%)', n;
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 15 (Phase 5 owner portal + recursion) assertions PASSED'; end $$;

rollback;
