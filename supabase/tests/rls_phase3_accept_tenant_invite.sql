-- ===========================================================================
-- rls_phase3_accept_tenant_invite.sql — Suite 8 — verifies the
-- accept_tenant_invite RPC from migration 20260524000200.
--
-- This RPC is a SECURITY DEFINER function granted to BOTH `authenticated`
-- and `service_role` because the invite-acceptance flow is anonymous at the
-- moment of call (no signed-in session yet). The body performs four atomic
-- state transitions:
--   1) UPDATE tenants.user_id
--   2) UPDATE tenant_invites.accepted_at + accepted_by
--   3) UPDATE users.organization_id (NULL → value; the protect_user_columns
--      trigger admits this first write)
--   4) INSERT user_roles (user_id, org, 'TENANT')  ON CONFLICT DO NOTHING
--
-- Failures must be classified — caller distinguishes by error_code, not by
-- error message — without any state mutation. The four codes are
-- not_found / already_accepted / revoked / expired.
--
-- Numbering:
--   A1..A4  classified error codes (no state change on failure)
--   A5      successful acceptance updates all four target tables
--   A6      function is SECURITY DEFINER (pg_proc.prosecdef)
--   A7      function is granted to authenticated + service_role only
--   A8      token_hash matching is exact (off-by-one hash → not_found)
--
-- ROLE NOTE: the acceptor users have organization_id = NULL until A5
-- successfully runs. tenant_invites_select RLS allows reads only to staff in
-- the row's org or to super-admin — so the acceptor cannot read invite rows
-- under their own session. State-mutation verifications therefore read after
-- `reset role` (as the privileged session user). The RPC itself runs as the
-- caller (authenticated) so the EXECUTE grant is exercised, and the body
-- bypasses RLS via SECURITY DEFINER.
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_accept_tenant_invite.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('a8000000-0000-0000-0000-000000000001', 'Suite 8 Org', 'rls-s8-org');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's8-staff@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     's8-acceptor-success@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
     's8-acceptor-revoked@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000022', 'authenticated', 'authenticated',
     's8-acceptor-expired@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000023', 'authenticated', 'authenticated',
     's8-acceptor-already@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a8a00000-0000-0000-0000-000000000024', 'authenticated', 'authenticated',
     's8-acceptor-notfound@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'a8000000-0000-0000-0000-000000000001'
    where id = 'a8a00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('a8a00000-0000-0000-0000-000000000010',
     'a8000000-0000-0000-0000-000000000001', 'PROPERTY_MANAGER');

  insert into public.tenants
    (id, organization_id, first_name, last_name, email)
  values
    ('a8c00000-0000-0000-0000-000000000001',
     'a8000000-0000-0000-0000-000000000001', 'Sue', 'Eight-Success',
     's8-acceptor-success@rls.test'),
    ('a8c00000-0000-0000-0000-000000000002',
     'a8000000-0000-0000-0000-000000000001', 'Rev', 'Oked',
     's8-acceptor-revoked@rls.test'),
    ('a8c00000-0000-0000-0000-000000000003',
     'a8000000-0000-0000-0000-000000000001', 'Ex', 'Pired',
     's8-acceptor-expired@rls.test'),
    ('a8c00000-0000-0000-0000-000000000004',
     'a8000000-0000-0000-0000-000000000001', 'Al', 'Ready',
     's8-acceptor-already@rls.test');

  insert into public.tenant_invites
    (id, organization_id, tenant_id, email, token_hash, expires_at,
     accepted_at, accepted_by, revoked_at, revoked_by, created_by)
  values
    -- INV1: pending — used for A5 (success) and A8 (off-by-one).
    ('a8e00000-0000-0000-0000-000000000001',
     'a8000000-0000-0000-0000-000000000001',
     'a8c00000-0000-0000-0000-000000000001',
     's8-acceptor-success@rls.test',
     '1111111111111111111111111111111111111111111111111111111111111111',
     now() + interval '7 days',
     null, null, null, null,
     'a8a00000-0000-0000-0000-000000000010'),
    -- INV2: already accepted — A2. accepted_at fixed at -1h so we can
    -- detect post-call mutation by checking it has NOT moved to ~now().
    ('a8e00000-0000-0000-0000-000000000002',
     'a8000000-0000-0000-0000-000000000001',
     'a8c00000-0000-0000-0000-000000000004',
     's8-acceptor-already@rls.test',
     '2222222222222222222222222222222222222222222222222222222222222222',
     now() + interval '7 days',
     now() - interval '1 hour',
     'a8a00000-0000-0000-0000-000000000010',
     null, null,
     'a8a00000-0000-0000-0000-000000000010'),
    -- INV3: revoked — A3.
    ('a8e00000-0000-0000-0000-000000000003',
     'a8000000-0000-0000-0000-000000000001',
     'a8c00000-0000-0000-0000-000000000002',
     's8-acceptor-revoked@rls.test',
     '3333333333333333333333333333333333333333333333333333333333333333',
     now() + interval '7 days',
     null, null,
     now() - interval '1 hour',
     'a8a00000-0000-0000-0000-000000000010',
     'a8a00000-0000-0000-0000-000000000010'),
    -- INV4: expired — A4.
    ('a8e00000-0000-0000-0000-000000000004',
     'a8000000-0000-0000-0000-000000000001',
     'a8c00000-0000-0000-0000-000000000003',
     's8-acceptor-expired@rls.test',
     '4444444444444444444444444444444444444444444444444444444444444444',
     now() - interval '1 hour',
     null, null, null, null,
     'a8a00000-0000-0000-0000-000000000010');

  raise notice 'Fixtures seeded: 1 org, 6 users, 4 tenants, 4 invites';
end $$;

-- ===========================================================================
-- A6 — function is SECURITY DEFINER (verifiable via pg_proc.prosecdef).
-- ===========================================================================
do $$
declare is_def bool;
begin
  select prosecdef into is_def
    from pg_proc
   where proname = 'accept_tenant_invite'
     and pronamespace = 'public'::regnamespace;
  assert is_def is true,
    'FAIL A6: accept_tenant_invite is not SECURITY DEFINER';
  raise notice 'A6 PASS: accept_tenant_invite is SECURITY DEFINER';
end $$;

-- ===========================================================================
-- A7 — grants are exactly (authenticated, service_role); public/anon revoked.
-- ===========================================================================
do $$
declare n_bad int; n_good int;
begin
  select count(*) into n_bad
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name = 'accept_tenant_invite'
     and grantee in ('PUBLIC', 'anon');
  assert n_bad = 0,
    format('FAIL A7a: accept_tenant_invite has %s grant(s) to public/anon', n_bad);
  raise notice 'A7a PASS: no public/anon EXECUTE grant on accept_tenant_invite';

  select count(*) into n_good
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name = 'accept_tenant_invite'
     and grantee in ('authenticated', 'service_role')
     and privilege_type = 'EXECUTE';
  assert n_good = 2,
    format('FAIL A7b: expected 2 EXECUTE grants (auth+service), got %s', n_good);
  raise notice 'A7b PASS: EXECUTE granted to authenticated + service_role';
end $$;

-- ===========================================================================
-- All five RPC calls below run as `authenticated`, exercising the EXECUTE
-- grant from A7. State-mutation verifications happen after `reset role`.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a8a00000-0000-0000-0000-000000000020"}';

-- A1 — not_found error: bogus hash.
do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '9999999999999999999999999999999999999999999999999999999999999999',
    'a8a00000-0000-0000-0000-000000000024'
  );
  assert r.ok = false,
    format('FAIL A1a: expected ok=false on bogus hash, got %s', r.ok);
  assert r.error_code = 'not_found',
    format('FAIL A1b: expected error_code=not_found, got %s', r.error_code);
  raise notice 'A1 PASS: bogus token_hash → ok=false, error_code=not_found';
end $$;

-- A2 — already_accepted return value.
do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '2222222222222222222222222222222222222222222222222222222222222222',
    'a8a00000-0000-0000-0000-000000000023'
  );
  assert r.ok = false and r.error_code = 'already_accepted',
    format('FAIL A2a: expected already_accepted, got ok=%s code=%s',
           r.ok, r.error_code);
  raise notice 'A2a PASS: already_accepted classified error returned';
end $$;

-- A3 — revoked return value.
do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '3333333333333333333333333333333333333333333333333333333333333333',
    'a8a00000-0000-0000-0000-000000000021'
  );
  assert r.ok = false and r.error_code = 'revoked',
    format('FAIL A3a: expected revoked, got ok=%s code=%s',
           r.ok, r.error_code);
  raise notice 'A3a PASS: revoked classified error returned';
end $$;

-- A4 — expired return value.
do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '4444444444444444444444444444444444444444444444444444444444444444',
    'a8a00000-0000-0000-0000-000000000022'
  );
  assert r.ok = false and r.error_code = 'expired',
    format('FAIL A4a: expected expired, got ok=%s code=%s',
           r.ok, r.error_code);
  raise notice 'A4a PASS: expired classified error returned';
end $$;

-- A8 — off-by-one hash → not_found.
do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '1111111111111111111111111111111111111111111111111111111111111110',  -- last char 0 not 1
    'a8a00000-0000-0000-0000-000000000020'
  );
  assert r.ok = false and r.error_code = 'not_found',
    format('FAIL A8a: off-by-one hash matched, got ok=%s code=%s',
           r.ok, r.error_code);
  raise notice 'A8a PASS: token_hash matching is exact (off-by-one rejected)';
end $$;

-- ===========================================================================
-- State-mutation verification for the four error paths + A8. Elevate so the
-- reads bypass the tenant_invites_select / tenants_select RLS that hides
-- the rows from the no-org acceptor users.
-- ===========================================================================
reset role;

do $$
declare n int;
begin
  -- A2b: already-accepted invite — accepted_at must remain ~1h ago (fixture
  -- value), not be moved forward to ~now() by step 2.
  select count(*) into n from public.tenant_invites
    where id = 'a8e00000-0000-0000-0000-000000000002'
      and accepted_at < now() - interval '30 minutes';
  assert n = 1,
    'FAIL A2b: already-accepted invite.accepted_at was mutated';
  raise notice 'A2b PASS: already-accepted invite.accepted_at unchanged';

  -- A3b: revoked invite — its tenant must still have user_id NULL.
  select count(*) into n from public.tenants
    where id = 'a8c00000-0000-0000-0000-000000000002'
      and user_id is null;
  assert n = 1,
    'FAIL A3b: revoked invite still linked the tenant to a user';
  raise notice 'A3b PASS: revoked invite did not link tenant.user_id';

  -- A4b: expired invite — its tenant must still have user_id NULL.
  select count(*) into n from public.tenants
    where id = 'a8c00000-0000-0000-0000-000000000003'
      and user_id is null;
  assert n = 1,
    'FAIL A4b: expired invite still linked the tenant to a user';
  raise notice 'A4b PASS: expired invite did not link tenant.user_id';

  -- A8b: off-by-one hash — INV1 must remain pending (accepted_at NULL).
  select count(*) into n from public.tenant_invites
    where id = 'a8e00000-0000-0000-0000-000000000001'
      and accepted_at is null;
  assert n = 1,
    'FAIL A8b: off-by-one hash mutated INV1.accepted_at';
  raise notice 'A8b PASS: off-by-one hash did not mutate INV1';
end $$;

-- ===========================================================================
-- A5 — successful acceptance updates all four target tables.
-- Switch back to authenticated for the RPC call so the EXECUTE grant is
-- exercised, then elevate to verify the four side effects.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"a8a00000-0000-0000-0000-000000000020"}';

do $$
declare r record;
begin
  select * into r from public.accept_tenant_invite(
    '1111111111111111111111111111111111111111111111111111111111111111',
    'a8a00000-0000-0000-0000-000000000020'
  );
  assert r.ok = true,
    format('FAIL A5a: successful acceptance returned ok=%s code=%s',
           r.ok, r.error_code);
  assert r.tenant_id = 'a8c00000-0000-0000-0000-000000000001',
    format('FAIL A5b: returned tenant_id mismatch: %s', r.tenant_id);
  assert r.organization_id = 'a8000000-0000-0000-0000-000000000001',
    format('FAIL A5c: returned organization_id mismatch: %s', r.organization_id);
  raise notice 'A5a–c PASS: ok=true, tenant_id + organization_id returned';
end $$;

reset role;

do $$
declare n int; v_uid uuid; v_org uuid;
begin
  -- 1) tenants.user_id linked to the new auth user.
  select user_id into v_uid from public.tenants
    where id = 'a8c00000-0000-0000-0000-000000000001';
  assert v_uid = 'a8a00000-0000-0000-0000-000000000020',
    format('FAIL A5d: tenants.user_id not linked (got %s)', v_uid);

  -- 2) tenant_invites.accepted_at and accepted_by stamped.
  select count(*) into n from public.tenant_invites
    where id = 'a8e00000-0000-0000-0000-000000000001'
      and accepted_at is not null
      and accepted_by = 'a8a00000-0000-0000-0000-000000000020';
  assert n = 1,
    format('FAIL A5e: tenant_invites.accepted_at/by not stamped (matched=%s)', n);

  -- 3) users.organization_id assigned (the NULL → value first write).
  select organization_id into v_org from public.users
    where id = 'a8a00000-0000-0000-0000-000000000020';
  assert v_org = 'a8000000-0000-0000-0000-000000000001',
    format('FAIL A5f: users.organization_id not assigned (got %s)', v_org);

  -- 4) user_roles row created with role TENANT in the org.
  select count(*) into n from public.user_roles
    where user_id = 'a8a00000-0000-0000-0000-000000000020'
      and organization_id = 'a8000000-0000-0000-0000-000000000001'
      and role = 'TENANT';
  assert n = 1,
    format('FAIL A5g: user_roles TENANT row not created (count=%s)', n);

  raise notice 'A5d–g PASS: all four target tables updated atomically';
end $$;

do $$ begin raise notice 'ALL Suite 8 (accept_tenant_invite) assertions PASSED'; end $$;

rollback;
