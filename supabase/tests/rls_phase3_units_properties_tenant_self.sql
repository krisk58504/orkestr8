-- ===========================================================================
-- rls_phase3_units_properties_tenant_self.sql — Suite 10 — verifies the
-- tenant-self direct AND lease-mediated branches of units_select /
-- properties_select. Current policy bodies are from migration
-- 20260525000100_phase3_tenant_lease_unit_rls.sql (M3LU); the prior
-- intermediate bodies came from 20260524000100 (M3T).
--
-- units_select USING (4 branches at HEAD):
--   1. (org_id = current_user_org_id() AND is_org_staff())          [staff]
--   2. exists (tenants t WHERE t.unit_id = units.id
--                          AND t.user_id = auth.uid())              [tenant-direct]
--   3. exists (tenants t JOIN leases l ON l.id = t.lease_id
--               WHERE l.unit_id = units.id
--                 AND t.user_id = auth.uid())                       [tenant-lease-mediated]
--   4. is_super_admin()                                              [platform]
--
-- properties_select USING (same shape but one hop further via units.property_id).
--
-- Four tenant scenarios per table + the ended-lease regression:
--   TA  — tenants.unit_id = UA1, lease_id null           [direct only]
--   TB  — tenants.unit_id null, lease_id = LB(UA2)       [lease-mediated only]
--   TC  — tenants.unit_id = UA1, lease_id = LC(UA2)      [both branches admit]
--   TD  — tenants.unit_id null, lease_id null            [neither admits]
--   TE  — tenants.unit_id null, lease_id = LE(UA1, ended) [no-status-filter test]
--
-- Numbering:
--   U1..U6  units_select scenarios (4 per spec + cross-org + ended-lease)
--   P1..P5  properties_select scenarios (4 per spec + cross-org)
--
-- U6 is the §11.1.7 design-decision regression test: the lease join has NO
-- status filter, so a tenant whose only lease is `ended` retains visibility
-- of the associated unit. If a future migration adds `AND status != 'ended'`
-- to that branch, U6 catches it.
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_units_properties_tenant_self.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('da000000-0000-0000-0000-00000000000a', 'Suite 10 Org A', 'rls-s10-a'),
    ('da000000-0000-0000-0000-00000000000b', 'Suite 10 Org B', 'rls-s10-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- The five Org A tenant auth users (one per scenario)
    ('00000000-0000-0000-0000-000000000000',
     'daa00000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated',
     's10-ta@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'daa00000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated',
     's10-tb@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'daa00000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated',
     's10-tc@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'daa00000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated',
     's10-td@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'daa00000-0000-0000-0000-00000000000e', 'authenticated', 'authenticated',
     's10-te@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'da000000-0000-0000-0000-00000000000a'
    where id in ('daa00000-0000-0000-0000-00000000000a',
                 'daa00000-0000-0000-0000-00000000000b',
                 'daa00000-0000-0000-0000-00000000000c',
                 'daa00000-0000-0000-0000-00000000000d',
                 'daa00000-0000-0000-0000-00000000000e');

  insert into public.user_roles (user_id, organization_id, role) values
    ('daa00000-0000-0000-0000-00000000000a',
     'da000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('daa00000-0000-0000-0000-00000000000b',
     'da000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('daa00000-0000-0000-0000-00000000000c',
     'da000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('daa00000-0000-0000-0000-00000000000d',
     'da000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('daa00000-0000-0000-0000-00000000000e',
     'da000000-0000-0000-0000-00000000000a', 'TENANT');

  -- Properties: PA1 + PA2 in Org A, PB1 in Org B.
  insert into public.properties (id, organization_id, name) values
    ('dad00000-0000-0000-0000-000000000001',
     'da000000-0000-0000-0000-00000000000a', 'S10 Property A1'),
    ('dad00000-0000-0000-0000-000000000002',
     'da000000-0000-0000-0000-00000000000a', 'S10 Property A2'),
    ('dad00000-0000-0000-0000-000000000003',
     'da000000-0000-0000-0000-00000000000b', 'S10 Property B1');

  -- Units: UA1 on PA1, UA2 on PA2, UB1 on PB1.
  insert into public.units (id, organization_id, property_id, unit_number) values
    ('dae00000-0000-0000-0000-000000000001',
     'da000000-0000-0000-0000-00000000000a',
     'dad00000-0000-0000-0000-000000000001', '101'),
    ('dae00000-0000-0000-0000-000000000002',
     'da000000-0000-0000-0000-00000000000a',
     'dad00000-0000-0000-0000-000000000002', '201'),
    ('dae00000-0000-0000-0000-000000000003',
     'da000000-0000-0000-0000-00000000000b',
     'dad00000-0000-0000-0000-000000000003', '301');

  -- Leases: LB on UA2 (TB's lease), LC on UA2 (TC's lease),
  --         LE on UA1 with status='ended' (TE's lease).
  insert into public.leases
    (id, organization_id, unit_id, start_date, monthly_rent, status)
  values
    ('daf00000-0000-0000-0000-00000000000b',
     'da000000-0000-0000-0000-00000000000a',
     'dae00000-0000-0000-0000-000000000002',
     date '2026-01-01', 1800.00, 'active'),
    ('daf00000-0000-0000-0000-00000000000c',
     'da000000-0000-0000-0000-00000000000a',
     'dae00000-0000-0000-0000-000000000002',
     date '2026-01-01', 1900.00, 'active'),
    ('daf00000-0000-0000-0000-00000000000e',
     'da000000-0000-0000-0000-00000000000a',
     'dae00000-0000-0000-0000-000000000001',
     date '2025-06-01', 1500.00, 'ended');

  -- Tenants in their four direct/lease permutations + TE for the ended test.
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, unit_id, lease_id)
  values
    -- TA: direct only
    ('dac00000-0000-0000-0000-00000000000a',
     'da000000-0000-0000-0000-00000000000a',
     'daa00000-0000-0000-0000-00000000000a', 'Tee', 'A',
     'dae00000-0000-0000-0000-000000000001',
     null),
    -- TB: lease-mediated only
    ('dac00000-0000-0000-0000-00000000000b',
     'da000000-0000-0000-0000-00000000000a',
     'daa00000-0000-0000-0000-00000000000b', 'Tee', 'B',
     null,
     'daf00000-0000-0000-0000-00000000000b'),
    -- TC: both branches admit
    ('dac00000-0000-0000-0000-00000000000c',
     'da000000-0000-0000-0000-00000000000a',
     'daa00000-0000-0000-0000-00000000000c', 'Tee', 'C',
     'dae00000-0000-0000-0000-000000000001',
     'daf00000-0000-0000-0000-00000000000c'),
    -- TD: neither
    ('dac00000-0000-0000-0000-00000000000d',
     'da000000-0000-0000-0000-00000000000a',
     'daa00000-0000-0000-0000-00000000000d', 'Tee', 'D',
     null,
     null),
    -- TE: ended-lease — lease.unit_id = UA1, lease.status = 'ended'
    ('dac00000-0000-0000-0000-00000000000e',
     'da000000-0000-0000-0000-00000000000a',
     'daa00000-0000-0000-0000-00000000000e', 'Tee', 'E',
     null,
     'daf00000-0000-0000-0000-00000000000e');

  raise notice 'Fixtures seeded: 2 orgs, 5 tenant users, 3 props, 3 units, 3 leases, 5 tenants';
end $$;

set local role authenticated;

-- ===========================================================================
-- U1 — TA (direct only): sees UA1, only UA1.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000a"}';

do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 1, format('FAIL U1a: TA sees %s units (expected 1)', n);
  perform 1 from public.units where id = 'dae00000-0000-0000-0000-000000000001';
  assert found, 'FAIL U1b: TA cannot see UA1 (the direct-branch unit)';
  raise notice 'U1 PASS: TA (direct only) sees UA1';
end $$;

-- ===========================================================================
-- U2 — TB (lease-mediated only): sees UA2, only UA2.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000b"}';

do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 1, format('FAIL U2a: TB sees %s units (expected 1)', n);
  perform 1 from public.units where id = 'dae00000-0000-0000-0000-000000000002';
  assert found, 'FAIL U2b: TB cannot see UA2 (the lease-mediated unit)';
  raise notice 'U2 PASS: TB (lease-mediated) sees UA2 via tenants.lease_id → leases.unit_id';
end $$;

-- ===========================================================================
-- U3 — TC (both branches admit): sees UA1 AND UA2.
-- Direct branch admits UA1 (TC.unit_id); lease-mediated admits UA2
-- (TC.lease_id → LC.unit_id).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000c"}';

do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 2, format('FAIL U3a: TC sees %s units (expected 2)', n);
  perform 1 from public.units where id = 'dae00000-0000-0000-0000-000000000001';
  assert found, 'FAIL U3b: TC cannot see UA1 (direct branch)';
  perform 1 from public.units where id = 'dae00000-0000-0000-0000-000000000002';
  assert found, 'FAIL U3c: TC cannot see UA2 (lease-mediated branch)';
  raise notice 'U3 PASS: TC (both branches) sees UA1 + UA2';
end $$;

-- ===========================================================================
-- U4 — TD (neither): 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000d"}';

do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 0, format('FAIL U4: TD sees %s units (expected 0)', n);
  raise notice 'U4 PASS: TD (neither branch) sees 0 units';
end $$;

-- ===========================================================================
-- U5 — TB SELECTs cross-org unit (UB1) → 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000b"}';

do $$
declare n int;
begin
  select count(*) into n from public.units
    where id = 'dae00000-0000-0000-0000-000000000003';
  assert n = 0, format('FAIL U5: TB sees %s cross-org units (expected 0)', n);
  raise notice 'U5 PASS: TB cannot SELECT cross-org unit UB1';
end $$;

-- ===========================================================================
-- U6 — TE (lease.status = 'ended') sees UA1 via the lease-mediated branch.
-- §11.1.7 design decision under test: the lease join has NO status filter.
-- If a future migration adds `AND status != 'ended'`, this fails.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000e"}';

do $$
declare n int;
begin
  select count(*) into n from public.units;
  assert n = 1, format('FAIL U6a: TE sees %s units (expected 1)', n);
  perform 1 from public.units where id = 'dae00000-0000-0000-0000-000000000001';
  assert found,
    'FAIL U6b: TE cannot see UA1 via ENDED lease — lease.status filter regression?';
  raise notice 'U6 PASS: TE (ended lease) still sees UA1 (no status filter)';
end $$;

-- ===========================================================================
-- P1 — TA: sees PA1 (PA1 is the property of UA1, TA.unit_id = UA1).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000a"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 1, format('FAIL P1a: TA sees %s properties (expected 1)', n);
  perform 1 from public.properties where id = 'dad00000-0000-0000-0000-000000000001';
  assert found, 'FAIL P1b: TA cannot see PA1';
  raise notice 'P1 PASS: TA (direct) sees PA1 via tenants.unit_id → units.property_id';
end $$;

-- ===========================================================================
-- P2 — TB: sees PA2 (lease-mediated chain TB → LB → UA2 → PA2).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000b"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 1, format('FAIL P2a: TB sees %s properties (expected 1)', n);
  perform 1 from public.properties where id = 'dad00000-0000-0000-0000-000000000002';
  assert found, 'FAIL P2b: TB cannot see PA2 (lease-mediated chain)';
  raise notice 'P2 PASS: TB (lease-mediated) sees PA2';
end $$;

-- ===========================================================================
-- P3 — TC: sees both PA1 (direct via UA1) AND PA2 (lease-mediated via LC → UA2).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000c"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 2, format('FAIL P3a: TC sees %s properties (expected 2)', n);
  perform 1 from public.properties where id = 'dad00000-0000-0000-0000-000000000001';
  assert found, 'FAIL P3b: TC cannot see PA1 (direct branch)';
  perform 1 from public.properties where id = 'dad00000-0000-0000-0000-000000000002';
  assert found, 'FAIL P3c: TC cannot see PA2 (lease-mediated branch)';
  raise notice 'P3 PASS: TC (both branches) sees PA1 + PA2';
end $$;

-- ===========================================================================
-- P4 — TD: 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000d"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 0, format('FAIL P4: TD sees %s properties (expected 0)', n);
  raise notice 'P4 PASS: TD (neither branch) sees 0 properties';
end $$;

-- ===========================================================================
-- P5 — TB SELECTs cross-org property (PB1) → 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"daa00000-0000-0000-0000-00000000000b"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties
    where id = 'dad00000-0000-0000-0000-000000000003';
  assert n = 0, format('FAIL P5: TB sees %s cross-org properties (expected 0)', n);
  raise notice 'P5 PASS: TB cannot SELECT cross-org property PB1';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 10 (units/properties tenant-self) assertions PASSED'; end $$;

rollback;
