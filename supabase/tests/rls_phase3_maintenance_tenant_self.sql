-- ===========================================================================
-- rls_phase3_maintenance_tenant_self.sql — Suite 11 — verifies the
-- maintenance_requests_select / maintenance_requests_insert tenant-self
-- branches from migration 20260526000100_phase3_tenant_self_maintenance_rls.
--
-- maintenance_requests_select (4 branches at HEAD):
--   1. (org_id = current_user_org_id() AND is_org_staff())          [staff]
--   2. reported_by = auth.uid()                                     [reporter]
--   3. exists (tenants t WHERE t.id = mr.tenant_id
--                          AND t.user_id = auth.uid())              [tenant-by-tenant_id]
--   4. is_super_admin()                                              [platform]
--
-- maintenance_requests_insert WITH CHECK (3 branches):
--   1. (org_id = current_user_org_id() AND is_org_staff())          [staff]
--   2. (reported_by = auth.uid()
--       AND exists (tenants t WHERE t.user_id = auth.uid()
--                                AND t.organization_id = mr.organization_id
--                                AND (mr.tenant_id is null
--                                     OR mr.tenant_id = t.id)))      [tenant defense-in-depth]
--   3. is_super_admin()                                              [platform]
--
-- The tenant INSERT branch enforces THREE independent constraints:
--   - reported_by must equal the inserter's auth uid
--   - the inserter must own a tenant row in the target organization
--   - if tenant_id is set, it must equal the inserter's own tenant.id
--
-- Numbering:
--   Q1..Q6   SELECT scoping (staff read; reporter-self read; tenant-by-tenant_id
--            read; cross-tenant and cross-org denials)
--   Q7..Q10  INSERT defense-in-depth (allowed-path baseline + each gate
--            independently rejected)
--
-- Q-prefix avoids collision with Suite 2's R1..R5 (role-isolation).
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_maintenance_tenant_self.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('c1000000-0000-0000-0000-00000000000a', 'Suite 11 Org A', 'rls-s11-a'),
    ('c1000000-0000-0000-0000-00000000000b', 'Suite 11 Org B', 'rls-s11-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A property manager (creator of R2 on T2's behalf)
    ('00000000-0000-0000-0000-000000000000',
     'c1a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's11-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T1 (self-reports R1)
    ('00000000-0000-0000-0000-000000000000',
     'c1a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     's11-t1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T2 (R2 is created on their behalf by staff)
    ('00000000-0000-0000-0000-000000000000',
     'c1a00000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
     's11-t2-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B property manager (cross-org test)
    ('00000000-0000-0000-0000-000000000000',
     'c1b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's11-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'c1000000-0000-0000-0000-00000000000a'
    where id in ('c1a00000-0000-0000-0000-000000000010',
                 'c1a00000-0000-0000-0000-000000000020',
                 'c1a00000-0000-0000-0000-000000000021');
  update public.users set organization_id = 'c1000000-0000-0000-0000-00000000000b'
    where id = 'c1b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('c1a00000-0000-0000-0000-000000000010',
     'c1000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('c1a00000-0000-0000-0000-000000000020',
     'c1000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('c1a00000-0000-0000-0000-000000000021',
     'c1000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('c1b00000-0000-0000-0000-000000000010',
     'c1000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Properties and units (one per org) — maintenance_requests.property_id is NOT NULL.
  insert into public.properties (id, organization_id, name) values
    ('c1d00000-0000-0000-0000-000000000001',
     'c1000000-0000-0000-0000-00000000000a', 'S11 Property A'),
    ('c1d00000-0000-0000-0000-000000000002',
     'c1000000-0000-0000-0000-00000000000b', 'S11 Property B');

  insert into public.units (id, organization_id, property_id, unit_number) values
    ('c1e00000-0000-0000-0000-000000000001',
     'c1000000-0000-0000-0000-00000000000a',
     'c1d00000-0000-0000-0000-000000000001', '101'),
    ('c1e00000-0000-0000-0000-000000000002',
     'c1000000-0000-0000-0000-00000000000b',
     'c1d00000-0000-0000-0000-000000000002', '201');

  -- Tenant rows: T1 + T2 in Org A, with property/unit assigned so the
  -- INSERT tests have a real property to reference.
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, property_id, unit_id)
  values
    ('c1c00000-0000-0000-0000-000000000001',
     'c1000000-0000-0000-0000-00000000000a',
     'c1a00000-0000-0000-0000-000000000020', 'Tee', 'One',
     'c1d00000-0000-0000-0000-000000000001',
     'c1e00000-0000-0000-0000-000000000001'),
    ('c1c00000-0000-0000-0000-000000000002',
     'c1000000-0000-0000-0000-00000000000a',
     'c1a00000-0000-0000-0000-000000000021', 'Tee', 'Two',
     'c1d00000-0000-0000-0000-000000000001',
     'c1e00000-0000-0000-0000-000000000001');

  -- Three seed requests:
  --   R1: T1 self-reported (reported_by = T1's uid, tenant_id = T1)
  --   R2: PM-on-behalf for T2 (reported_by = PM's uid, tenant_id = T2)
  --   R3: Org B request (isolated, for cross-org tests)
  insert into public.maintenance_requests
    (id, organization_id, property_id, tenant_id, reported_by, title)
  values
    ('c1f00000-0000-0000-0000-000000000001',
     'c1000000-0000-0000-0000-00000000000a',
     'c1d00000-0000-0000-0000-000000000001',
     'c1c00000-0000-0000-0000-000000000001',
     'c1a00000-0000-0000-0000-000000000020',
     'S11 R1 — T1 self-reported'),
    ('c1f00000-0000-0000-0000-000000000002',
     'c1000000-0000-0000-0000-00000000000a',
     'c1d00000-0000-0000-0000-000000000001',
     'c1c00000-0000-0000-0000-000000000002',
     'c1a00000-0000-0000-0000-000000000010',
     'S11 R2 — PM-on-behalf for T2'),
    ('c1f00000-0000-0000-0000-000000000003',
     'c1000000-0000-0000-0000-00000000000b',
     'c1d00000-0000-0000-0000-000000000002',
     null,
     'c1b00000-0000-0000-0000-000000000010',
     'S11 R3 — Org B isolated');

  raise notice 'Fixtures seeded: 2 orgs, 4 users, 2 props/units, 2 tenants, 3 requests';
end $$;

-- ===========================================================================
-- Q1 — Org A PM SELECTs maintenance_requests → 2 rows (R1 + R2; not R3).
-- Staff branch — `is_org_staff` true for PROPERTY_MANAGER.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c1a00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.maintenance_requests;
  assert n = 2, format('FAIL Q1: PM sees %s requests (expected 2 Org A only)', n);
  raise notice 'Q1 PASS: PM SELECT returns Org A requests only';
end $$;

-- ===========================================================================
-- Q2 — T1 SELECTs → 1 row (R1, via the reported_by self-branch).
-- T1 IS the reporter of R1 (reported_by = T1's uid). Also matches the
-- tenant-by-tenant_id branch (R1.tenant_id = T1.id). Either branch admits.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"c1a00000-0000-0000-0000-000000000020"}';

do $$
declare n int;
begin
  select count(*) into n from public.maintenance_requests;
  assert n = 1, format('FAIL Q2: T1 sees %s requests (expected 1)', n);
  -- Confirm it's R1 specifically.
  perform 1 from public.maintenance_requests
    where id = 'c1f00000-0000-0000-0000-000000000001';
  assert found, 'FAIL Q2b: T1 cannot see own R1';
  raise notice 'Q2 PASS: T1 sees own R1 via reported_by self-branch';
end $$;

-- ===========================================================================
-- Q3 — T2 SELECTs → 1 row (R2, via the tenant-by-tenant_id branch).
-- T2 is NOT the reporter of R2 (PM created it); the visibility comes from
-- R2.tenant_id = T2.id. This is the new M3M branch that lets a tenant see
-- staff-created requests on their behalf.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"c1a00000-0000-0000-0000-000000000021"}';

do $$
declare n int; rb uuid;
begin
  select count(*) into n from public.maintenance_requests;
  assert n = 1, format('FAIL Q3: T2 sees %s requests (expected 1)', n);
  -- Confirm it's R2 specifically AND that reported_by ≠ T2 (so we're really
  -- exercising the tenant-by-tenant_id branch, not the reporter branch).
  select reported_by into rb from public.maintenance_requests
    where id = 'c1f00000-0000-0000-0000-000000000002';
  assert rb = 'c1a00000-0000-0000-0000-000000000010',
    format('FAIL Q3b: R2 reported_by mismatch (got %s)', rb);
  raise notice 'Q3 PASS: T2 sees R2 via tenant-by-tenant_id branch (staff reported)';
end $$;

-- ===========================================================================
-- Q4 — T1 SELECTs cross-tenant R2 → 0 rows.
-- R2.tenant_id = T2 (not T1) and R2.reported_by = PM (not T1) → neither
-- tenant-self branch admits T1 to R2. Cross-tenant denial confirmed.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"c1a00000-0000-0000-0000-000000000020"}';

do $$
declare n int;
begin
  select count(*) into n from public.maintenance_requests
    where id = 'c1f00000-0000-0000-0000-000000000002';
  assert n = 0, format('FAIL Q4: T1 sees %s of T2 requests (expected 0)', n);
  raise notice 'Q4 PASS: T1 cannot SELECT cross-tenant request R2';
end $$;

-- ===========================================================================
-- Q5 — PM-B (Org B) SELECTs → 1 row (R3 only; not Org A's R1 or R2).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"c1b00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.maintenance_requests;
  assert n = 1, format('FAIL Q5: PM-B sees %s requests (expected 1 Org B only)', n);
  perform 1 from public.maintenance_requests
    where id = 'c1f00000-0000-0000-0000-000000000003';
  assert found, 'FAIL Q5b: PM-B cannot see own R3';
  raise notice 'Q5 PASS: PM-B SELECT returns Org B requests only';
end $$;

-- ===========================================================================
-- Q6 — T1 SELECTs cross-org R3 → 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"c1a00000-0000-0000-0000-000000000020"}';

do $$
declare n int;
begin
  select count(*) into n from public.maintenance_requests
    where id = 'c1f00000-0000-0000-0000-000000000003';
  assert n = 0, format('FAIL Q6: T1 sees %s cross-org requests (expected 0)', n);
  raise notice 'Q6 PASS: T1 cannot SELECT cross-org request R3';
end $$;

-- ===========================================================================
-- Q7 — T1 INSERTs with all valid values → allowed.
-- Baseline: matching reported_by + matching org + matching tenant_id.
-- Verify the row count actually increased (Q7's value is that the row was
-- created, not just that no error was raised).
-- ===========================================================================
do $$
declare new_id uuid; n_pre int; n_post int;
begin
  select count(*) into n_pre from public.maintenance_requests
    where organization_id = 'c1000000-0000-0000-0000-00000000000a';

  insert into public.maintenance_requests
    (organization_id, property_id, tenant_id, reported_by, title)
  values
    ('c1000000-0000-0000-0000-00000000000a',
     'c1d00000-0000-0000-0000-000000000001',
     'c1c00000-0000-0000-0000-000000000001',
     'c1a00000-0000-0000-0000-000000000020',
     'S11 Q7 — T1 legitimate self-insert')
  returning id into new_id;
  assert new_id is not null, 'FAIL Q7a: T1 legitimate INSERT returned no id';

  select count(*) into n_post from public.maintenance_requests
    where organization_id = 'c1000000-0000-0000-0000-00000000000a';
  assert n_post = n_pre + 1,
    format('FAIL Q7b: row count did not increase (pre=%s, post=%s)', n_pre, n_post);
  raise notice 'Q7 PASS: T1 legitimate INSERT created the row (count + 1)';
end $$;

-- ===========================================================================
-- Q8 — T1 INSERTs with reported_by = T2's auth uid → rejected.
-- The tenant branch requires `reported_by = auth.uid()` — supplying anyone
-- else's uid (here T2's) breaks the equality.
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.maintenance_requests
      (organization_id, property_id, tenant_id, reported_by, title)
    values
      ('c1000000-0000-0000-0000-00000000000a',
       'c1d00000-0000-0000-0000-000000000001',
       'c1c00000-0000-0000-0000-000000000001',
       'c1a00000-0000-0000-0000-000000000021',                  -- T2's uid, not T1's
       'S11 Q8 — T1 forging reported_by');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Q8: T1 inserted with forged reported_by';
  raise notice 'Q8 PASS: reported_by = auth.uid() enforced (no forgery)';
end $$;

-- ===========================================================================
-- Q9 — T1 INSERTs with cross-org organization_id → rejected.
-- The tenant branch's EXISTS requires a tenants row with user_id = auth.uid()
-- AND organization_id = mr.organization_id. T1 has no tenants row in Org B,
-- so the EXISTS is empty.
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.maintenance_requests
      (organization_id, property_id, tenant_id, reported_by, title)
    values
      ('c1000000-0000-0000-0000-00000000000b',                  -- Org B (T1 is in A)
       'c1d00000-0000-0000-0000-000000000002',                  -- Org B's property
       null,
       'c1a00000-0000-0000-0000-000000000020',
       'S11 Q9 — T1 cross-org INSERT');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Q9: T1 inserted with cross-org organization_id';
  raise notice 'Q9 PASS: organization_id must match tenant''s own org';
end $$;

-- ===========================================================================
-- Q10 — T1 INSERTs with tenant_id = T2.id → rejected.
-- The EXISTS third condition: (mr.tenant_id is null OR mr.tenant_id = t.id).
-- T1's tenants row has id = T1.id, but mr.tenant_id = T2.id → the OR fails.
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.maintenance_requests
      (organization_id, property_id, tenant_id, reported_by, title)
    values
      ('c1000000-0000-0000-0000-00000000000a',
       'c1d00000-0000-0000-0000-000000000001',
       'c1c00000-0000-0000-0000-000000000002',                  -- T2's tenant_id, not T1's
       'c1a00000-0000-0000-0000-000000000020',
       'S11 Q10 — T1 wrong tenant_id');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Q10: T1 inserted with wrong tenant_id';
  raise notice 'Q10 PASS: tenant_id must be null or match inserter''s own tenant.id';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 11 (maintenance tenant-self) assertions PASSED'; end $$;

rollback;
