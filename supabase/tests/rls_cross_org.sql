-- ===========================================================================
-- rls_cross_org.sql — Row Level Security cross-organization isolation tests
--
-- Implements the cross-org matrix from RLS_TEST_PLAN.md. Seeds two
-- organizations, then simulates each user via request.jwt.claims and asserts
-- that no user can read or write another organization's data.
--
-- Every check is a plpgsql ASSERT: if any policy fails to isolate, the script
-- aborts with a 'FAIL #n' message (errcode P0004 — a clean test failure).
-- Any other error means the test could not complete (infrastructure error).
--
-- Runs inside one transaction and ROLLS BACK — leaves no data behind.
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_cross_org.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('11111111-1111-1111-1111-111111111111', 'Org A', 'rls-test-org-a'),
    ('22222222-2222-2222-2222-222222222222', 'Org B', 'rls-test-org-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
     'a-owner@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
     'b-owner@rls.test', '', now(), '{}', '{}', now(), now());
  -- the handle_new_user trigger has now created the public.users rows.

  update public.users set organization_id = '11111111-1111-1111-1111-111111111111'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  update public.users set organization_id = '22222222-2222-2222-2222-222222222222'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  insert into public.user_roles (user_id, organization_id, role) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111', 'OWNER'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '22222222-2222-2222-2222-222222222222', 'OWNER');

  insert into public.properties (id, organization_id, name) values
    ('aaaa1111-0000-0000-0000-000000000001',
     '11111111-1111-1111-1111-111111111111', 'A Property'),
    ('bbbb2222-0000-0000-0000-000000000001',
     '22222222-2222-2222-2222-222222222222', 'B Property');

  raise notice 'Fixtures seeded: 2 orgs, 2 owners, 2 properties';
end $$;

-- ===========================================================================
-- Act as A-owner (Org A)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties
    where organization_id = '11111111-1111-1111-1111-111111111111';
  assert n = 1, format('FAIL #1: A-owner sees %s own-org properties (expected 1)', n);

  select count(*) into n from public.properties
    where organization_id = '22222222-2222-2222-2222-222222222222';
  assert n = 0, format('FAIL #2: A-owner sees %s Org B properties (expected 0)', n);

  select count(*) into n from public.properties;
  assert n = 1, format('FAIL #2b: A-owner sees %s properties total (expected 1)', n);

  select count(*) into n from public.users
    where organization_id = '22222222-2222-2222-2222-222222222222';
  assert n = 0, format('FAIL #10: A-owner sees %s Org B users (expected 0)', n);

  select count(*) into n from public.audit_logs
    where organization_id = '22222222-2222-2222-2222-222222222222';
  assert n = 0, 'FAIL #14: A-owner can read Org B audit_logs';

  raise notice 'A-owner read isolation: #1 #2 #2b #10 #14 PASS';
end $$;

do $$
declare n int;
begin
  with u as (
    update public.properties set name = 'hijacked'
    where id = 'bbbb2222-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL #4: A-owner updated %s Org B properties', n);

  with d as (
    delete from public.properties
    where id = 'bbbb2222-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into n from d;
  assert n = 0, format('FAIL #5: A-owner deleted %s Org B properties', n);

  raise notice 'A-owner write isolation: #4 #5 PASS';
end $$;

do $$
begin
  -- #6 cross-org insert must be rejected by the WITH CHECK clause.
  begin
    insert into public.properties (organization_id, name)
      values ('22222222-2222-2222-2222-222222222222', 'sneaky');
    assert false, 'FAIL #6: A-owner inserted a property into Org B';
  exception
    when insufficient_privilege or check_violation then
      raise notice '#6 PASS: cross-org insert rejected';
  end;
end $$;

-- #11 privilege escalation: is_super_admin must not be settable from the app.
update public.users set is_super_admin = true
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
declare flag boolean;
begin
  select is_super_admin into flag from public.users
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert flag = false, 'FAIL #11: is_super_admin escalation was not blocked';
  raise notice '#11 PASS: is_super_admin escalation blocked by trigger';
end $$;

-- #12 organization_id must not be reassignable from the app.
do $$
declare org uuid;
begin
  begin
    update public.users set organization_id = '22222222-2222-2222-2222-222222222222'
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    select organization_id into org from public.users
      where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    assert org = '11111111-1111-1111-1111-111111111111',
           'FAIL #12: organization_id was reassigned';
    raise notice '#12 PASS: org reassignment had no effect';
  exception
    when raise_exception then
      raise notice '#12 PASS: org reassignment raised an exception (trigger)';
  end;
end $$;

-- ===========================================================================
-- Act as B-owner (Org B)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
declare n int;
begin
  select count(*) into n from public.properties
    where organization_id = '11111111-1111-1111-1111-111111111111';
  assert n = 0, format('FAIL #7: B-owner sees %s Org A properties (expected 0)', n);

  select count(*) into n from public.properties
    where organization_id = '22222222-2222-2222-2222-222222222222';
  assert n = 1, format('FAIL #7b: B-owner sees %s own-org properties (expected 1)', n);

  raise notice 'B-owner isolation: #7 #7b PASS';
end $$;

-- ===========================================================================
-- Act as anon (no authenticated session)
-- ===========================================================================
reset role;
set local role anon;

do $$
declare n int;
begin
  begin
    select count(*) into n from public.properties;
    assert n = 0, format('FAIL #13: anon read returned %s rows', n);
    raise notice '#13 PASS: anon select returned 0 rows';
  exception
    when insufficient_privilege then
      raise notice '#13 PASS: anon select denied (no table grant)';
  end;
end $$;

reset role;

do $$ begin raise notice 'ALL RLS CROSS-ORG ASSERTIONS PASSED'; end $$;

rollback;
