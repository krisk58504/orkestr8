-- ===========================================================================
-- users_select_staff_gate.sql — verifies SECURITY_REVIEW.md §7 fix from
-- migration 20260519001400_users_select_staff_gate.sql.
--
-- Proves both halves:
--   (a) hole closed   — a non-staff user (TENANT or VENDOR_ADMIN) holding a
--                       non-null users.organization_id sees only their own
--                       users row, NOT the rest of the org's staff/users.
--   (b) regression    — staff (OWNER, PROPERTY_MANAGER) still see every
--                       users row in their own org; self-read still works
--                       for everyone; cross-org isolation still holds;
--                       anon still denied.
--
-- Every check is a plpgsql ASSERT. A failure aborts with SQLSTATE P0004 and
-- a 'FAIL Un' message (clean test failure); any other SQLSTATE is an
-- infrastructure error. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/users_select_staff_gate.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
-- Org A: 2 staff (OWNER, PROPERTY_MANAGER) + 2 non-staff with org_id set
--        (TENANT, VENDOR_ADMIN — the §7 attack vectors).
-- Org B: 1 staff (OWNER) — for cross-org regression.
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'UG Org A', 'rls-ug-org-a'),
    ('99999999-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'UG Org B', 'rls-ug-org-b');

  insert into public.vendors (id, organization_id, name)
    values ('9d000001-0000-0000-0000-000000000001',
            '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'UG Vendor');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     '9a000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
     'ug-owner-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '9a000002-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
     'ug-mgr-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '9a000003-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
     'ug-tenant-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '9a000004-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
     'ug-vendor-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '9b000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
     'ug-owner-b@rls.test', '', now(), '{}', '{}', now(), now());

  -- Trusted (postgres) writes — §8.4 pin lets trusted roles set org / vendor.
  update public.users set organization_id = '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    where id in (
      '9a000001-0000-0000-0000-000000000001',
      '9a000002-0000-0000-0000-000000000002',
      '9a000003-0000-0000-0000-000000000003',
      '9a000004-0000-0000-0000-000000000004'
    );
  update public.users set organization_id = '99999999-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    where id = '9b000001-0000-0000-0000-000000000001';
  update public.users set vendor_id = '9d000001-0000-0000-0000-000000000001'
    where id = '9a000004-0000-0000-0000-000000000004';

  insert into public.user_roles (user_id, organization_id, role) values
    ('9a000001-0000-0000-0000-000000000001',
     '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OWNER'),
    ('9a000002-0000-0000-0000-000000000002',
     '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PROPERTY_MANAGER'),
    ('9a000003-0000-0000-0000-000000000003',
     '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TENANT'),
    ('9a000004-0000-0000-0000-000000000004',
     '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'VENDOR_ADMIN'),
    ('9b000001-0000-0000-0000-000000000001',
     '99999999-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OWNER');

  raise notice 'Fixtures seeded: 2 orgs, 5 users (2 staff + 2 non-staff in A, 1 staff in B)';
end $$;

set local role authenticated;

-- ===========================================================================
-- (a) Hole closed — TENANT (non-staff with org_id) sees only own row.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"9a000003-0000-0000-0000-000000000003"}';
do $$
declare n int; only_id uuid;
begin
  select count(*) into n from public.users;
  assert n = 1,
    format('FAIL U1: TENANT (non-staff, org_id set) sees %s users (expected 1 — own row only)', n);

  select id into only_id from public.users limit 1;
  assert only_id = '9a000003-0000-0000-0000-000000000003',
    format('FAIL U1: TENANT sees a row that is not their own (id=%s)', only_id);
  raise notice 'U1 PASS: TENANT (non-staff) sees only own users row';

  -- Self-read still works (the requirement: every user must always read own row).
  select count(*) into n from public.users
    where id = '9a000003-0000-0000-0000-000000000003';
  assert n = 1, 'FAIL U2: TENANT self-read failed';
  raise notice 'U2 PASS: TENANT self-read still works';

  -- Cannot see staff teammates by direct id query either.
  select count(*) into n from public.users
    where id in ('9a000001-0000-0000-0000-000000000001',
                 '9a000002-0000-0000-0000-000000000002');
  assert n = 0,
    format('FAIL U3: TENANT can still see staff teammates (%s rows visible)', n);
  raise notice 'U3 PASS: TENANT cannot see staff teammate users by direct id';
end $$;

-- ===========================================================================
-- (a) Phase 3 portal scenario — vendor-portal user (also non-staff).
-- ===========================================================================
set local request.jwt.claims = '{"sub":"9a000004-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  select count(*) into n from public.users;
  assert n = 1,
    format('FAIL U4: vendor-portal user sees %s users (expected 1 — own row only)', n);
  raise notice 'U4 PASS: vendor-portal user (non-staff) cannot read org staff directory';
end $$;

-- ===========================================================================
-- (b) Regression — staff still see every user in their own org.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"9a000001-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from public.users
    where organization_id = '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert n = 4,
    format('FAIL U5: OWNER (staff) sees %s Org A users (expected 4)', n);
  raise notice 'U5 PASS: OWNER (staff) reads all 4 Org A users';
end $$;

set local request.jwt.claims = '{"sub":"9a000002-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  select count(*) into n from public.users
    where organization_id = '99999999-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert n = 4,
    format('FAIL U6: PROPERTY_MANAGER sees %s Org A users (expected 4)', n);
  raise notice 'U6 PASS: PROPERTY_MANAGER (staff) reads all 4 Org A users';
end $$;

-- ===========================================================================
-- (b) Regression — cross-org isolation still holds for staff.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"9a000001-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from public.users
    where organization_id = '99999999-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert n = 0,
    format('FAIL U7: OWNER@A reads %s Org B users (expected 0)', n);
  raise notice 'U7 PASS: cross-org isolation holds (OWNER@A sees 0 Org B users)';
end $$;

-- ===========================================================================
-- (b) Regression — anon still denied.
-- ===========================================================================
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.users;
    assert n = 0, format('FAIL U8: anon read returned %s rows', n);
    raise notice 'U8 PASS: anon select returned 0 users';
  exception
    when insufficient_privilege then
      raise notice 'U8 PASS: anon select denied (no table grant)';
  end;
end $$;

reset role;

do $$ begin raise notice 'ALL users_select_staff_gate assertions PASSED'; end $$;

rollback;
