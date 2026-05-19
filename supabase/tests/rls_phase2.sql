-- ===========================================================================
-- rls_phase2.sql — Row Level Security tests for Phase 2 tables
--
-- Covers the three isolation dimensions for vendors, maintenance_requests,
-- work_orders, work_order_photos, and vendor_invoices:
--   * cross-organization isolation  (P1-P5)
--   * vendor-portal scoping          (V1-V11)
--   * within-org role isolation      (RW1-RW6)
--   * anon denial                    (AN1)
--
-- Every check is a plpgsql ASSERT: a failure aborts with SQLSTATE P0004 and a
-- 'FAIL <id>' message (a clean test failure); any other SQLSTATE is an
-- infrastructure error. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase2.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
-- Org A: an owner, a maintenance tech, and a vendor-portal user (vendor V1).
-- Org B: an owner. Two vendors in Org A (V1, V2), one in Org B (V3).
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('44444444-4444-4444-4444-444444444444', 'P2 Org A', 'rls-p2-org-a'),
    ('55555555-5555-5555-5555-555555555555', 'P2 Org B', 'rls-p2-org-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     '4a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
     'p2-a-owner@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '4a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
     'p2-a-tech@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '4a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
     'p2-a-vendor@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '5b000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
     'p2-b-owner@rls.test', '', now(), '{}', '{}', now(), now());
  -- handle_new_user has now created the public.users rows.

  -- Vendors must exist before users.vendor_id can reference one.
  insert into public.vendors (id, organization_id, name) values
    ('4d000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444', 'Vendor One'),
    ('4d000000-0000-0000-0000-000000000002',
     '44444444-4444-4444-4444-444444444444', 'Vendor Two'),
    ('5d000000-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555', 'Vendor Three');

  -- Org assignment. organization_id / vendor_id start NULL, so this initial
  -- set is permitted by protect_user_columns (it only blocks *reassignment*).
  update public.users set organization_id = '44444444-4444-4444-4444-444444444444'
    where id in ('4a000000-0000-0000-0000-000000000001',
                 '4a000000-0000-0000-0000-000000000002',
                 '4a000000-0000-0000-0000-000000000003');
  update public.users set organization_id = '55555555-5555-5555-5555-555555555555'
    where id = '5b000000-0000-0000-0000-000000000001';
  update public.users set vendor_id = '4d000000-0000-0000-0000-000000000001'
    where id = '4a000000-0000-0000-0000-000000000003';

  insert into public.user_roles (user_id, organization_id, role) values
    ('4a000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444', 'OWNER'),
    ('4a000000-0000-0000-0000-000000000002',
     '44444444-4444-4444-4444-444444444444', 'MAINTENANCE_TECH'),
    ('4a000000-0000-0000-0000-000000000003',
     '44444444-4444-4444-4444-444444444444', 'VENDOR_ADMIN'),
    ('5b000000-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555', 'OWNER');

  insert into public.properties (id, organization_id, name) values
    ('4c000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444', 'P2 A Property'),
    ('5c000000-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555', 'P2 B Property');

  insert into public.maintenance_requests
    (id, organization_id, property_id, reported_by, title) values
    ('4e000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444',
     '4c000000-0000-0000-0000-000000000001',
     '4a000000-0000-0000-0000-000000000001', 'Org A leak'),
    ('5e000000-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555',
     '5c000000-0000-0000-0000-000000000001',
     '5b000000-0000-0000-0000-000000000001', 'Org B leak');

  -- WO1 -> Vendor One, WO2 -> Vendor Two (both Org A); WO3 in Org B.
  insert into public.work_orders
    (id, organization_id, property_id, title, assignee_type, assigned_vendor_id)
  values
    ('4f000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444',
     '4c000000-0000-0000-0000-000000000001', 'WO1 for Vendor One',
     'vendor', '4d000000-0000-0000-0000-000000000001'),
    ('4f000000-0000-0000-0000-000000000002',
     '44444444-4444-4444-4444-444444444444',
     '4c000000-0000-0000-0000-000000000001', 'WO2 for Vendor Two',
     'vendor', '4d000000-0000-0000-0000-000000000002'),
    ('5f000000-0000-0000-0000-000000000001',
     '55555555-5555-5555-5555-555555555555',
     '5c000000-0000-0000-0000-000000000001', 'WO3 in Org B',
     'unassigned', null);

  insert into public.work_order_photos
    (id, organization_id, work_order_id, file_path) values
    ('40000000-0000-0000-0000-0000000000a1',
     '44444444-4444-4444-4444-444444444444',
     '4f000000-0000-0000-0000-000000000001', 'a/wo1/photo1.jpg'),
    ('40000000-0000-0000-0000-0000000000a2',
     '44444444-4444-4444-4444-444444444444',
     '4f000000-0000-0000-0000-000000000002', 'a/wo2/photo2.jpg');

  insert into public.vendor_invoices
    (id, organization_id, vendor_id, work_order_id, invoice_number, amount)
  values
    ('41000000-0000-0000-0000-000000000001',
     '44444444-4444-4444-4444-444444444444',
     '4d000000-0000-0000-0000-000000000001',
     '4f000000-0000-0000-0000-000000000001', 'INV-001', 250.00);

  raise notice 'Fixtures seeded: 2 orgs, 4 users, 3 vendors, 3 work orders';
end $$;

set local role authenticated;

-- ===========================================================================
-- Cross-organization isolation — acting as A-owner (Org A staff)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"4a000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  select count(*) into n from public.vendors;
  assert n = 2, format('FAIL P1: A-owner sees %s vendors (expected 2 Org A)', n);

  select count(*) into n from public.work_orders;
  assert n = 2, format('FAIL P2: A-owner sees %s work orders (expected 2 Org A)', n);

  select count(*) into n from public.maintenance_requests
    where organization_id = '55555555-5555-5555-5555-555555555555';
  assert n = 0, format('FAIL P3: A-owner sees %s Org B requests (expected 0)', n);

  raise notice 'Cross-org reads (A-owner): P1 P2 P3 PASS';
end $$;

do $$
declare n int;
begin
  -- P4: cross-org work_order insert rejected by WITH CHECK.
  begin
    insert into public.work_orders (organization_id, property_id, title)
      values ('55555555-5555-5555-5555-555555555555',
              '5c000000-0000-0000-0000-000000000001', 'sneaky');
    assert false, 'FAIL P4: A-owner inserted a work order into Org B';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'P4 PASS: cross-org work_order insert rejected';
  end;

  -- P5: cross-org work_order update affects 0 rows.
  with u as (
    update public.work_orders set title = 'hijacked'
    where id = '5f000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL P5: A-owner updated %s Org B work orders', n);
  raise notice 'P5 PASS: cross-org work_order update affected 0 rows';
end $$;

-- ===========================================================================
-- Vendor-portal scoping — acting as the Vendor One portal user
-- ===========================================================================
set local request.jwt.claims = '{"sub":"4a000000-0000-0000-0000-000000000003"}';
do $$
declare n int; only_id uuid;
begin
  -- V1: sees only its own vendor company.
  select count(*) into n from public.vendors;
  assert n = 1, format('FAIL V1: vendor user sees %s vendors (expected 1)', n);
  select id into only_id from public.vendors;
  assert only_id = '4d000000-0000-0000-0000-000000000001',
         'FAIL V1: vendor user sees a vendor that is not its own';

  -- V2: sees only work orders assigned to its vendor.
  select count(*) into n from public.work_orders;
  assert n = 1, format('FAIL V2: vendor user sees %s work orders (expected 1)', n);
  select id into only_id from public.work_orders;
  assert only_id = '4f000000-0000-0000-0000-000000000001',
         'FAIL V2: vendor user sees a work order not assigned to it';

  -- V3: vendors do not see maintenance requests at all.
  select count(*) into n from public.maintenance_requests;
  assert n = 0, format('FAIL V3: vendor user sees %s maintenance requests', n);

  -- V4: sees only photos on its own work order.
  select count(*) into n from public.work_order_photos;
  assert n = 1, format('FAIL V4: vendor user sees %s work order photos', n);
  select id into only_id from public.work_order_photos;
  assert only_id = '40000000-0000-0000-0000-0000000000a1',
         'FAIL V4: vendor user sees a photo on another vendor''s work order';

  -- V5: sees only its own invoices.
  select count(*) into n from public.vendor_invoices;
  assert n = 1, format('FAIL V5: vendor user sees %s invoices (expected 1)', n);

  -- V6: a vendor is not org staff -> sees no properties.
  select count(*) into n from public.properties;
  assert n = 0, format('FAIL V6: vendor user sees %s properties (expected 0)', n);

  raise notice 'Vendor scoping reads: V1 V2 V3 V4 V5 V6 PASS';
end $$;

do $$
declare n int; v uuid;
begin
  -- V7: vendor may advance the status of its own work order.
  with u as (
    update public.work_orders set status = 'accepted'
    where id = '4f000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into n from u;
  assert n = 1, format('FAIL V7: vendor could not update its own work order (%s rows)', n);
  raise notice 'V7 PASS: vendor updated its own work order';

  -- V8: vendor cannot reassign a work order away from itself (WITH CHECK).
  begin
    update public.work_orders
      set assigned_vendor_id = '4d000000-0000-0000-0000-000000000002'
      where id = '4f000000-0000-0000-0000-000000000001';
    select assigned_vendor_id into v from public.work_orders
      where id = '4f000000-0000-0000-0000-000000000001';
    assert v = '4d000000-0000-0000-0000-000000000001',
           'FAIL V8: vendor reassigned its work order to another vendor';
    raise notice 'V8 PASS: reassignment had no effect';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'V8 PASS: vendor reassignment rejected by WITH CHECK';
  end;

  -- V9: vendor cannot update another vendor's work order (USING excludes it).
  with u as (
    update public.work_orders set status = 'completed'
    where id = '4f000000-0000-0000-0000-000000000002' returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL V9: vendor updated another vendor''s work order (%s rows)', n);
  raise notice 'V9 PASS: vendor cannot update another vendor''s work order';

  -- V10: vendor cannot delete a work order (delete is manager-only).
  with d as (
    delete from public.work_orders
    where id = '4f000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into n from d;
  assert n = 0, format('FAIL V10: vendor deleted %s work orders', n);
  raise notice 'V10 PASS: vendor cannot delete a work order';

  -- V11: vendor cannot create a work order (insert is org-staff-only).
  begin
    insert into public.work_orders (organization_id, property_id, title)
      values ('44444444-4444-4444-4444-444444444444',
              '4c000000-0000-0000-0000-000000000001', 'vendor-created');
    assert false, 'FAIL V11: vendor inserted a work order';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'V11 PASS: vendor work_order insert rejected';
  end;
end $$;

-- ===========================================================================
-- Within-org role isolation — acting as A-tech (MAINTENANCE_TECH, org staff)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"4a000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  -- RW1: staff can read work orders.
  select count(*) into n from public.work_orders;
  assert n = 2, format('FAIL RW1: tech sees %s work orders (expected 2)', n);

  -- RW2: staff can read maintenance requests.
  select count(*) into n from public.maintenance_requests
    where organization_id = '44444444-4444-4444-4444-444444444444';
  assert n = 1, format('FAIL RW2: tech sees %s Org A requests (expected 1)', n);

  -- RW3: staff can update a work order (update is org-staff).
  with u as (
    update public.work_orders set notes = 'tech note'
    where id = '4f000000-0000-0000-0000-000000000002' returning 1
  )
  select count(*) into n from u;
  assert n = 1, format('FAIL RW3: tech could not update a work order (%s rows)', n);

  raise notice 'Within-org role reads/writes (tech): RW1 RW2 RW3 PASS';
end $$;

do $$
declare n int;
begin
  -- RW4: a tech is not a manager -> cannot delete a work order.
  with d as (
    delete from public.work_orders
    where id = '4f000000-0000-0000-0000-000000000002' returning 1
  )
  select count(*) into n from d;
  assert n = 0, format('FAIL RW4: tech deleted %s work orders', n);
  raise notice 'RW4 PASS: tech cannot delete a work order';

  -- RW5: a tech is not a manager -> cannot delete a maintenance request.
  with d as (
    delete from public.maintenance_requests
    where id = '4e000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into n from d;
  assert n = 0, format('FAIL RW5: tech deleted %s maintenance requests', n);
  raise notice 'RW5 PASS: tech cannot delete a maintenance request';

  -- RW6: a tech is not a manager -> cannot create a vendor.
  begin
    insert into public.vendors (organization_id, name)
      values ('44444444-4444-4444-4444-444444444444', 'tech-created vendor');
    assert false, 'FAIL RW6: tech created a vendor';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'RW6 PASS: tech cannot create a vendor';
  end;
end $$;

-- ===========================================================================
-- Anon denial
-- ===========================================================================
reset role;
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.work_orders;
    assert n = 0, format('FAIL AN1: anon read returned %s work orders', n);
    raise notice 'AN1 PASS: anon select returned 0 work orders';
  exception
    when insufficient_privilege then
      raise notice 'AN1 PASS: anon select denied (no table grant)';
  end;
end $$;

reset role;

do $$ begin raise notice 'ALL RLS PHASE 2 ASSERTIONS PASSED'; end $$;

rollback;
