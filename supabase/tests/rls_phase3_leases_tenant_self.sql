-- ===========================================================================
-- rls_phase3_leases_tenant_self.sql — Suite 7 — verifies the leases_select
-- tenant-self branch and the manager-only leases_write gating from migration
-- 20260521000100_phase3_leases.sql.
--
-- leases_select USING (4 active branches at HEAD):
--   1. (org_id = current_user_org_id() AND is_org_staff())          [staff]
--   2. exists (tenants where lease_id = leases.id AND user_id = uid) [tenant-self]
--   3. is_super_admin()                                              [platform]
-- leases_write USING + WITH CHECK:
--   (org_id = current_user_org_id() AND is_org_manager()) OR is_super_admin()
--
-- The tenant-self branch reaches `leases` only through the tenants.lease_id
-- FK linkage. A tenant in the same org with no lease_id (T-orphan) sees zero
-- leases. A tenant T1 in Org A with lease_id = L1 sees exactly L1 — not L2
-- in Org B, not any other tenant's lease. No tenant can UPDATE / DELETE /
-- INSERT a lease — the write policy is manager-only.
--
-- Numbering:
--   L1..L4  SELECT scoping (staff read; tenant-self read; cross-org denied;
--           orphan tenant denied)
--   L5..L7  WRITE denied for tenants (UPDATE → 0 rows; DELETE → 0 rows;
--           INSERT → rejected by WITH CHECK)
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_leases_tenant_self.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('b7000000-0000-0000-0000-00000000000a', 'Suite 7 Org A', 'rls-s7-a'),
    ('b7000000-0000-0000-0000-00000000000b', 'Suite 7 Org B', 'rls-s7-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A property manager
    ('00000000-0000-0000-0000-000000000000',
     'b7a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's7-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T1 (linked to lease L1)
    ('00000000-0000-0000-0000-000000000000',
     'b7a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     's7-t1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T-orphan (no lease_id)
    ('00000000-0000-0000-0000-000000000000',
     'b7a00000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
     's7-torphan-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B property manager (exists so Org B has a lease — not directly tested)
    ('00000000-0000-0000-0000-000000000000',
     'b7b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's7-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b7000000-0000-0000-0000-00000000000a'
    where id in ('b7a00000-0000-0000-0000-000000000010',
                 'b7a00000-0000-0000-0000-000000000020',
                 'b7a00000-0000-0000-0000-000000000021');
  update public.users set organization_id = 'b7000000-0000-0000-0000-00000000000b'
    where id = 'b7b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('b7a00000-0000-0000-0000-000000000010',
     'b7000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b7a00000-0000-0000-0000-000000000020',
     'b7000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('b7a00000-0000-0000-0000-000000000021',
     'b7000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('b7b00000-0000-0000-0000-000000000010',
     'b7000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Properties and units (one per org) — leases.unit_id is NOT NULL.
  insert into public.properties (id, organization_id, name) values
    ('b7d00000-0000-0000-0000-000000000001',
     'b7000000-0000-0000-0000-00000000000a', 'S7 Property A'),
    ('b7d00000-0000-0000-0000-000000000002',
     'b7000000-0000-0000-0000-00000000000b', 'S7 Property B');

  insert into public.units (id, organization_id, property_id, unit_number) values
    ('b7e00000-0000-0000-0000-000000000001',
     'b7000000-0000-0000-0000-00000000000a',
     'b7d00000-0000-0000-0000-000000000001', '101'),
    ('b7e00000-0000-0000-0000-000000000002',
     'b7000000-0000-0000-0000-00000000000b',
     'b7d00000-0000-0000-0000-000000000002', '201');

  -- Leases: L1 in Org A (T1's lease), L2 in Org B (cross-org).
  insert into public.leases
    (id, organization_id, unit_id, start_date, monthly_rent, status)
  values
    ('b7f00000-0000-0000-0000-000000000001',
     'b7000000-0000-0000-0000-00000000000a',
     'b7e00000-0000-0000-0000-000000000001',
     date '2026-01-01', 1500.00, 'active'),
    ('b7f00000-0000-0000-0000-000000000002',
     'b7000000-0000-0000-0000-00000000000b',
     'b7e00000-0000-0000-0000-000000000002',
     date '2026-01-01', 2000.00, 'active');

  -- Tenant rows: T1 attached to lease L1 via tenants.lease_id;
  -- T-orphan in Org A with NO lease_id.
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, lease_id)
  values
    ('b7c00000-0000-0000-0000-000000000001',
     'b7000000-0000-0000-0000-00000000000a',
     'b7a00000-0000-0000-0000-000000000020', 'Tee', 'One',
     'b7f00000-0000-0000-0000-000000000001'),
    ('b7c00000-0000-0000-0000-000000000002',
     'b7000000-0000-0000-0000-00000000000a',
     'b7a00000-0000-0000-0000-000000000021', 'Tee', 'Orphan',
     null);

  raise notice 'Fixtures seeded: 2 orgs, 4 users, 2 props, 2 units, 2 leases, 2 tenants';
end $$;

-- ===========================================================================
-- L1 — PM in Org A SELECTs leases → sees Org A only (1 row).
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b7a00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.leases;
  assert n = 1, format('FAIL L1: PM sees %s leases (expected 1)', n);
  raise notice 'L1 PASS: PM SELECT leases returns Org A only';
end $$;

-- ===========================================================================
-- L2 — Tenant T1 SELECTs leases → sees own lease L1 (1 row).
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b7a00000-0000-0000-0000-000000000020"}';

do $$
declare n int;
begin
  select count(*) into n from public.leases
    where id = 'b7f00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL L2: T1 sees %s of own lease (expected 1)', n);
  raise notice 'L2 PASS: T1 SELECT own lease via tenant-self branch';
end $$;

-- ===========================================================================
-- L3 — Tenant T1 SELECTs cross-org lease L2 → 0 rows.
-- ===========================================================================
do $$
declare n int;
begin
  select count(*) into n from public.leases
    where id = 'b7f00000-0000-0000-0000-000000000002';
  assert n = 0, format('FAIL L3: T1 sees %s cross-org leases (expected 0)', n);
  raise notice 'L3 PASS: T1 cannot SELECT cross-org lease';
end $$;

-- ===========================================================================
-- L4 — T-orphan (TENANT role, no lease_id) SELECTs leases → 0 rows.
-- tenant-self branch requires the EXISTS subquery to find a tenants row
-- with lease_id matching. T-orphan's tenants row has lease_id = null →
-- subquery is empty → branch is false. is_org_staff is false. → 0 rows.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b7a00000-0000-0000-0000-000000000021"}';

do $$
declare n int;
begin
  select count(*) into n from public.leases;
  assert n = 0, format('FAIL L4: T-orphan sees %s leases (expected 0)', n);
  raise notice 'L4 PASS: T-orphan (no lease_id) sees 0 leases';
end $$;

-- ===========================================================================
-- L5 — T1 UPDATE L1 → 0 rows. leases_write USING is manager-only, so the
-- update affects no rows. Verify the row was not mutated.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b7a00000-0000-0000-0000-000000000020"}';

do $$
declare n int;
begin
  with u as (
    update public.leases set monthly_rent = 999.00
     where id = 'b7f00000-0000-0000-0000-000000000001'
     returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL L5: T1 UPDATE affected %s rows (expected 0)', n);
  -- Defence-in-depth: verify the row's monthly_rent is unchanged.
  -- T1 can read L1 (tenant-self branch), so this read succeeds.
  perform 1 from public.leases
    where id = 'b7f00000-0000-0000-0000-000000000001'
      and monthly_rent = 1500.00;
  assert found, 'FAIL L5b: T1 UPDATE actually mutated monthly_rent';
  raise notice 'L5 PASS: T1 UPDATE denied (0 rows; monthly_rent unchanged)';
end $$;

-- ===========================================================================
-- L6 — T1 DELETE L1 → 0 rows. Verify the row still exists.
-- ===========================================================================
do $$
declare n int;
begin
  with d as (
    delete from public.leases
     where id = 'b7f00000-0000-0000-0000-000000000001'
     returning 1
  )
  select count(*) into n from d;
  assert n = 0, format('FAIL L6: T1 DELETE affected %s rows (expected 0)', n);
  perform 1 from public.leases
    where id = 'b7f00000-0000-0000-0000-000000000001';
  assert found, 'FAIL L6b: T1 DELETE actually removed the row';
  raise notice 'L6 PASS: T1 DELETE denied (0 rows; lease still present)';
end $$;

-- ===========================================================================
-- L7 — T1 INSERT a new lease → rejected by WITH CHECK. The write branch
-- requires is_org_manager(); T1 is a tenant. Postgres raises
-- insufficient_privilege (or check_violation, depending on which gate
-- catches it first).
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.leases
      (organization_id, unit_id, start_date, monthly_rent, status)
    values
      ('b7000000-0000-0000-0000-00000000000a',
       'b7e00000-0000-0000-0000-000000000001',
       date '2026-06-01', 1000.00, 'upcoming');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL L7: tenant successfully inserted a lease';
  raise notice 'L7 PASS: T1 INSERT lease rejected (manager-only WITH CHECK)';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 7 (leases tenant-self) assertions PASSED'; end $$;

rollback;
