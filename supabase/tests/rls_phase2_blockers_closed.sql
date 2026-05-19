-- ===========================================================================
-- rls_phase2_blockers_closed.sql — verifies the §8.1/§8.2/§8.3 fixes from
-- migrations 20260519001100, 20260519001200, 20260519001300.
--
-- For each closed gap the test covers BOTH:
--   * the hole is closed (attack vector rejected); and
--   * legitimate vendor-portal behaviour still works (regression).
--
-- Naming:
--   §8.3 stray-role / regression reads   -> R1..R8
--   §8.1 org_id pin on vendor writes     -> C1..C8
--   §8.2 vendor invoice status clamp     -> S1..S9
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message — a clean test failure. Any other SQLSTATE
-- is an infrastructure error. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase2_blockers_closed.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('88888888-8888-8888-8888-888888888888', 'CG Org A', 'rls-cg-org-a'),
    ('99999999-9999-9999-9999-999999999999', 'CG Org B', 'rls-cg-org-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     '8a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
     'cg-mgr@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '8a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
     'cg-vendor@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     '8a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
     'cg-stray@rls.test', '', now(), '{}', '{}', now(), now());

  insert into public.vendors (id, organization_id, name)
    values ('8d000000-0000-0000-0000-000000000001',
            '88888888-8888-8888-8888-888888888888', 'CG Vendor One');

  -- A-mgr + VU1 are in Org A. SU1 (stray) has NO org but has a vendor_id
  -- assigned — only possible because the fixture runs as postgres
  -- (privileged caller, §8.4 trigger lets trusted roles set vendor_id).
  update public.users set organization_id = '88888888-8888-8888-8888-888888888888'
    where id in ('8a000000-0000-0000-0000-000000000001',
                 '8a000000-0000-0000-0000-000000000002');
  update public.users set vendor_id = '8d000000-0000-0000-0000-000000000001'
    where id in ('8a000000-0000-0000-0000-000000000002',
                 '8a000000-0000-0000-0000-000000000003');

  insert into public.user_roles (user_id, organization_id, role) values
    ('8a000000-0000-0000-0000-000000000001',
     '88888888-8888-8888-8888-888888888888', 'PROPERTY_MANAGER'),
    ('8a000000-0000-0000-0000-000000000002',
     '88888888-8888-8888-8888-888888888888', 'VENDOR_ADMIN');
  -- SU1 (stray) has NO user_roles row.

  insert into public.properties (id, organization_id, name)
    values ('8c000000-0000-0000-0000-000000000001',
            '88888888-8888-8888-8888-888888888888', 'CG Property');

  insert into public.work_orders
    (id, organization_id, property_id, title, assignee_type, assigned_vendor_id)
  values
    ('8f000000-0000-0000-0000-000000000001',
     '88888888-8888-8888-8888-888888888888',
     '8c000000-0000-0000-0000-000000000001', 'CG WO1',
     'vendor', '8d000000-0000-0000-0000-000000000001');

  insert into public.work_order_photos
    (id, organization_id, work_order_id, file_path) values
    ('80000000-0000-0000-0000-0000000000a1',
     '88888888-8888-8888-8888-888888888888',
     '8f000000-0000-0000-0000-000000000001', 'cg/wo1/p1.jpg');

  insert into public.vendor_invoices
    (id, organization_id, vendor_id, work_order_id, invoice_number, amount, status)
  values
    ('81000000-0000-0000-0000-000000000001',
     '88888888-8888-8888-8888-888888888888',
     '8d000000-0000-0000-0000-000000000001',
     '8f000000-0000-0000-0000-000000000001', 'CG-INV-001', 100.00, 'submitted');

  raise notice 'Fixtures seeded: 2 orgs, 3 users, 1 vendor, 1 WO, 1 photo, 1 invoice';
end $$;

set local role authenticated;

-- ===========================================================================
-- §8.3 — stray-vendor-id user (vendor_id set, no VENDOR role) sees nothing.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"8a000000-0000-0000-0000-000000000003"}';

do $$
declare n int;
begin
  select count(*) into n from public.vendors;
  assert n = 0, format('FAIL R1: stray user sees %s vendors (expected 0)', n);
  raise notice 'R1 PASS: stray user (vendor_id set, no role) sees 0 vendors';

  select count(*) into n from public.work_orders;
  assert n = 0, format('FAIL R2: stray user sees %s work_orders (expected 0)', n);
  raise notice 'R2 PASS: stray user sees 0 work_orders';

  select count(*) into n from public.vendor_invoices;
  assert n = 0, format('FAIL R3: stray user sees %s vendor_invoices (expected 0)', n);
  raise notice 'R3 PASS: stray user sees 0 vendor_invoices';

  select count(*) into n from public.work_order_photos;
  assert n = 0, format('FAIL R4: stray user sees %s photos (expected 0)', n);
  raise notice 'R4 PASS: stray user sees 0 work_order_photos';
end $$;

-- ===========================================================================
-- §8.3 regression — legitimate vendor user (VENDOR_ADMIN) still sees own data.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"8a000000-0000-0000-0000-000000000002"}';

do $$
declare n int;
begin
  select count(*) into n from public.vendors;
  assert n = 1, format('FAIL R5: legitimate vendor sees %s vendors (expected 1)', n);
  raise notice 'R5 PASS: legitimate vendor sees own vendor row';

  select count(*) into n from public.work_orders;
  assert n = 1, format('FAIL R6: legitimate vendor sees %s work_orders (expected 1)', n);
  raise notice 'R6 PASS: legitimate vendor sees assigned work_orders';

  select count(*) into n from public.vendor_invoices;
  assert n = 1, format('FAIL R7: legitimate vendor sees %s invoices (expected 1)', n);
  raise notice 'R7 PASS: legitimate vendor sees own vendor_invoices';

  select count(*) into n from public.work_order_photos;
  assert n = 1, format('FAIL R8: legitimate vendor sees %s photos (expected 1)', n);
  raise notice 'R8 PASS: legitimate vendor sees photos on assigned work_orders';
end $$;

-- ===========================================================================
-- §8.1 — vendor cannot move rows between orgs, but legitimate writes work.
-- ===========================================================================
do $$
declare n int;
begin
  with u as (
    update public.work_orders set status = 'accepted'
    where id = '8f000000-0000-0000-0000-000000000001' returning 1
  )
  select count(*) into n from u;
  assert n = 1, format('FAIL C1: vendor could not update own WO status (rows=%s)', n);
  raise notice 'C1 PASS: vendor can still update own WO status (legitimate)';
end $$;

do $$
declare org_after uuid;
begin
  begin
    update public.work_orders
       set organization_id = '99999999-9999-9999-9999-999999999999'
     where id = '8f000000-0000-0000-0000-000000000001';
    -- If no exception fired, verify the row did not actually move.
    select organization_id into org_after from public.work_orders
      where id = '8f000000-0000-0000-0000-000000000001';
    assert org_after = '88888888-8888-8888-8888-888888888888',
      format('FAIL C2: vendor moved WO to another org (got %s)', org_after);
    raise notice 'C2 PASS: vendor org_id UPDATE on work_order had no effect';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'C2 PASS: vendor org_id UPDATE on work_order rejected by WITH CHECK';
  end;
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.work_order_photos
      (organization_id, work_order_id, file_path)
    values
      ('99999999-9999-9999-9999-999999999999',
       '8f000000-0000-0000-0000-000000000001', 'cg/sneaky.jpg');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL C3: vendor inserted a photo with mismatched org_id';
  raise notice 'C3 PASS: vendor cannot INSERT photo with mismatched org_id';
end $$;

do $$
declare n int;
begin
  insert into public.work_order_photos
    (organization_id, work_order_id, file_path)
  values
    ('88888888-8888-8888-8888-888888888888',
     '8f000000-0000-0000-0000-000000000001', 'cg/legit.jpg');
  select count(*) into n from public.work_order_photos
    where work_order_id = '8f000000-0000-0000-0000-000000000001';
  assert n >= 2, format('FAIL C4: legitimate photo insert failed (count=%s)', n);
  raise notice 'C4 PASS: vendor CAN INSERT photo with matching org_id (legitimate)';
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.vendor_invoices
      (organization_id, vendor_id, work_order_id, invoice_number, amount, status)
    values
      ('99999999-9999-9999-9999-999999999999',
       '8d000000-0000-0000-0000-000000000001',
       '8f000000-0000-0000-0000-000000000001',
       'CG-bad-org', 50, 'submitted');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL C5: vendor inserted invoice with mismatched org_id';
  raise notice 'C5 PASS: vendor cannot INSERT invoice with mismatched org_id';
end $$;

do $$
declare new_id uuid;
begin
  insert into public.vendor_invoices
    (organization_id, vendor_id, work_order_id, invoice_number, amount, status)
  values
    ('88888888-8888-8888-8888-888888888888',
     '8d000000-0000-0000-0000-000000000001',
     '8f000000-0000-0000-0000-000000000001',
     'CG-legit', 75, 'draft')
  returning id into new_id;
  assert new_id is not null, 'FAIL C6: legitimate invoice insert failed';
  raise notice 'C6 PASS: vendor CAN INSERT invoice with matching org_id + draft status';
end $$;

do $$
declare org_after uuid;
begin
  begin
    update public.vendor_invoices
       set organization_id = '99999999-9999-9999-9999-999999999999'
     where id = '81000000-0000-0000-0000-000000000001';
    select organization_id into org_after from public.vendor_invoices
      where id = '81000000-0000-0000-0000-000000000001';
    assert org_after = '88888888-8888-8888-8888-888888888888',
      format('FAIL C7: vendor moved invoice to another org (got %s)', org_after);
    raise notice 'C7 PASS: vendor org_id UPDATE on invoice had no effect';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'C7 PASS: vendor org_id UPDATE on invoice rejected by WITH CHECK';
  end;
end $$;

do $$
declare nt text;
begin
  update public.vendor_invoices set notes = 'vendor note'
    where id = '81000000-0000-0000-0000-000000000001';
  select notes into nt from public.vendor_invoices
    where id = '81000000-0000-0000-0000-000000000001';
  assert nt = 'vendor note',
    format('FAIL C8: vendor could not update invoice notes (got %s)', nt);
  raise notice 'C8 PASS: vendor can update own invoice non-protected fields (legitimate)';
end $$;

-- ===========================================================================
-- §8.2 — vendor cannot write protected status; can write draft/submitted.
-- ===========================================================================
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.vendor_invoices
      (organization_id, vendor_id, invoice_number, amount, status)
    values
      ('88888888-8888-8888-8888-888888888888',
       '8d000000-0000-0000-0000-000000000001',
       'CG-S1-approved', 100, 'approved');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL S1: vendor inserted invoice with status=approved';
  raise notice 'S1 PASS: vendor cannot INSERT invoice with status=approved';
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.vendor_invoices
      (organization_id, vendor_id, invoice_number, amount, status)
    values
      ('88888888-8888-8888-8888-888888888888',
       '8d000000-0000-0000-0000-000000000001',
       'CG-S2-paid', 100, 'paid');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL S2: vendor inserted invoice with status=paid';
  raise notice 'S2 PASS: vendor cannot INSERT invoice with status=paid';
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.vendor_invoices
      (organization_id, vendor_id, invoice_number, amount, status)
    values
      ('88888888-8888-8888-8888-888888888888',
       '8d000000-0000-0000-0000-000000000001',
       'CG-S3-rejected', 100, 'rejected');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL S3: vendor inserted invoice with status=rejected';
  raise notice 'S3 PASS: vendor cannot INSERT invoice with status=rejected';
end $$;

do $$
declare new_id uuid;
begin
  insert into public.vendor_invoices
    (organization_id, vendor_id, invoice_number, amount, status)
  values
    ('88888888-8888-8888-8888-888888888888',
     '8d000000-0000-0000-0000-000000000001',
     'CG-S4-draft', 50, 'draft')
  returning id into new_id;
  assert new_id is not null, 'FAIL S4: legitimate draft INSERT rejected';
  raise notice 'S4 PASS: vendor CAN INSERT invoice with status=draft (legitimate)';
end $$;

do $$
declare new_id uuid;
begin
  insert into public.vendor_invoices
    (organization_id, vendor_id, invoice_number, amount, status)
  values
    ('88888888-8888-8888-8888-888888888888',
     '8d000000-0000-0000-0000-000000000001',
     'CG-S5-submitted', 50, 'submitted')
  returning id into new_id;
  assert new_id is not null, 'FAIL S5: legitimate submitted INSERT rejected';
  raise notice 'S5 PASS: vendor CAN INSERT invoice with status=submitted (legitimate)';
end $$;

do $$
declare st text;
begin
  begin
    update public.vendor_invoices set status = 'paid'
      where id = '81000000-0000-0000-0000-000000000001';
    select status into st from public.vendor_invoices
      where id = '81000000-0000-0000-0000-000000000001';
    assert st <> 'paid',
      format('FAIL S6: vendor changed status to paid (got %s)', st);
    raise notice 'S6 PASS: vendor UPDATE status=paid had no effect';
  exception
    when insufficient_privilege or check_violation then
      raise notice 'S6 PASS: vendor UPDATE status=paid rejected by WITH CHECK';
  end;
end $$;

do $$
declare st text;
begin
  update public.vendor_invoices set status = 'draft'
    where id = '81000000-0000-0000-0000-000000000001';
  select status into st from public.vendor_invoices
    where id = '81000000-0000-0000-0000-000000000001';
  assert st = 'draft',
    format('FAIL S7: vendor UPDATE to draft failed (got %s)', st);
  raise notice 'S7 PASS: vendor CAN UPDATE invoice status=draft (legitimate)';
end $$;

-- ===========================================================================
-- §8.2 regression — staff manager retains full status control.
-- ===========================================================================
set local request.jwt.claims = '{"sub":"8a000000-0000-0000-0000-000000000001"}';

do $$
declare new_id uuid;
begin
  insert into public.vendor_invoices
    (organization_id, vendor_id, invoice_number, amount, status)
  values
    ('88888888-8888-8888-8888-888888888888',
     '8d000000-0000-0000-0000-000000000001',
     'CG-S8-approved-by-mgr', 200, 'approved')
  returning id into new_id;
  assert new_id is not null, 'FAIL S8: staff manager could not INSERT approved';
  raise notice 'S8 PASS: staff manager CAN INSERT invoice with status=approved';
end $$;

do $$
declare st text;
begin
  update public.vendor_invoices set status = 'paid'
    where id = '81000000-0000-0000-0000-000000000001';
  select status into st from public.vendor_invoices
    where id = '81000000-0000-0000-0000-000000000001';
  assert st = 'paid', format('FAIL S9: staff manager UPDATE to paid failed (got %s)', st);
  raise notice 'S9 PASS: staff manager CAN UPDATE invoice status=paid';
end $$;

reset role;

do $$ begin raise notice 'ALL §8.1 / §8.2 / §8.3 closure assertions PASSED'; end $$;

rollback;
