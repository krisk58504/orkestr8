-- ===========================================================================
-- rls_phase4_leasing.sql — Phase 4 Step 5 — verifies RLS for the three
-- new Phase 4 entity tables (leads / tours / applications) plus the
-- cross-cutting changes introduced by slice 9d
-- (tenants.source_application_id additive column +
-- create_lease_with_tenants RPC authority widening).
--
-- Source migrations covered (in order):
--   * 20260528000100_phase4_leads.sql            — leads table + 4 policies
--   * 20260528000200_phase4_leads_cross_org_pin  — leads insert/update
--                                                  cross-org FK pins
--                                                  (§8.1 closure, slice 9a
--                                                  follow-up dccbf45)
--   * 20260529000100_phase4_tours.sql            — tours table + 4 policies
--                                                  with cross-org FK pins
--                                                  built in (lead_id,
--                                                  unit_id, agent_id)
--   * 20260530000100_phase4_applications.sql     — applications table + 4
--                                                  policies with cross-org
--                                                  FK pins (unit_id,
--                                                  lead_id, decided_by)
--   * 20260531000100_phase4_lease_conversion.sql — tenants.source_application_id
--                                                  column + RPC authority
--                                                  widened from
--                                                  is_org_manager() to
--                                                  can_write_tenants()
--
-- Posture covered (per PHASE_4_PLAN.md §0.5 decision 7): NARROW read+write
-- on all three Phase 4 entity tables — both SELECT and WRITE gated on
-- can_write_tenants() (= management roles + LEASING_AGENT). MAINTENANCE_TECH
-- is is_org_staff but NOT can_write_tenants — reads AND writes deny.
--
-- Status transition enforcement (per §7 risk 4): NOT in RLS — the
-- application_status transition rules live in the updateApplication server
-- action only. A10 verifies this absence (a direct UPDATE that would
-- violate the transition map succeeds at the RLS layer).
--
-- Numbering (letter-keyed by group, no collision with prior suites):
--   K1..K8   leads      — cohort gating + cross-org FK pin rejections
--   T1..T9   tours      — cohort gating + 3 cross-org FK pin rejections
--   A1..A10  applications — cohort gating + 3 cross-org FK pin rejections
--                          + A10 RLS-does-not-enforce-status-transitions
--   X1..X4   cross-cutting RPC + source_application_id
--
-- Every check is a plpgsql ASSERT. A failed assertion aborts with SQLSTATE
-- P0004 and a 'FAIL <id>' message. Runs in one transaction and ROLLS BACK.
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase4_leasing.sql
-- ===========================================================================

begin;

-- ===========================================================================
-- Fixtures (seeded as the privileged migration role)
--   Orgs:        Org A (e1...000a), Org B (e1...000b)
--   Users:       PM-A, LA-A, MT-A (Org A) + PM-B (Org B)
--   Properties:  Prop-A in Org A, Prop-B in Org B
--   Units:       Unit-A in Org A, Unit-B in Org B
--   Tenants:     Ten-A in Org A (RPC X1/X2 payload + X4 column FK target)
--   Leads:       Lead-A in Org A, Lead-B in Org B (cross-org tour/app tests)
--   Tours:       Tour-A in Org A (SELECT cohort assertions)
--   Apps:        App-A in Org A, status='approved' (SELECT + X4 FK target)
-- ===========================================================================
do $$
begin
  -- orgs
  insert into public.organizations (id, name, slug) values
    ('e1000000-0000-0000-0000-00000000000a', 'P4 Suite Org A', 'rls-p4-a'),
    ('e1000000-0000-0000-0000-00000000000b', 'P4 Suite Org B', 'rls-p4-b');

  -- auth.users + public.users (the handle_new_user trigger creates the
  -- public row automatically)
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A staff: PROPERTY_MANAGER (can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'e1a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p4-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A staff: LEASING_AGENT (can_write_tenants — load-bearing for X1)
    ('00000000-0000-0000-0000-000000000000',
     'e1a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     'p4-la-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A staff: MAINTENANCE_TECH (is_org_staff, NOT can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'e1a00000-0000-0000-0000-000000000012', 'authenticated', 'authenticated',
     'p4-mt-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B staff: PROPERTY_MANAGER (cross-org tests)
    ('00000000-0000-0000-0000-000000000000',
     'e1b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p4-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'e1000000-0000-0000-0000-00000000000a'
    where id in ('e1a00000-0000-0000-0000-000000000010',
                 'e1a00000-0000-0000-0000-000000000011',
                 'e1a00000-0000-0000-0000-000000000012');
  update public.users set organization_id = 'e1000000-0000-0000-0000-00000000000b'
    where id = 'e1b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('e1a00000-0000-0000-0000-000000000010',
     'e1000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('e1a00000-0000-0000-0000-000000000011',
     'e1000000-0000-0000-0000-00000000000a', 'LEASING_AGENT'),
    ('e1a00000-0000-0000-0000-000000000012',
     'e1000000-0000-0000-0000-00000000000a', 'MAINTENANCE_TECH'),
    ('e1b00000-0000-0000-0000-000000000010',
     'e1000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- properties + units (one per org for cross-org FK pin tests)
  insert into public.properties (id, organization_id, name) values
    ('e1d00000-0000-0000-0000-000000000001',
     'e1000000-0000-0000-0000-00000000000a', 'P4 Property A'),
    ('e1d00000-0000-0000-0000-000000000002',
     'e1000000-0000-0000-0000-00000000000b', 'P4 Property B');

  insert into public.units (id, organization_id, property_id, unit_number) values
    ('e1e00000-0000-0000-0000-000000000001',
     'e1000000-0000-0000-0000-00000000000a',
     'e1d00000-0000-0000-0000-000000000001', '101'),
    ('e1e00000-0000-0000-0000-000000000002',
     'e1000000-0000-0000-0000-00000000000b',
     'e1d00000-0000-0000-0000-000000000002', '201');

  -- one Org A tenant (X1/X2 RPC payload; X4 source_application_id FK target)
  insert into public.tenants
    (id, organization_id, first_name, last_name, email)
  values
    ('e1c00000-0000-0000-0000-000000000001',
     'e1000000-0000-0000-0000-00000000000a', 'Ten', 'A',
     'p4-ten-a@rls.test');

  -- leads: one per org (Lead-B used as cross-org target for T7 / A8)
  insert into public.leads
    (id, organization_id, first_name, last_name, source)
  values
    ('e1f00000-0000-0000-0000-000000000001',
     'e1000000-0000-0000-0000-00000000000a', 'Lead', 'A', 'website'),
    ('e1f00000-0000-0000-0000-000000000002',
     'e1000000-0000-0000-0000-00000000000b', 'Lead', 'B', 'website');

  -- one Org A tour attached to Lead-A (SELECT assertions T1/T2)
  insert into public.tours
    (id, organization_id, lead_id, scheduled_at)
  values
    ('e1f00000-0000-0000-0000-000000000101',
     'e1000000-0000-0000-0000-00000000000a',
     'e1f00000-0000-0000-0000-000000000001',
     now() + interval '2 days');

  -- one Org A application, status='approved' (SELECT + X4 FK target)
  insert into public.applications
    (id, organization_id, unit_id, status,
     applicant_first_name, applicant_last_name, applicant_email)
  values
    ('e1f00000-0000-0000-0000-000000000201',
     'e1000000-0000-0000-0000-00000000000a',
     'e1e00000-0000-0000-0000-000000000001', 'approved',
     'App', 'A', 'p4-app-a@rls.test');

  raise notice 'Fixtures seeded: 2 orgs, 4 users, 2 props, 2 units, 1 tenant, 2 leads, 1 tour, 1 application';
end $$;

-- ===========================================================================
-- =============== K group — leads (8 assertions K1-K8) ======================
-- ===========================================================================
set local role authenticated;

-- K1 — PROPERTY_MANAGER (can_write_tenants) SELECTs leads → 1 (Lead-A).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.leads;
  assert n = 1, format('FAIL K1: PM sees %s leads (expected 1)', n);
  raise notice 'K1 PASS: PM SELECT leads → 1';
end $$;

-- K2 — LEASING_AGENT (can_write_tenants) SELECTs leads → 1 (parity).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000011"}';
do $$
declare n int;
begin
  select count(*) into n from public.leads;
  assert n = 1, format('FAIL K2: LA sees %s leads (expected 1)', n);
  raise notice 'K2 PASS: LA SELECT leads → 1 (can_write_tenants parity)';
end $$;

-- K3 — MAINTENANCE_TECH (is_org_staff, NOT can_write_tenants) SELECTs → 0.
-- THE narrow-read assertion — distinguishes Phase 4 from Phase 3 messages.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare n int;
begin
  select count(*) into n from public.leads;
  assert n = 0, format('FAIL K3: MT sees %s leads (expected 0 — narrow read)', n);
  raise notice 'K3 PASS: MT cannot SELECT leads (narrow-read per §0.5 decision 7)';
end $$;

-- K4 — PM-B in Org B SELECTs Org A leads → 0 (cross-org isolation).
set local request.jwt.claims =
  '{"sub":"e1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.leads
    where organization_id = 'e1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL K4: PM-B sees %s Org A leads (expected 0)', n);
  raise notice 'K4 PASS: PM-B cannot SELECT cross-org leads';
end $$;

-- K5 — PM-A INSERT lead with same-org desired_property_id + assigned_to → allowed.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.leads
    (organization_id, first_name, last_name, source,
     desired_property_id, assigned_to)
  values
    ('e1000000-0000-0000-0000-00000000000a', 'PosCtrl', 'Lead', 'website',
     'e1d00000-0000-0000-0000-000000000001',
     'e1a00000-0000-0000-0000-000000000011')
  returning id into new_id;
  assert new_id is not null, 'FAIL K5: PM same-org INSERT returned no id';
  raise notice 'K5 PASS: PM INSERT lead with same-org FKs allowed';
end $$;

-- K6 — MT INSERT lead → rejected (can_write_tenants gate on WITH CHECK).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.leads
      (organization_id, first_name, last_name, source)
    values
      ('e1000000-0000-0000-0000-00000000000a', 'MT', 'Attempt', 'website');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL K6: MT successfully inserted a lead';
  raise notice 'K6 PASS: MT INSERT lead rejected (can_write_tenants gate)';
end $$;

-- K7 — PM-A INSERT lead with cross-org desired_property_id → rejected
-- by the §8.1 FK pin from slice 9a follow-up dccbf45.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.leads
      (organization_id, first_name, last_name, source, desired_property_id)
    values
      ('e1000000-0000-0000-0000-00000000000a', 'XOrg', 'Prop', 'website',
       'e1d00000-0000-0000-0000-000000000002'); -- Prop-B in Org B
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL K7: PM inserted lead with cross-org desired_property_id';
  raise notice 'K7 PASS: cross-org desired_property_id rejected (§8.1 FK pin)';
end $$;

-- K8 — PM-A INSERT lead with cross-org assigned_to → rejected by the §8.1 FK pin.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.leads
      (organization_id, first_name, last_name, source, assigned_to)
    values
      ('e1000000-0000-0000-0000-00000000000a', 'XOrg', 'Assign', 'website',
       'e1b00000-0000-0000-0000-000000000010'); -- PM-B in Org B
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL K8: PM inserted lead with cross-org assigned_to';
  raise notice 'K8 PASS: cross-org assigned_to rejected (§8.1 FK pin)';
end $$;

-- ===========================================================================
-- =============== T group — tours (9 assertions T1-T9) ======================
-- ===========================================================================

-- T1 — PM SELECT tours → 1 (Tour-A).
do $$
declare n int;
begin
  select count(*) into n from public.tours;
  assert n = 1, format('FAIL T1: PM sees %s tours (expected 1)', n);
  raise notice 'T1 PASS: PM SELECT tours → 1';
end $$;

-- T2 — LA SELECT tours → 1.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000011"}';
do $$
declare n int;
begin
  select count(*) into n from public.tours;
  assert n = 1, format('FAIL T2: LA sees %s tours (expected 1)', n);
  raise notice 'T2 PASS: LA SELECT tours → 1 (can_write_tenants parity)';
end $$;

-- T3 — MT SELECT tours → 0 (narrow read).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare n int;
begin
  select count(*) into n from public.tours;
  assert n = 0, format('FAIL T3: MT sees %s tours (expected 0)', n);
  raise notice 'T3 PASS: MT cannot SELECT tours (narrow read)';
end $$;

-- T4 — PM-B SELECT Org A tours → 0.
set local request.jwt.claims =
  '{"sub":"e1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.tours
    where organization_id = 'e1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL T4: PM-B sees %s Org A tours (expected 0)', n);
  raise notice 'T4 PASS: PM-B cannot SELECT cross-org tours';
end $$;

-- T5 — PM-A INSERT tour with valid same-org lead+unit+agent → allowed.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.tours
    (organization_id, lead_id, unit_id, agent_id, scheduled_at)
  values
    ('e1000000-0000-0000-0000-00000000000a',
     'e1f00000-0000-0000-0000-000000000001', -- Lead-A (same org)
     'e1e00000-0000-0000-0000-000000000001', -- Unit-A (same org)
     'e1a00000-0000-0000-0000-000000000011', -- LA-A (same org)
     now() + interval '3 days')
  returning id into new_id;
  assert new_id is not null, 'FAIL T5: PM same-org INSERT returned no id';
  raise notice 'T5 PASS: PM INSERT tour with same-org FKs allowed';
end $$;

-- T6 — MT INSERT tour → rejected.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.tours
      (organization_id, lead_id, scheduled_at)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1f00000-0000-0000-0000-000000000001',
       now() + interval '4 days');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL T6: MT successfully inserted a tour';
  raise notice 'T6 PASS: MT INSERT tour rejected';
end $$;

-- T7 — PM-A INSERT tour with cross-org lead_id (Lead-B) → rejected by FK pin.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.tours
      (organization_id, lead_id, scheduled_at)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1f00000-0000-0000-0000-000000000002', -- Lead-B in Org B
       now() + interval '5 days');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL T7: PM inserted tour with cross-org lead_id';
  raise notice 'T7 PASS: cross-org lead_id rejected (tours FK pin)';
end $$;

-- T8 — PM-A INSERT tour with cross-org unit_id → rejected by FK pin.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.tours
      (organization_id, lead_id, unit_id, scheduled_at)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1f00000-0000-0000-0000-000000000001', -- Lead-A (same org)
       'e1e00000-0000-0000-0000-000000000002', -- Unit-B in Org B
       now() + interval '6 days');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL T8: PM inserted tour with cross-org unit_id';
  raise notice 'T8 PASS: cross-org unit_id rejected (tours FK pin)';
end $$;

-- T9 — PM-A INSERT tour with cross-org agent_id → rejected by FK pin.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.tours
      (organization_id, lead_id, agent_id, scheduled_at)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1f00000-0000-0000-0000-000000000001', -- Lead-A (same org)
       'e1b00000-0000-0000-0000-000000000010', -- PM-B in Org B
       now() + interval '7 days');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL T9: PM inserted tour with cross-org agent_id';
  raise notice 'T9 PASS: cross-org agent_id rejected (tours FK pin)';
end $$;

-- ===========================================================================
-- ============ A group — applications (10 assertions A1-A10) ================
-- ===========================================================================

-- A1 — PM SELECT applications → 1 (App-A).
do $$
declare n int;
begin
  select count(*) into n from public.applications;
  assert n = 1, format('FAIL A1: PM sees %s applications (expected 1)', n);
  raise notice 'A1 PASS: PM SELECT applications → 1';
end $$;

-- A2 — LA SELECT applications → 1.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000011"}';
do $$
declare n int;
begin
  select count(*) into n from public.applications;
  assert n = 1, format('FAIL A2: LA sees %s applications (expected 1)', n);
  raise notice 'A2 PASS: LA SELECT applications → 1 (can_write_tenants parity)';
end $$;

-- A3 — MT SELECT applications → 0 (narrow read).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare n int;
begin
  select count(*) into n from public.applications;
  assert n = 0, format('FAIL A3: MT sees %s applications (expected 0)', n);
  raise notice 'A3 PASS: MT cannot SELECT applications (narrow read)';
end $$;

-- A4 — PM-B SELECT Org A applications → 0.
set local request.jwt.claims =
  '{"sub":"e1b00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.applications
    where organization_id = 'e1000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL A4: PM-B sees %s Org A applications (expected 0)', n);
  raise notice 'A4 PASS: PM-B cannot SELECT cross-org applications';
end $$;

-- A5 — PM-A INSERT application with same-org unit_id (no lead, no decided_by) → allowed.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid;
begin
  insert into public.applications
    (organization_id, unit_id, status,
     applicant_first_name, applicant_last_name, applicant_email)
  values
    ('e1000000-0000-0000-0000-00000000000a',
     'e1e00000-0000-0000-0000-000000000001',
     'draft', 'PosCtrl', 'App', 'p4-poscontrol@rls.test')
  returning id into new_id;
  assert new_id is not null, 'FAIL A5: PM same-org INSERT returned no id';
  raise notice 'A5 PASS: PM INSERT application with same-org unit allowed';
end $$;

-- A6 — MT INSERT application → rejected.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.applications
      (organization_id, unit_id, status,
       applicant_first_name, applicant_last_name, applicant_email)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1e00000-0000-0000-0000-000000000001',
       'draft', 'MT', 'Attempt', 'mt-attempt@rls.test');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL A6: MT successfully inserted an application';
  raise notice 'A6 PASS: MT INSERT application rejected';
end $$;

-- A7 — PM-A INSERT application with cross-org unit_id → rejected by FK pin.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare blocked bool := false;
begin
  begin
    insert into public.applications
      (organization_id, unit_id, status,
       applicant_first_name, applicant_last_name, applicant_email)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1e00000-0000-0000-0000-000000000002', -- Unit-B in Org B
       'draft', 'XOrg', 'Unit', 'xorg-unit@rls.test');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL A7: PM inserted application with cross-org unit_id';
  raise notice 'A7 PASS: cross-org unit_id rejected (applications FK pin)';
end $$;

-- A8 — PM-A INSERT application with cross-org lead_id → rejected by FK pin.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.applications
      (organization_id, unit_id, lead_id, status,
       applicant_first_name, applicant_last_name, applicant_email)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1e00000-0000-0000-0000-000000000001', -- Unit-A (same org)
       'e1f00000-0000-0000-0000-000000000002', -- Lead-B in Org B
       'draft', 'XOrg', 'Lead', 'xorg-lead@rls.test');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL A8: PM inserted application with cross-org lead_id';
  raise notice 'A8 PASS: cross-org lead_id rejected (applications FK pin)';
end $$;

-- A9 — PM-A INSERT application with cross-org decided_by → rejected by FK pin.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.applications
      (organization_id, unit_id, decided_by, status,
       applicant_first_name, applicant_last_name, applicant_email)
    values
      ('e1000000-0000-0000-0000-00000000000a',
       'e1e00000-0000-0000-0000-000000000001', -- Unit-A (same org)
       'e1b00000-0000-0000-0000-000000000010', -- PM-B in Org B
       'draft', 'XOrg', 'Decider', 'xorg-decider@rls.test');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL A9: PM inserted application with cross-org decided_by';
  raise notice 'A9 PASS: cross-org decided_by rejected (applications FK pin)';
end $$;

-- A10 — PM-A UPDATE App-A.status directly from current value to 'approved'
-- (App-A is already 'approved' in the seed, so first set it back to 'draft'
-- via a privileged setup, then do the UPDATE under PM-A).
--
-- This assertion verifies that RLS does NOT enforce the application_status
-- transition map (draft → approved is disallowed by the app-layer
-- updateApplication action, but RLS has no RESTRICTIVE policy to block it
-- per §7 risk 4 + §3c.§8.2). The transition rule lives ONLY in the server
-- action layer.
--
-- A pass here means RLS is silent on the rule — exactly the design intent.
-- It does NOT certify the app-layer enforcement; that is unit-test scope.
reset role;
update public.applications
   set status = 'draft', submitted_at = null, decided_at = null,
       decided_by = null
 where id = 'e1f00000-0000-0000-0000-000000000201';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare v_status public.application_status;
begin
  update public.applications
     set status = 'approved'
   where id = 'e1f00000-0000-0000-0000-000000000201';
  -- Verify the UPDATE actually mutated the row (RLS admitted the write).
  select status into v_status from public.applications
    where id = 'e1f00000-0000-0000-0000-000000000201';
  assert v_status = 'approved',
    format('FAIL A10: status after direct UPDATE = %s (expected approved — RLS should not block)', v_status);
  raise notice 'A10 PASS: RLS does NOT enforce status transitions (draft→approved succeeded; app-layer is the only enforcement)';
end $$;

-- ===========================================================================
-- =========== X group — cross-cutting RPC + source_application_id ==========
-- ===========================================================================
-- X1, X2, X3 exercise create_lease_with_tenants per §0.5 decision 3
-- (authority widened from is_org_manager() to can_write_tenants()).
-- X4 exercises the additive tenants.source_application_id column.

-- X1 — LA-A calls create_lease_with_tenants → succeeds; lease lands in Org A.
-- The load-bearing widening test: pre-slice-9d this would have raised 42501.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000011"}';
do $$
declare v_lease_id uuid; v_lease_org uuid;
begin
  v_lease_id := public.create_lease_with_tenants(
    p_organization_id := 'e1000000-0000-0000-0000-00000000000a',
    p_unit_id         := 'e1e00000-0000-0000-0000-000000000001',
    p_start_date      := current_date,
    p_end_date        := null,
    p_monthly_rent    := 1500.00,
    p_status          := 'upcoming',
    p_notes           := null,
    p_tenant_ids      := array['e1c00000-0000-0000-0000-000000000001']::uuid[]
  );
  assert v_lease_id is not null,
    'FAIL X1a: LA RPC call returned NULL lease_id';
  -- Two-step verification: lease landed in the correct org.
  select organization_id into v_lease_org
    from public.leases where id = v_lease_id;
  assert v_lease_org = 'e1000000-0000-0000-0000-00000000000a',
    format('FAIL X1b: lease landed in org %s (expected Org A)', v_lease_org);
  raise notice 'X1 PASS: LA can call create_lease_with_tenants (widened authority) — lease lands in Org A';
end $$;

-- X2 — PM-A calls the RPC → succeeds (manager regression — widening didn't
-- accidentally lock out managers).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare v_lease_id uuid; v_lease_org uuid;
begin
  v_lease_id := public.create_lease_with_tenants(
    p_organization_id := 'e1000000-0000-0000-0000-00000000000a',
    p_unit_id         := 'e1e00000-0000-0000-0000-000000000001',
    p_start_date      := current_date,
    p_end_date        := null,
    p_monthly_rent    := 1750.00,
    p_status          := 'upcoming',
    p_notes           := null,
    p_tenant_ids      := array[]::uuid[]
  );
  assert v_lease_id is not null,
    'FAIL X2a: PM RPC call returned NULL lease_id';
  select organization_id into v_lease_org
    from public.leases where id = v_lease_id;
  assert v_lease_org = 'e1000000-0000-0000-0000-00000000000a',
    format('FAIL X2b: lease landed in org %s (expected Org A)', v_lease_org);
  raise notice 'X2 PASS: PM can still call create_lease_with_tenants (regression — manager not locked out)';
end $$;

-- X3 — MT-A calls the RPC → raises 42501 from the explicit guard in the
-- function body (can_write_tenants() returns false for MAINTENANCE_TECH).
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000012"}';
do $$
declare blocked bool := false; v_dummy uuid;
begin
  begin
    v_dummy := public.create_lease_with_tenants(
      p_organization_id := 'e1000000-0000-0000-0000-00000000000a',
      p_unit_id         := 'e1e00000-0000-0000-0000-000000000001',
      p_start_date      := current_date,
      p_end_date        := null,
      p_monthly_rent    := 1000.00,
      p_status          := 'upcoming',
      p_notes           := null,
      p_tenant_ids      := array[]::uuid[]
    );
  exception
    when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'FAIL X3: MT successfully called create_lease_with_tenants';
  raise notice 'X3 PASS: MT cannot call create_lease_with_tenants (widening was to can_write_tenants, not is_org_staff)';
end $$;

-- X4 — PM-A INSERT a tenant with source_application_id pointing at App-A.
-- The additive column from slice 9d migration accepts the FK insert.
set local request.jwt.claims =
  '{"sub":"e1a00000-0000-0000-0000-000000000010"}';
do $$
declare new_id uuid; v_src uuid;
begin
  insert into public.tenants
    (organization_id, first_name, last_name, source_application_id)
  values
    ('e1000000-0000-0000-0000-00000000000a', 'Conv', 'Tenant',
     'e1f00000-0000-0000-0000-000000000201')
  returning id into new_id;
  assert new_id is not null, 'FAIL X4a: tenant INSERT returned no id';
  select source_application_id into v_src
    from public.tenants where id = new_id;
  assert v_src = 'e1f00000-0000-0000-0000-000000000201',
    format('FAIL X4b: source_application_id = %s (expected App-A id)', v_src);
  raise notice 'X4 PASS: tenants.source_application_id additive column accepts valid FK';
end $$;

reset role;

do $$ begin raise notice 'ALL Phase 4 leasing RLS assertions PASSED'; end $$;

rollback;
