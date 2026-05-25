-- ===========================================================================
-- rls_phase6_report_insights.sql — Phase 6 Suite 18 — verifies the
-- report_insights table RLS posture introduced in slice 11c.
--
-- Source migration:
--   * 20260606000100_phase6_report_insights.sql
--     - report_insights table (org-scoped; 5 report types)
--     - SELECT policy: staff org-self all rows; INVESTOR own generations only
--     - INSERT policy: staff org-self; INVESTOR with property_owners row
--     - No UPDATE/DELETE policies (immutable from client)
--
-- Posture per PHASE_6_PLAN.md / slice 11c audit decision J + J3 sub-decision:
--   * Generator-restricted INVESTOR access (J3): an INVESTOR sees only
--     rows they generated themselves; staff sees all org rows.
--   * Server-action layer additionally enforces "scope_filter.propertyIds
--     ⊆ caller's visible properties" — RLS does NOT enforce that subset;
--     it's a defense-in-depth check in the action.
--   * Immutable from client (no UPDATE/DELETE policies).
--
-- Numbering: RI1..RI12 — report_insights RLS shape coverage.
--
-- UUID prefix: a3 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_report_insights.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('a3000000-0000-0000-0000-00000000000a', 'P6-S18 Org A', 'rls-p6s18-a'),
    ('a3000000-0000-0000-0000-00000000000b', 'P6-S18 Org B', 'rls-p6s18-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A: PM (staff)
    ('00000000-0000-0000-0000-000000000000',
     'a3a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p6s18-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: INVESTOR 1 (owns Prop-A)
    ('00000000-0000-0000-0000-000000000000',
     'a3a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     'p6s18-inv1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A: INVESTOR 2 (owns Prop-A too — both can see same property)
    ('00000000-0000-0000-0000-000000000000',
     'a3a00000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
     'p6s18-inv2-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B: PM (cross-org adversary)
    ('00000000-0000-0000-0000-000000000000',
     'a3b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p6s18-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'a3000000-0000-0000-0000-00000000000a'
    where id in ('a3a00000-0000-0000-0000-000000000010',
                 'a3a00000-0000-0000-0000-000000000020',
                 'a3a00000-0000-0000-0000-000000000021');
  update public.users set organization_id = 'a3000000-0000-0000-0000-00000000000b'
    where id = 'a3b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('a3a00000-0000-0000-0000-000000000010', 'a3000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('a3a00000-0000-0000-0000-000000000020', 'a3000000-0000-0000-0000-00000000000a', 'INVESTOR'),
    ('a3a00000-0000-0000-0000-000000000021', 'a3000000-0000-0000-0000-00000000000a', 'INVESTOR'),
    ('a3b00000-0000-0000-0000-000000000010', 'a3000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Property for INVESTORs to own.
  insert into public.properties (id, organization_id, name, address_line1, city, state, postal_code, country)
    values ('a3d00000-0000-0000-0000-000000000001',
            'a3000000-0000-0000-0000-00000000000a',
            'Prop-A1', '1 Main', 'Anytown', 'CA', '90001', 'US');

  -- Both INVESTORs own Prop-A.
  insert into public.property_owners (property_id, user_id, organization_id) values
    ('a3d00000-0000-0000-0000-000000000001',
     'a3a00000-0000-0000-0000-000000000020',
     'a3000000-0000-0000-0000-00000000000a'),
    ('a3d00000-0000-0000-0000-000000000001',
     'a3a00000-0000-0000-0000-000000000021',
     'a3000000-0000-0000-0000-00000000000a');

  -- Seed insights:
  -- Row 1: Org A staff-generated, rent_roll, org-wide scope
  insert into public.report_insights
    (id, organization_id, report_type, scope_filter, insight, generated_by, generated_at)
  values
    ('a3f10000-0000-0000-0000-000000000001',
     'a3000000-0000-0000-0000-00000000000a',
     'rent_roll',
     '{}'::jsonb,
     jsonb_build_object('headline','Staff-org-wide'),
     'a3a00000-0000-0000-0000-000000000010',
     now() - interval '5 minutes');

  -- Row 2: Org A INVESTOR 1 own generation, occupancy, scoped to Prop-A
  insert into public.report_insights
    (id, organization_id, report_type, scope_filter, insight, generated_by, generated_at)
  values
    ('a3f10000-0000-0000-0000-000000000002',
     'a3000000-0000-0000-0000-00000000000a',
     'occupancy',
     jsonb_build_object('propertyIds', jsonb_build_array('a3d00000-0000-0000-0000-000000000001')),
     jsonb_build_object('headline','Inv1-own'),
     'a3a00000-0000-0000-0000-000000000020',
     now() - interval '3 minutes');

  -- Row 3: Org A INVESTOR 2 own generation, occupancy, scoped to Prop-A
  insert into public.report_insights
    (id, organization_id, report_type, scope_filter, insight, generated_by, generated_at)
  values
    ('a3f10000-0000-0000-0000-000000000003',
     'a3000000-0000-0000-0000-00000000000a',
     'occupancy',
     jsonb_build_object('propertyIds', jsonb_build_array('a3d00000-0000-0000-0000-000000000001')),
     jsonb_build_object('headline','Inv2-own'),
     'a3a00000-0000-0000-0000-000000000021',
     now() - interval '1 minute');

  -- Row 4: Org B staff-generated, rent_roll, org-wide
  insert into public.report_insights
    (id, organization_id, report_type, scope_filter, insight, generated_by, generated_at)
  values
    ('a3f10000-0000-0000-0000-000000000004',
     'a3000000-0000-0000-0000-00000000000b',
     'rent_roll',
     '{}'::jsonb,
     jsonb_build_object('headline','Org-B-staff'),
     'a3b00000-0000-0000-0000-000000000010',
     now() - interval '4 minutes');
end $$;

-- ===========================================================================
-- ====================== RI group — report_insights RLS (12) ================
-- ===========================================================================

set local role authenticated;

-- RI1 — Cross-org SELECT isolation: Org A staff cannot see Org B insights.
set local request.jwt.claims = '{"sub":"a3a00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n from public.report_insights
   where organization_id = 'a3000000-0000-0000-0000-00000000000b';
  assert n = 0, format('FAIL RI1: Org A PM sees %s Org B insights (expected 0)', n);
  raise notice 'RI1 PASS: cross-org SELECT isolated';
end $$;

-- RI2 — Cross-org INSERT blocked.
do $$
declare blocked bool := false;
begin
  begin
    insert into public.report_insights
      (organization_id, report_type, scope_filter, insight, generated_by)
    values
      ('a3000000-0000-0000-0000-00000000000b',
       'rent_roll', '{}'::jsonb, '{"headline":"injected"}'::jsonb,
       'a3a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL RI2: Org A PM inserted into Org B';
  raise notice 'RI2 PASS: cross-org INSERT blocked';
end $$;

-- RI3 — Staff in Org A — SELECT all 3 Org A rows (staff branch unrestricted).
do $$
declare n int;
begin
  select count(*) into n from public.report_insights
   where organization_id = 'a3000000-0000-0000-0000-00000000000a';
  assert n = 3, format('FAIL RI3: Org A PM sees %s rows (expected 3 = all org rows)', n);
  raise notice 'RI3 PASS: staff sees all 3 Org A insights';
end $$;

-- RI4 — INVESTOR 1 — SELECT own generations (succeeds; sees Row 2 only).
set local request.jwt.claims = '{"sub":"a3a00000-0000-0000-0000-000000000020"}';
do $$
declare n int;
declare own_id text;
begin
  select count(*) into n from public.report_insights
   where organization_id = 'a3000000-0000-0000-0000-00000000000a';
  assert n = 1, format('FAIL RI4: INVESTOR 1 sees %s rows (expected 1 — own only)', n);
  select id::text into own_id from public.report_insights
   where organization_id = 'a3000000-0000-0000-0000-00000000000a' limit 1;
  assert own_id = 'a3f10000-0000-0000-0000-000000000002',
    format('FAIL RI4: INVESTOR 1 sees row %s (expected Row 2)', own_id);
  raise notice 'RI4 PASS: INVESTOR 1 sees own generation only';
end $$;

-- RI5 — INVESTOR 1 does NOT see other INVESTOR's rows (J3 enforcement).
do $$
declare seen_other int;
begin
  select count(*) into seen_other from public.report_insights
   where id = 'a3f10000-0000-0000-0000-000000000003'; -- INVESTOR 2's row
  assert seen_other = 0,
    format('FAIL RI5: INVESTOR 1 saw INVESTOR 2 row (count=%s)', seen_other);
  raise notice 'RI5 PASS: INVESTOR 1 cannot see INVESTOR 2 rows';
end $$;

-- RI6 — INVESTOR 1 does NOT see staff-generated rows (J3 strict).
do $$
declare seen_staff int;
begin
  select count(*) into seen_staff from public.report_insights
   where id = 'a3f10000-0000-0000-0000-000000000001'; -- staff row
  assert seen_staff = 0,
    format('FAIL RI6: INVESTOR 1 saw staff row (count=%s)', seen_staff);
  raise notice 'RI6 PASS: INVESTOR 1 cannot see staff-generated rows';
end $$;

-- RI7 — Staff INSERT with no scope (org-wide) succeeds.
set local request.jwt.claims = '{"sub":"a3a00000-0000-0000-0000-000000000010"}';
do $$
begin
  insert into public.report_insights
    (organization_id, report_type, scope_filter, insight, generated_by)
  values
    ('a3000000-0000-0000-0000-00000000000a',
     'maintenance', '{}'::jsonb,
     '{"headline":"staff-new-org-wide"}'::jsonb,
     'a3a00000-0000-0000-0000-000000000010');
  raise notice 'RI7 PASS: staff INSERT with empty scope succeeded';
end $$;

-- RI8 — Staff INSERT with valid scope_filter succeeds.
do $$
begin
  insert into public.report_insights
    (organization_id, report_type, scope_filter, insight, generated_by)
  values
    ('a3000000-0000-0000-0000-00000000000a',
     'leasing_funnel',
     jsonb_build_object('propertyIds', jsonb_build_array('a3d00000-0000-0000-0000-000000000001')),
     '{"headline":"staff-new-scoped"}'::jsonb,
     'a3a00000-0000-0000-0000-000000000010');
  raise notice 'RI8 PASS: staff INSERT with scope_filter succeeded';
end $$;

-- RI9 — INVESTOR INSERT for their own properties succeeds (RLS allows;
-- server action additionally enforces subset).
set local request.jwt.claims = '{"sub":"a3a00000-0000-0000-0000-000000000020"}';
do $$
begin
  insert into public.report_insights
    (organization_id, report_type, scope_filter, insight, generated_by)
  values
    ('a3000000-0000-0000-0000-00000000000a',
     'occupancy',
     jsonb_build_object('propertyIds', jsonb_build_array('a3d00000-0000-0000-0000-000000000001')),
     '{"headline":"inv1-new-own"}'::jsonb,
     'a3a00000-0000-0000-0000-000000000020');
  raise notice 'RI9 PASS: INVESTOR INSERT for owned property succeeded';
end $$;

-- RI10 — INVESTOR INSERT with mismatched generated_by (claiming to be
-- another user) is rejected by the WITH CHECK (generated_by = auth.uid()).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.report_insights
      (organization_id, report_type, scope_filter, insight, generated_by)
    values
      ('a3000000-0000-0000-0000-00000000000a',
       'occupancy', '{}'::jsonb,
       '{"headline":"identity-spoof"}'::jsonb,
       'a3a00000-0000-0000-0000-000000000010'); -- claims to be staff
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL RI10: INVESTOR spoofed generated_by';
  raise notice 'RI10 PASS: generated_by must match auth.uid()';
end $$;

-- RI11 — report_type CHECK constraint rejects invalid types.
reset role;
do $$
declare blocked bool := false;
begin
  begin
    insert into public.report_insights
      (organization_id, report_type, scope_filter, insight, generated_by)
    values
      ('a3000000-0000-0000-0000-00000000000a',
       'made_up_report', '{}'::jsonb, '{"headline":"x"}'::jsonb,
       'a3a00000-0000-0000-0000-000000000010');
  exception
    when check_violation then blocked := true;
  end;
  assert blocked, 'FAIL RI11: invalid report_type accepted';
  raise notice 'RI11 PASS: report_type CHECK rejects invalid types';
end $$;

-- RI12 — UPDATE/DELETE blocked entirely (no policies → no access).
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3a00000-0000-0000-0000-000000000010"}';
do $$
declare update_blocked bool := false;
declare delete_blocked bool := false;
declare row_count int;
begin
  begin
    update public.report_insights
       set insight = '{"headline":"tampered"}'::jsonb
     where id = 'a3f10000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then update_blocked := false; else update_blocked := true; end if;
  exception
    when insufficient_privilege then update_blocked := true;
  end;
  begin
    delete from public.report_insights
     where id = 'a3f10000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then delete_blocked := false; else delete_blocked := true; end if;
  exception
    when insufficient_privilege then delete_blocked := true;
  end;
  assert update_blocked and delete_blocked,
    format('FAIL RI12: update_blocked=%s delete_blocked=%s', update_blocked, delete_blocked);
  raise notice 'RI12 PASS: UPDATE + DELETE both blocked (no policy = no access)';
end $$;

rollback;
