-- ===========================================================================
-- rls_phase3_tenant_invites_lifecycle.sql — Suite 9 — verifies the
-- tenant_invites_select / tenant_invites_write policies and the
-- mutual-exclusion CHECK constraint from migration
-- 20260522000100_phase3_tenant_invites.sql.
--
-- tenant_invites_select USING:
--   (org_id = current_user_org_id() AND can_write_tenants()) OR is_super_admin()
-- tenant_invites_write USING + WITH CHECK:
--   (org_id = current_user_org_id() AND can_write_tenants()) OR is_super_admin()
-- Table check constraint:
--   CHECK (accepted_at IS NULL OR revoked_at IS NULL)
--
-- `can_write_tenants()` resolves true for SUPER_ADMIN, OWNER, REGIONAL_MANAGER,
-- PROPERTY_MANAGER, LEASING_AGENT. MAINTENANCE_TECH is is_org_staff but NOT
-- can_write_tenants — read AND write should both deny for them.
--
-- Numbering:
--   I1..I3   SELECT scoping (PM read; LA read; MT denied)
--   I4..I6   INSERT gating (PM/LA allowed; MT rejected)
--   I7       cross-org isolation (PM-B sees 0 Org A invites)
--   I8       mutual-exclusion CHECK constraint rejects (accepted_at +
--            revoked_at both non-null)
--   I9       revoke lifecycle path (PM UPDATE actually mutates the row)
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_tenant_invites_lifecycle.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('b9000000-0000-0000-0000-00000000000a', 'Suite 9 Org A', 'rls-s9-a'),
    ('b9000000-0000-0000-0000-00000000000b', 'Suite 9 Org B', 'rls-s9-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A staff: PROPERTY_MANAGER (can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'b9a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's9-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A staff: LEASING_AGENT (can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'b9a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     's9-la-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A staff: MAINTENANCE_TECH (NOT can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'b9a00000-0000-0000-0000-000000000012', 'authenticated', 'authenticated',
     's9-mt-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B staff: PROPERTY_MANAGER (cross-org test)
    ('00000000-0000-0000-0000-000000000000',
     'b9b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's9-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b9000000-0000-0000-0000-00000000000a'
    where id in ('b9a00000-0000-0000-0000-000000000010',
                 'b9a00000-0000-0000-0000-000000000011',
                 'b9a00000-0000-0000-0000-000000000012');
  update public.users set organization_id = 'b9000000-0000-0000-0000-00000000000b'
    where id = 'b9b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('b9a00000-0000-0000-0000-000000000010',
     'b9000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b9a00000-0000-0000-0000-000000000011',
     'b9000000-0000-0000-0000-00000000000a', 'LEASING_AGENT'),
    ('b9a00000-0000-0000-0000-000000000012',
     'b9000000-0000-0000-0000-00000000000a', 'MAINTENANCE_TECH'),
    ('b9b00000-0000-0000-0000-000000000010',
     'b9000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Tenant T1 in Org A — the subject of all invites in this suite.
  insert into public.tenants
    (id, organization_id, first_name, last_name, email)
  values
    ('b9c00000-0000-0000-0000-000000000001',
     'b9000000-0000-0000-0000-00000000000a', 'Tee', 'One',
     's9-t1@rls.test');

  -- Pre-seed one pending invite for T1 in Org A.
  insert into public.tenant_invites
    (id, organization_id, tenant_id, email, token_hash, expires_at, created_by)
  values
    ('b9e00000-0000-0000-0000-000000000001',
     'b9000000-0000-0000-0000-00000000000a',
     'b9c00000-0000-0000-0000-000000000001',
     's9-t1@rls.test',
     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
     now() + interval '7 days',
     'b9a00000-0000-0000-0000-000000000010');

  raise notice 'Fixtures seeded: 2 orgs, 4 staff users, 1 tenant, 1 seed invite';
end $$;

-- ===========================================================================
-- I1 — PROPERTY_MANAGER (can_write_tenants) SELECTs → 1 row (seed invite).
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.tenant_invites;
  assert n = 1, format('FAIL I1: PM sees %s invites (expected 1)', n);
  raise notice 'I1 PASS: PROPERTY_MANAGER SELECT tenant_invites returns Org A invites';
end $$;

-- ===========================================================================
-- I2 — LEASING_AGENT (can_write_tenants) SELECTs → 1 row.
-- LA is the second role in can_write_tenants() — verify it has parity with PM.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000011"}';

do $$
declare n int;
begin
  select count(*) into n from public.tenant_invites;
  assert n = 1, format('FAIL I2: LA sees %s invites (expected 1)', n);
  raise notice 'I2 PASS: LEASING_AGENT SELECT tenant_invites (can_write_tenants)';
end $$;

-- ===========================================================================
-- I3 — MAINTENANCE_TECH (is_org_staff, NOT can_write_tenants) SELECTs → 0.
-- This is the policy split: tenant_invites uses can_write_tenants, not the
-- broader is_org_staff. MT can read OTHER tables but not invites.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000012"}';

do $$
declare n int;
begin
  select count(*) into n from public.tenant_invites;
  assert n = 0, format('FAIL I3: MT sees %s invites (expected 0)', n);
  raise notice 'I3 PASS: MAINTENANCE_TECH cannot SELECT (no can_write_tenants)';
end $$;

-- ===========================================================================
-- I4 — PM INSERTs a new invite → allowed; row count goes 1 → 2.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000010"}';

do $$
declare new_id uuid; n_pre int; n_post int;
begin
  select count(*) into n_pre from public.tenant_invites;

  insert into public.tenant_invites
    (organization_id, tenant_id, email, token_hash, expires_at, created_by)
  values
    ('b9000000-0000-0000-0000-00000000000a',
     'b9c00000-0000-0000-0000-000000000001',
     's9-t1@rls.test',
     'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
     now() + interval '7 days',
     'b9a00000-0000-0000-0000-000000000010')
  returning id into new_id;
  assert new_id is not null, 'FAIL I4a: PM INSERT returned no id';

  select count(*) into n_post from public.tenant_invites;
  assert n_post = n_pre + 1,
    format('FAIL I4b: row count did not increase (pre=%s, post=%s)', n_pre, n_post);
  raise notice 'I4 PASS: PROPERTY_MANAGER CAN INSERT (count + 1)';
end $$;

-- ===========================================================================
-- I5 — LA INSERTs a new invite → allowed.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000011"}';

do $$
declare new_id uuid;
begin
  insert into public.tenant_invites
    (organization_id, tenant_id, email, token_hash, expires_at, created_by)
  values
    ('b9000000-0000-0000-0000-00000000000a',
     'b9c00000-0000-0000-0000-000000000001',
     's9-t1@rls.test',
     'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
     now() + interval '7 days',
     'b9a00000-0000-0000-0000-000000000011')
  returning id into new_id;
  assert new_id is not null, 'FAIL I5: LA INSERT returned no id';
  raise notice 'I5 PASS: LEASING_AGENT CAN INSERT (can_write_tenants gate admits)';
end $$;

-- ===========================================================================
-- I6 — MT INSERT → rejected by WITH CHECK (no can_write_tenants).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000012"}';

do $$
declare blocked bool := false;
begin
  begin
    insert into public.tenant_invites
      (organization_id, tenant_id, email, token_hash, expires_at, created_by)
    values
      ('b9000000-0000-0000-0000-00000000000a',
       'b9c00000-0000-0000-0000-000000000001',
       's9-t1@rls.test',
       'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
       now() + interval '7 days',
       'b9a00000-0000-0000-0000-000000000012');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL I6: MAINTENANCE_TECH was able to INSERT an invite';
  raise notice 'I6 PASS: MAINTENANCE_TECH cannot INSERT (can_write_tenants gate)';
end $$;

-- ===========================================================================
-- I7 — PM-B (Org B, can_write_tenants in their own org) SELECTs → 0 rows
-- of Org A's invites. The current_user_org_id() pin keeps the read scoped.
-- After I4/I5 there are now 3 Org A invites — PM-B still sees 0.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9b00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.tenant_invites;
  assert n = 0, format('FAIL I7: PM-B sees %s Org A invites (expected 0)', n);
  raise notice 'I7 PASS: cross-org PM cannot SELECT another org''s invites';
end $$;

-- ===========================================================================
-- I8 — INSERT with both accepted_at AND revoked_at non-null → rejected by
-- the CHECK constraint (accepted_at IS NULL OR revoked_at IS NULL). This
-- is testing the constraint, NOT RLS — so the inserter is a PM with full
-- write privilege; the rejection is from the table itself.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b9a00000-0000-0000-0000-000000000010"}';

do $$
declare blocked bool := false;
begin
  begin
    insert into public.tenant_invites
      (organization_id, tenant_id, email, token_hash, expires_at,
       accepted_at, accepted_by, revoked_at, revoked_by, created_by)
    values
      ('b9000000-0000-0000-0000-00000000000a',
       'b9c00000-0000-0000-0000-000000000001',
       's9-t1@rls.test',
       'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
       now() + interval '7 days',
       now(),
       'b9a00000-0000-0000-0000-000000000010',
       now(),
       'b9a00000-0000-0000-0000-000000000010',
       'b9a00000-0000-0000-0000-000000000010');
  exception
    when check_violation then blocked := true;
  end;
  assert blocked, 'FAIL I8: invite with both accepted_at and revoked_at was accepted';
  raise notice 'I8 PASS: CHECK constraint rejects accepted_at + revoked_at both set';
end $$;

-- ===========================================================================
-- I9 — PM UPDATEs the seed invite to mark it revoked → allowed; verify the
-- revoked_at field actually got stamped (not just "no error").
-- ===========================================================================
do $$
declare n int; v_rev_at timestamptz; v_rev_by uuid;
begin
  with u as (
    update public.tenant_invites
       set revoked_at = now(),
           revoked_by = 'b9a00000-0000-0000-0000-000000000010'
     where id = 'b9e00000-0000-0000-0000-000000000001'
     returning 1
  )
  select count(*) into n from u;
  assert n = 1, format('FAIL I9a: PM UPDATE affected %s rows (expected 1)', n);

  -- Verify the fields were actually set.
  select revoked_at, revoked_by into v_rev_at, v_rev_by
    from public.tenant_invites
    where id = 'b9e00000-0000-0000-0000-000000000001';
  assert v_rev_at is not null,
    'FAIL I9b: revoked_at is still null after UPDATE';
  assert v_rev_by = 'b9a00000-0000-0000-0000-000000000010',
    format('FAIL I9c: revoked_by mismatch (got %s)', v_rev_by);
  raise notice 'I9 PASS: PM UPDATE marks invite revoked (revoked_at + revoked_by set)';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 9 (tenant_invites lifecycle) assertions PASSED'; end $$;

rollback;
