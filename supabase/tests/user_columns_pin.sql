-- ===========================================================================
-- user_columns_pin.sql — verify the §8.4 fix in migration
--   20260519001000_protect_user_columns_pin.sql
--
-- Proves both halves:
--   (a) authenticated users cannot self-set users.vendor_id or
--       users.organization_id via UPDATE, even from the NULL -> value
--       transition that the prior trigger permitted;
--   (b) the legitimate path is not broken — handle_new_user still creates
--       public.users, create_organization (SECURITY DEFINER) still sets
--       organization_id at signup, the trusted-role write path still
--       works, and the existing reassignment guard still raises for
--       trusted callers.
--
-- Every check is a plpgsql ASSERT. A failure aborts with SQLSTATE P0004 and
-- a 'FAIL Pn' message — a clean test failure. Any other SQLSTATE is an
-- infrastructure error. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/user_columns_pin.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('66666666-6666-6666-6666-666666666666', 'Pin Test Org A', 'rls-pin-org-a'),
    ('77777777-7777-7777-7777-777777777777', 'Pin Test Org B', 'rls-pin-org-b');

  insert into public.vendors (id, organization_id, name)
    values ('6d000000-0000-0000-0000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'Pin Test Vendor');

  -- Insert into auth.users — the handle_new_user trigger creates the
  -- corresponding public.users row with organization_id = NULL,
  -- vendor_id = NULL. That is the exact starting state §8.4 was about.
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000',
          '6a000000-0000-0000-0000-000000000001',
          'authenticated', 'authenticated',
          'pin-user@rls.test', '', now(), '{}', '{}', now(), now());

  raise notice 'Fixtures seeded: 2 orgs, 1 vendor, 1 auth user';
end $$;

-- ===========================================================================
-- (b1) handle_new_user — public.users row exists with both columns NULL.
-- ===========================================================================
do $$
declare n int; org uuid; ven uuid;
begin
  select count(*) into n from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert n = 1,
    format('FAIL P1: handle_new_user did not create public.users row (count=%s)', n);

  select organization_id, vendor_id into org, ven from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert org is null, 'FAIL P1: handle_new_user populated organization_id';
  assert ven is null, 'FAIL P1: handle_new_user populated vendor_id';

  raise notice 'P1 PASS: handle_new_user created public.users row (org_id=NULL, vendor_id=NULL)';
end $$;

-- ===========================================================================
-- (a) Acting as the authenticated user — try to self-set vendor_id / org_id.
--     Under the new pin both UPDATEs must run without raising (the policy
--     row-match succeeds) but the trigger must silently keep the columns
--     at their old NULL value.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"6a000000-0000-0000-0000-000000000001"}';

do $$
declare ven uuid;
begin
  update public.users
     set vendor_id = '6d000000-0000-0000-0000-000000000001'
   where id = '6a000000-0000-0000-0000-000000000001';

  select vendor_id into ven from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert ven is null,
    format('FAIL P2: authenticated self-set vendor_id (got %s, expected NULL)', ven);
  raise notice 'P2 PASS: authenticated cannot self-set vendor_id (NULL-pinned)';
end $$;

do $$
declare org uuid;
begin
  update public.users
     set organization_id = '66666666-6666-6666-6666-666666666666'
   where id = '6a000000-0000-0000-0000-000000000001';

  select organization_id into org from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert org is null,
    format('FAIL P3: authenticated self-set organization_id (got %s, expected NULL)', org);
  raise notice 'P3 PASS: authenticated cannot self-set organization_id (NULL-pinned)';
end $$;

-- Sanity: authenticated can still update non-protected columns on their
-- own row — the pin must not have broken the rest of users_update_self.
do $$
declare nm text;
begin
  update public.users set full_name = 'Pin Test User'
    where id = '6a000000-0000-0000-0000-000000000001';
  select full_name into nm from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert nm = 'Pin Test User',
    format('FAIL P4: authenticated profile update failed (got %s)', nm);
  raise notice 'P4 PASS: authenticated can still update own profile (full_name)';
end $$;

-- ===========================================================================
-- (b2) Onboarding path — create_organization (SECURITY DEFINER) still works.
--      Caller is still the authenticated user (claims set); the function
--      switches current_user to postgres internally, which the new trigger
--      recognizes as privileged and allows organization_id to be set.
-- ===========================================================================
do $$
declare org_after uuid; org_row public.organizations;
begin
  org_row := public.create_organization('Pin Onboarding Org', 'pin-onboard');

  select organization_id into org_after from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert org_after is not null,
    'FAIL P5: create_organization did not set users.organization_id';
  assert org_after = org_row.id,
    format('FAIL P5: organization_id (%s) <> created org id (%s)', org_after, org_row.id);
  raise notice 'P5 PASS: create_organization (SECURITY DEFINER) set organization_id';
end $$;

-- ===========================================================================
-- (a, continued) After organization_id is set by the legitimate path,
--                authenticated still cannot clear it or reassign it.
-- ===========================================================================
do $$
declare org_after uuid;
begin
  update public.users set organization_id = null
    where id = '6a000000-0000-0000-0000-000000000001';
  select organization_id into org_after from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert org_after is not null,
    'FAIL P6: authenticated cleared an already-set organization_id';
  raise notice 'P6 PASS: authenticated cannot clear organization_id once set';
end $$;

do $$
declare org_after uuid;
begin
  update public.users set organization_id = '77777777-7777-7777-7777-777777777777'
    where id = '6a000000-0000-0000-0000-000000000001';
  select organization_id into org_after from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert org_after <> '77777777-7777-7777-7777-777777777777',
    format('FAIL P7: authenticated reassigned organization_id (got %s)', org_after);
  raise notice 'P7 PASS: authenticated cannot reassign organization_id to another org';
end $$;

-- ===========================================================================
-- (b3) Trusted role (postgres / service_role / supabase_admin) can set
--      vendor_id on a user whose vendor_id is currently NULL — required by
--      admin-client provisioning paths.
-- ===========================================================================
reset role;
reset request.jwt.claims;

do $$
declare ven uuid;
begin
  update public.users
     set vendor_id = '6d000000-0000-0000-0000-000000000001'
   where id = '6a000000-0000-0000-0000-000000000001';
  select vendor_id into ven from public.users
    where id = '6a000000-0000-0000-0000-000000000001';
  assert ven = '6d000000-0000-0000-0000-000000000001',
    format('FAIL P8: trusted role failed to set vendor_id (got %s)', ven);
  raise notice 'P8 PASS: trusted role (postgres) can set vendor_id (NULL -> value)';
end $$;

-- ===========================================================================
-- (b4) Even trusted callers cannot REASSIGN a non-NULL value — the
--      defense-in-depth guard inherited from the prior trigger is retained.
-- ===========================================================================
do $$
declare raised boolean := false;
begin
  begin
    update public.users
       set vendor_id = gen_random_uuid()
     where id = '6a000000-0000-0000-0000-000000000001';
  exception
    when raise_exception then raised := true;
  end;
  assert raised,
    'FAIL P9: trusted role reassigned a non-NULL vendor_id (no exception)';
  raise notice 'P9 PASS: trusted reassignment guard still raises (vendor_id)';
end $$;

do $$
declare raised boolean := false;
begin
  begin
    update public.users
       set organization_id = '77777777-7777-7777-7777-777777777777'
     where id = '6a000000-0000-0000-0000-000000000001';
  exception
    when raise_exception then raised := true;
  end;
  assert raised,
    'FAIL P10: trusted role reassigned a non-NULL organization_id (no exception)';
  raise notice 'P10 PASS: trusted reassignment guard still raises (organization_id)';
end $$;

do $$ begin raise notice 'ALL user_columns_pin ASSERTIONS PASSED'; end $$;

rollback;
