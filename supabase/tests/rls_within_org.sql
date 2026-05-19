-- ===========================================================================
-- rls_within_org.sql — RLS within-organization role-isolation tests (R1-R5)
--
-- Implements RLS_TEST_PLAN.md section 4. Seeds ONE organization with three
-- single-role users (TENANT, LEASING_AGENT, MAINTENANCE_TECH) and asserts that
-- role-based gating inside an organization behaves as designed.
--
-- Every check is a plpgsql ASSERT: a failure aborts with SQLSTATE P0004 and a
-- 'FAIL Rn' message (a clean test failure); any other SQLSTATE is an
-- infrastructure error.
--
-- Runs inside one transaction and ROLLS BACK — leaves no data behind.
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_within_org.sql
-- ===========================================================================

begin;

-- ---- fixtures: one org, three single-role users, one property -------------
do $$
begin
  insert into public.organizations (id, name, slug)
    values ('33333333-3333-3333-3333-333333333333', 'Org X', 'rls-test-org-x');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated',
     'tenant-role@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated',
     'leasing-role@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated',
     'maint-role@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = '33333333-3333-3333-3333-333333333333'
    where id in ('cccccccc-cccc-cccc-cccc-cccccccccccc',
                 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

  insert into public.user_roles (user_id, organization_id, role) values
    ('cccccccc-cccc-cccc-cccc-cccccccccccc',
     '33333333-3333-3333-3333-333333333333', 'TENANT'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd',
     '33333333-3333-3333-3333-333333333333', 'LEASING_AGENT'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
     '33333333-3333-3333-3333-333333333333', 'MAINTENANCE_TECH');

  insert into public.properties (id, organization_id, name)
    values ('cccc3333-0000-0000-0000-000000000001',
            '33333333-3333-3333-3333-333333333333', 'X Property');

  raise notice 'Fixtures seeded: 1 org, 3 single-role users, 1 property';
end $$;

set local role authenticated;

-- R1: a TENANT-role user is not org staff -> cannot read properties.
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}';
do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 0, format('FAIL R1: TENANT-role user read %s properties (expected 0)', n);
  raise notice 'R1 PASS: TENANT role cannot read properties';
end $$;

-- R2: a LEASING_AGENT can write tenants.
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}';
do $$
declare ok boolean := true;
begin
  begin
    insert into public.tenants (organization_id, first_name, last_name)
      values ('33333333-3333-3333-3333-333333333333', 'Test', 'Lead');
  exception
    when insufficient_privilege or check_violation then ok := false;
  end;
  assert ok, 'FAIL R2: LEASING_AGENT was blocked from inserting a tenant';
  raise notice 'R2 PASS: LEASING_AGENT can insert a tenant';
end $$;

-- R3: a LEASING_AGENT is not a manager -> cannot create a property.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.properties (organization_id, name)
      values ('33333333-3333-3333-3333-333333333333', 'Unauthorized Property');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL R3: LEASING_AGENT was able to insert a property';
  raise notice 'R3 PASS: LEASING_AGENT cannot insert a property';
end $$;

-- R4: a MAINTENANCE_TECH is org staff -> can read properties.
set local request.jwt.claims = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}';
do $$
declare n int;
begin
  select count(*) into n from public.properties;
  assert n = 1, format('FAIL R4: MAINTENANCE_TECH read %s properties (expected 1)', n);
  raise notice 'R4 PASS: MAINTENANCE_TECH can read properties';
end $$;

-- R5: a MAINTENANCE_TECH is not a manager -> cannot update a property.
do $$
declare n int;
begin
  with u as (
    update public.properties set name = 'tech-edit'
    where id = 'cccc3333-0000-0000-0000-000000000001'
    returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL R5: MAINTENANCE_TECH updated %s properties (expected 0)', n);
  raise notice 'R5 PASS: MAINTENANCE_TECH cannot update a property';
end $$;

reset role;

do $$ begin raise notice 'ALL RLS WITHIN-ORG ROLE-ISOLATION ASSERTIONS PASSED'; end $$;

rollback;
