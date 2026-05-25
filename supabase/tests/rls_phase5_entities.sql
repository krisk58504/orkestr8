-- ===========================================================================
-- rls_phase5_entities.sql — Phase 5 Suite 14 — verifies RLS for the three
-- new Phase 5 entity tables: rent_charges (slice 10a), payments (slice
-- 10b), property_owners (slice 10e).
--
-- Source migrations covered:
--   * 20260601000100_phase5_rent_charges.sql       — rent_charges + 4 policies
--                                                    with §8.1 FK pins on
--                                                    lease_id, tenant_id,
--                                                    unit_id
--   * 20260602000100_phase5_payments.sql           — payments + 4 policies
--                                                    with §8.1 FK pins on
--                                                    charge_id, tenant_id,
--                                                    recorded_by, conditional
--                                                    refunded_by
--   * 20260603000100_phase5_owner_portal.sql       — property_owners
--                                                    junction + 4 policies
--                                                    (manager-only writes,
--                                                    NOT can_write_tenants)
--                                                    with §8.1 FK pins on
--                                                    user_id, property_id
--
-- Posture per PHASE_5_PLAN.md §3:
--   * rent_charges / payments — narrow write (can_write_tenants); read has
--     3 branches (staff + tenant-self + owner-self), slice 10e drop-and-
--     recreate added owner-self; Suite 14 exercises the staff + tenant-
--     self paths plus cross-org isolation (owner-self is Suite 15's
--     concern).
--   * property_owners — manager-only writes (is_org_manager — NOT
--     can_write_tenants — granting has financial-data implications);
--     read has org-staff + self-read branches.
--
-- Numbering:
--   C1..C8   rent_charges  — read cohort + write gating + §8.1 FK pins
--   Y1..Y8   payments      — read cohort + write gating + §8.1 FK pins
--   J1..J9   property_owners junction — staff/self read + manager-only
--                            write + INVESTOR self-grant rejection + §8.1
--                            FK pins on user_id and property_id
--
-- Every check is a plpgsql ASSERT. Failed assertion aborts with SQLSTATE
-- P0004. Runs in one transaction; ROLLBACK at the end.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase5_entities.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) ------------------------------------------
do $$
begin
  -- 2 orgs
  insert into public.organizations (id, name, slug) values
    ('f1000000-0000-0000-0000-00000000000a', 'P5-S14 Org A', 'rls-p5s14-a'),
    ('f1000000-0000-0000-0000-00000000000b', 'P5-S14 Org B', 'rls-p5s14-b');

  -- auth.users + public.users (handle_new_user trigger creates public row)
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A: PROPERTY_MANAGER
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p5s14-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: LEASING_AGENT
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     'p5s14-la-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: MAINTENANCE_TECH (is_org_staff, NOT can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000012', 'authenticated', 'authenticated',
     'p5s14-mt-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: INVESTOR (for property_owners J2 self-read + J7 self-grant)
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000013', 'authenticated', 'authenticated',
     'p5s14-inv-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: TENANT auth user (linked to Ten-A1)
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p5s14-t1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B: PROPERTY_MANAGER (cross-org)
    ('00000000-0000-0000-0000-000000000000',
     'f1b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p5s14-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'f1000000-0000-0000-0000-00000000000a'
    where id in ('f1a00000-0000-0000-0000-000000000010',
                 'f1a00000-0000-0000-0000-000000000011',
                 'f1a00000-0000-0000-0000-000000000012',
                 'f1a00000-0000-0000-0000-000000000013',
                 'f1a00000-0000-0000-0000-000000000014');
  update public.users set organization_id = 'f1000000-0000-0000-0000-00000000000b'
    where id = 'f1b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('f1a00000-0000-0000-0000-000000000010', 'f1000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('f1a00000-0000-0000-0000-000000000011', 'f1000000-0000-0000-0000-00000000000a', 'LEASING_AGENT'),
    ('f1a00000-0000-0000-0000-000000000012', 'f1000000-0000-0000-0000-00000000000a', 'MAINTENANCE_TECH'),
    ('f1a00000-0000-0000-0000-000000000013', 'f1000000-0000-0000-0000-00000000000a', 'INVESTOR'),
    ('f1a00000-0000-0000-0000-000000000014', 'f1000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('f1b00000-0000-0000-0000-000000000010', 'f1000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- properties + units (one per org)
  insert into public.properties (id, organization_id, name) values
    ('f1d00000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-00000000000a', 'P5-S14 Prop A'),
    ('f1d00000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-00000000000b', 'P5-S14 Prop B');

  insert into public.units (id, organization_id, property_id, unit_number) values
    ('f1e00000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1d00000-0000-0000-0000-000000000001', '101'),
    ('f1e00000-0000-0000-0000-000000000002',
     'f1000000-0000-0000-0000-00000000000b',
     'f1d00000-0000-0000-0000-000000000002', '201');

  -- tenants: Ten-A1 in Org A linked to T1-A auth user; Ten-B1 in Org B
  -- (cross-org tenant target for §8.1 FK pin tests)
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, email, unit_id)
  values
    ('f1c00000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1a00000-0000-0000-0000-000000000014',
     'Ten', 'A1', 'p5s14-t1-a@rls.test',
     'f1e00000-0000-0000-0000-000000000001'),
    ('f1c00000-0000-0000-0000-000000000002',
     'f1000000-0000-0000-0000-00000000000b', null,
     'Ten', 'B1', 'p5s14-t1-b@rls.test',
     'f1e00000-0000-0000-0000-000000000002');

  -- leases: one per org
  insert into public.leases
    (id, organization_id, unit_id, start_date, monthly_rent, status)
  values
    ('f1f00000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1e00000-0000-0000-0000-000000000001',
     date '2026-01-01', 1500.00, 'active'),
    ('f1f00000-0000-0000-0000-000000000002',
     'f1000000-0000-0000-0000-00000000000b',
     'f1e00000-0000-0000-0000-000000000002',
     date '2026-01-01', 2000.00, 'active');

  -- Wire Ten-A1's lease_id (denormalized field). Used by tenant-self chains.
  update public.tenants set lease_id = 'f1f00000-0000-0000-0000-000000000001'
    where id = 'f1c00000-0000-0000-0000-000000000001';

  -- rent_charge in Org A (Ten-A1 / Lease-A1 / Unit-A)
  insert into public.rent_charges
    (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
  values
    ('f1f10000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1f00000-0000-0000-0000-000000000001',
     'f1c00000-0000-0000-0000-000000000001',
     'f1e00000-0000-0000-0000-000000000001',
     1500.00, date '2026-04-01');

  -- payment in Org A (against the rent_charge above; recorded_by = PM-A)
  insert into public.payments
    (id, organization_id, charge_id, tenant_id, amount_paid, paid_at,
     method, recorded_by)
  values
    ('f1f20000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1f10000-0000-0000-0000-000000000001',
     'f1c00000-0000-0000-0000-000000000001',
     500.00, now(), 'check',
     'f1a00000-0000-0000-0000-000000000010');

  -- property_owners grant: INV-A owns Prop-A (J2 self-read target)
  insert into public.property_owners
    (id, organization_id, user_id, property_id, created_by)
  values
    ('f1f30000-0000-0000-0000-000000000001',
     'f1000000-0000-0000-0000-00000000000a',
     'f1a00000-0000-0000-0000-000000000013',
     'f1d00000-0000-0000-0000-000000000001',
     'f1a00000-0000-0000-0000-000000000010');

  raise notice 'Suite 14 fixtures seeded: 2 orgs, 6 users, 2 properties, 2 units, 2 tenants, 2 leases, 1 charge, 1 payment, 1 ownership grant';
end $$;

-- ===========================================================================
-- ====================== C group — rent_charges (8) =========================
-- ===========================================================================
set local role authenticated;

-- C1 — PM-A reads rent_charges → 1 (staff branch with can_write_tenants).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges;
  assert n = 1, format('FAIL C1: PM sees %s rent_charges (expected 1)', n);
  raise notice 'C1 PASS: PM SELECT rent_charges → 1';
end $$;

-- C2 — Tenant T1-A reads rent_charges → 1 (tenant-self branch).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000014"}';
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges;
  assert n = 1, format('FAIL C2: T1 sees %s rent_charges (expected 1)', n);
  raise notice 'C2 PASS: T1 SELECT rent_charges → 1 (tenant-self branch)';
end $$;

-- C3 — MT-A reads rent_charges → 0 (narrow write/read: MT is is_org_staff
-- but NOT can_write_tenants, so the staff branch denies).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000012"}';
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges;
  assert n = 0, format('FAIL C3: MT sees %s rent_charges (expected 0 — narrow)', n);
  raise notice 'C3 PASS: MT cannot SELECT rent_charges (narrow read)';
end $$;

-- C4 — PM-B (Org B) reads Org A rent_charges → 0 (cross-org isolation).
set local request.jwt.claims = '{"sub":"f1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.rent_charges
    where organization_id = 'f1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL C4: PM-B sees %s Org A charges (expected 0)', n);
  raise notice 'C4 PASS: PM-B cannot SELECT cross-org rent_charges';
end $$;

-- C5 — PM-A INSERTs rent_charge with same-org FKs → allowed.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.rent_charges
    (organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
  values
    ('f1000000-0000-0000-0000-00000000000a',
     'f1f00000-0000-0000-0000-000000000001',
     'f1c00000-0000-0000-0000-000000000001',
     'f1e00000-0000-0000-0000-000000000001',
     1500.00, date '2026-05-01')
  returning id into new_id;
  assert new_id is not null, 'FAIL C5: PM same-org INSERT returned no id';
  raise notice 'C5 PASS: PM INSERT rent_charge allowed';
end $$;

-- C6 — MT-A INSERTs rent_charge → rejected (can_write_tenants gate).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.rent_charges
      (organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f00000-0000-0000-0000-000000000001',
       'f1c00000-0000-0000-0000-000000000001',
       'f1e00000-0000-0000-0000-000000000001',
       100.00, date '2026-06-01');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL C6: MT inserted a rent_charge';
  raise notice 'C6 PASS: MT INSERT rent_charge rejected';
end $$;

-- C7 — PM-A INSERTs with cross-org lease_id → rejected (§8.1 FK pin).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.rent_charges
      (organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f00000-0000-0000-0000-000000000002', -- Lease-B1 in Org B
       'f1c00000-0000-0000-0000-000000000001',
       'f1e00000-0000-0000-0000-000000000001',
       1500.00, date '2026-07-01');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL C7: PM inserted rent_charge with cross-org lease_id';
  raise notice 'C7 PASS: cross-org lease_id rejected (§8.1 FK pin)';
end $$;

-- C8 — PM-A INSERTs with cross-org tenant_id → rejected (§8.1 FK pin).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.rent_charges
      (organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f00000-0000-0000-0000-000000000001',
       'f1c00000-0000-0000-0000-000000000002', -- Ten-B1 in Org B
       'f1e00000-0000-0000-0000-000000000001',
       1500.00, date '2026-08-01');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL C8: PM inserted rent_charge with cross-org tenant_id';
  raise notice 'C8 PASS: cross-org tenant_id rejected (§8.1 FK pin)';
end $$;

-- ===========================================================================
-- ========================= Y group — payments (8) ==========================
-- ===========================================================================

-- Y1 — PM-A reads payments → 1.
do $$
declare n int;
begin
  select count(*) into n from public.payments;
  assert n = 1, format('FAIL Y1: PM sees %s payments (expected 1)', n);
  raise notice 'Y1 PASS: PM SELECT payments → 1';
end $$;

-- Y2 — Tenant T1-A reads payments → 1 (tenant-self).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000014"}';
do $$
declare n int;
begin
  select count(*) into n from public.payments;
  assert n = 1, format('FAIL Y2: T1 sees %s payments (expected 1)', n);
  raise notice 'Y2 PASS: T1 SELECT payments → 1 (tenant-self branch)';
end $$;

-- Y3 — MT-A reads payments → 0 (narrow).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000012"}';
do $$
declare n int;
begin
  select count(*) into n from public.payments;
  assert n = 0, format('FAIL Y3: MT sees %s payments (expected 0)', n);
  raise notice 'Y3 PASS: MT cannot SELECT payments (narrow read)';
end $$;

-- Y4 — PM-B reads Org A payments → 0.
set local request.jwt.claims = '{"sub":"f1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.payments
    where organization_id = 'f1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL Y4: PM-B sees %s Org A payments (expected 0)', n);
  raise notice 'Y4 PASS: PM-B cannot SELECT cross-org payments';
end $$;

-- Y5 — PM-A INSERTs payment with same-org FKs → allowed.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.payments
    (organization_id, charge_id, tenant_id, amount_paid, paid_at,
     method, recorded_by)
  values
    ('f1000000-0000-0000-0000-00000000000a',
     'f1f10000-0000-0000-0000-000000000001',
     'f1c00000-0000-0000-0000-000000000001',
     250.00, now(), 'cash',
     'f1a00000-0000-0000-0000-000000000010')
  returning id into new_id;
  assert new_id is not null, 'FAIL Y5: PM same-org INSERT returned no id';
  raise notice 'Y5 PASS: PM INSERT payment allowed';
end $$;

-- Y6 — MT-A INSERTs payment → rejected.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.payments
      (organization_id, charge_id, tenant_id, amount_paid, paid_at,
       method, recorded_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f10000-0000-0000-0000-000000000001',
       'f1c00000-0000-0000-0000-000000000001',
       100.00, now(), 'cash',
       'f1a00000-0000-0000-0000-000000000012');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Y6: MT inserted a payment';
  raise notice 'Y6 PASS: MT INSERT payment rejected';
end $$;

-- Y7 — PM-A INSERTs payment with cross-org charge_id → rejected (§8.1 pin).
-- (Need a charge in Org B for this; seed inline.)
reset role;
do $$
begin
  insert into public.rent_charges
    (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
  values
    ('f1f10000-0000-0000-0000-000000000002',
     'f1000000-0000-0000-0000-00000000000b',
     'f1f00000-0000-0000-0000-000000000002',
     'f1c00000-0000-0000-0000-000000000002',
     'f1e00000-0000-0000-0000-000000000002',
     2000.00, date '2026-04-01');
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.payments
      (organization_id, charge_id, tenant_id, amount_paid, paid_at,
       method, recorded_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f10000-0000-0000-0000-000000000002', -- Charge-B1 in Org B
       'f1c00000-0000-0000-0000-000000000001',
       100.00, now(), 'cash',
       'f1a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Y7: PM inserted payment with cross-org charge_id';
  raise notice 'Y7 PASS: cross-org charge_id rejected (§8.1 FK pin)';
end $$;

-- Y8 — PM-A INSERTs payment with cross-org tenant_id → rejected.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.payments
      (organization_id, charge_id, tenant_id, amount_paid, paid_at,
       method, recorded_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1f10000-0000-0000-0000-000000000001',
       'f1c00000-0000-0000-0000-000000000002', -- Ten-B1 in Org B
       100.00, now(), 'cash',
       'f1a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL Y8: PM inserted payment with cross-org tenant_id';
  raise notice 'Y8 PASS: cross-org tenant_id rejected (§8.1 FK pin)';
end $$;

-- ===========================================================================
-- ==================== J group — property_owners (9) ========================
-- ===========================================================================

-- J1 — PM-A (is_org_staff) reads property_owners → 1 (the seed grant).
do $$
declare n int;
begin
  select count(*) into n from public.property_owners;
  assert n = 1, format('FAIL J1: PM sees %s grants (expected 1)', n);
  raise notice 'J1 PASS: PM SELECT property_owners → 1 (staff branch)';
end $$;

-- J2 — INV-A reads property_owners → 1 (self-read branch user_id=auth.uid()).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000013"}';
do $$
declare n int;
begin
  select count(*) into n from public.property_owners;
  assert n = 1, format('FAIL J2: INVESTOR sees %s grants (expected 1)', n);
  raise notice 'J2 PASS: INVESTOR self-read property_owners → 1';
end $$;

-- J3 — PM-B (cross-org) reads Org A property_owners → 0.
set local request.jwt.claims = '{"sub":"f1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.property_owners
    where organization_id = 'f1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL J3: PM-B sees %s Org A grants (expected 0)', n);
  raise notice 'J3 PASS: PM-B cannot SELECT cross-org property_owners';
end $$;

-- J4 — PM-A INSERTs a property_owners grant (manager-level) → allowed.
-- (Use a second INVESTOR to avoid colliding with J2's seed grant's UNIQUE.)
reset role;
do $$
begin
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'f1a00000-0000-0000-0000-000000000023', 'authenticated', 'authenticated',
     'p5s14-inv2-a@rls.test', '', now(), '{}', '{}', now(), now());
  update public.users set organization_id = 'f1000000-0000-0000-0000-00000000000a'
    where id = 'f1a00000-0000-0000-0000-000000000023';
  insert into public.user_roles (user_id, organization_id, role) values
    ('f1a00000-0000-0000-0000-000000000023',
     'f1000000-0000-0000-0000-00000000000a', 'INVESTOR');
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.property_owners
    (organization_id, user_id, property_id, created_by)
  values
    ('f1000000-0000-0000-0000-00000000000a',
     'f1a00000-0000-0000-0000-000000000023',
     'f1d00000-0000-0000-0000-000000000001',
     'f1a00000-0000-0000-0000-000000000010')
  returning id into new_id;
  assert new_id is not null, 'FAIL J4: PM INSERT property_owners returned no id';
  raise notice 'J4 PASS: PM (is_org_manager) INSERT property_owners allowed';
end $$;

-- J5 — LA-A INSERTs property_owners → rejected (manager-only — NOT
-- can_write_tenants).
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000011"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.property_owners
      (organization_id, user_id, property_id, created_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1a00000-0000-0000-0000-000000000013',
       'f1d00000-0000-0000-0000-000000000001',
       'f1a00000-0000-0000-0000-000000000011');
  exception
    when insufficient_privilege or check_violation or unique_violation then blocked := true;
  end;
  assert blocked, 'FAIL J5: LA was able to INSERT property_owners';
  raise notice 'J5 PASS: LA INSERT property_owners rejected (manager-only)';
end $$;

-- J6 — MT-A INSERTs property_owners → rejected.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.property_owners
      (organization_id, user_id, property_id, created_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1a00000-0000-0000-0000-000000000013',
       'f1d00000-0000-0000-0000-000000000001',
       'f1a00000-0000-0000-0000-000000000012');
  exception
    when insufficient_privilege or check_violation or unique_violation then blocked := true;
  end;
  assert blocked, 'FAIL J6: MT was able to INSERT property_owners';
  raise notice 'J6 PASS: MT INSERT property_owners rejected';
end $$;

-- J7 — INV-A (INVESTOR) attempts to self-grant property_owners → rejected.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000013"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.property_owners
      (organization_id, user_id, property_id, created_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1a00000-0000-0000-0000-000000000013',
       'f1d00000-0000-0000-0000-000000000001',
       'f1a00000-0000-0000-0000-000000000013');
  exception
    when insufficient_privilege or check_violation or unique_violation then blocked := true;
  end;
  assert blocked, 'FAIL J7: INVESTOR self-granted property_owners';
  raise notice 'J7 PASS: INVESTOR cannot self-grant property_owners (manager-only write)';
end $$;

-- J8 — PM-A INSERTs property_owners with cross-org user_id (Org B user) → rejected.
set local request.jwt.claims = '{"sub":"f1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.property_owners
      (organization_id, user_id, property_id, created_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1b00000-0000-0000-0000-000000000010', -- PM-B in Org B
       'f1d00000-0000-0000-0000-000000000001',
       'f1a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL J8: PM inserted grant with cross-org user_id';
  raise notice 'J8 PASS: cross-org user_id rejected (§8.1 FK pin)';
end $$;

-- J9 — PM-A INSERTs property_owners with cross-org property_id → rejected.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.property_owners
      (organization_id, user_id, property_id, created_by)
    values
      ('f1000000-0000-0000-0000-00000000000a',
       'f1a00000-0000-0000-0000-000000000013',
       'f1d00000-0000-0000-0000-000000000002', -- Prop-B in Org B
       'f1a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL J9: PM inserted grant with cross-org property_id';
  raise notice 'J9 PASS: cross-org property_id rejected (§8.1 FK pin)';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 14 (Phase 5 entities) assertions PASSED'; end $$;

rollback;
