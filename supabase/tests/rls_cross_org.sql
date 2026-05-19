-- ===========================================================================
-- rls_cross_org.sql — Row Level Security cross-organization isolation tests
--
-- Implements the matrix in RLS_TEST_PLAN.md. Seeds two organizations, then
-- simulates each user via request.jwt.claims and asserts that no user can ever
-- read or write another organization's data.
--
-- Runs inside one transaction and ROLLS BACK — it leaves no data behind.
-- Run AFTER the Phase 1 migrations have been applied:
--   psql "$DATABASE_URL" -f supabase/tests/rls_cross_org.sql
--
-- NOTE: written during the Phase 1 build while the dev database was
-- unreachable (IPv6-only direct connection). Validate / adjust the auth.users
-- seed columns against your Supabase version on first run.
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
declare
  org_a uuid := '11111111-1111-1111-1111-111111111111';
  org_b uuid := '22222222-2222-2222-2222-222222222222';
  user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  insert into public.organizations (id, name, slug)
    values (org_a, 'Org A', 'rls-test-org-a'), (org_b, 'Org B', 'rls-test-org-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated',
     'authenticated', 'a-owner@rls.test', '', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated',
     'authenticated', 'b-owner@rls.test', '', now(), now(), now());
  -- handle_new_user trigger has now created the public.users rows.

  update public.users set organization_id = org_a where id = user_a;
  update public.users set organization_id = org_b where id = user_b;

  insert into public.user_roles (user_id, organization_id, role)
    values (user_a, org_a, 'OWNER'), (user_b, org_b, 'OWNER');

  insert into public.properties (id, organization_id, name)
    values ('aaaa1111-0000-0000-0000-000000000001', org_a, 'A Property'),
           ('bbbb2222-0000-0000-0000-000000000001', org_b, 'B Property');
end $$;

-- ---- act as A-owner -------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
begin
  -- #1 own org visible
  assert (select count(*) from public.properties
          where organization_id = '11111111-1111-1111-1111-111111111111') = 1,
         'FAIL #1: A-owner cannot see own org properties';

  -- #2 other org NOT visible
  assert (select count(*) from public.properties
          where organization_id = '22222222-2222-2222-2222-222222222222') = 0,
         'FAIL #2: A-owner can see Org B properties';

  -- #2b a blanket select still only returns own org
  assert (select count(*) from public.properties) = 1,
         'FAIL #2b: A-owner sees more than their own org';

  -- #10 other org users NOT visible
  assert (select count(*) from public.users
          where organization_id = '22222222-2222-2222-2222-222222222222') = 0,
         'FAIL #10: A-owner can see Org B users';
end $$;

-- #4 cannot UPDATE another org's property (0 rows affected)
with updated as (
  update public.properties set name = 'hijacked'
  where id = 'bbbb2222-0000-0000-0000-000000000001'
  returning 1
)
select case when count(*) = 0 then 'PASS #4' else 'FAIL #4: cross-org update' end
from updated;

-- #5 cannot DELETE another org's property
with deleted as (
  delete from public.properties
  where id = 'bbbb2222-0000-0000-0000-000000000001'
  returning 1
)
select case when count(*) = 0 then 'PASS #5' else 'FAIL #5: cross-org delete' end
from deleted;

-- #11 / #12 privilege-escalation guard on own users row
update public.users
  set is_super_admin = true
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

do $$
begin
  assert (select is_super_admin from public.users
          where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = false,
         'FAIL #11: is_super_admin escalation was not blocked';
end $$;

-- ---- act as B-owner -------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
begin
  -- #7 B-owner cannot see Org A data (tenant PII isolation)
  assert (select count(*) from public.properties
          where organization_id = '11111111-1111-1111-1111-111111111111') = 0,
         'FAIL #7: B-owner can see Org A properties';
  assert (select count(*) from public.properties
          where organization_id = '22222222-2222-2222-2222-222222222222') = 1,
         'FAIL #7b: B-owner cannot see own org';
end $$;

reset role;

select 'All RLS cross-org assertions passed.' as result;

rollback;
