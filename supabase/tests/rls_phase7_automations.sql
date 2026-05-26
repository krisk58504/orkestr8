-- ===========================================================================
-- rls_phase7_automations.sql — Phase 7 Suite 19 — automations RLS coverage.
--
-- Source migration:
--   * 20260609000100_phase7_automation_substrate.sql
--     - automations table + 3 policies (SELECT staff, WRITE manager,
--       RESTRICTIVE no_ai_writes)
--
-- Posture per docs/PHASE_7_SLICE_1_AUDIT.md §6.1:
--   * automations_select — org-scoped, staff-read
--   * automations_write — org-scoped, manager-only (matches Phase 5
--     properties/buildings/units pattern)
--   * automations_no_ai_writes — RESTRICTIVE; denies all ops when
--     is_ai_actor() returns true. No-op today since the helper is
--     unflipped; structural defense-in-depth for future AI-decided
--     slices (Tier 4) per audit §4.3 never-autonomous list.
--
-- Numbering:
--   AU1..AU2  PERMISSIVE SELECT — org isolation
--   AU3..AU5  PERMISSIVE WRITE — manager-only + cross-org blocked
--   AU6       Non-staff SELECT denied
--   AU7..AU9  RESTRICTIVE no_ai_writes block matrix (INSERT/UPDATE/DELETE)
--   AU10      PERMISSIVE regression — PM SELECT without flag works
--
-- UUID prefix: b1 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase7_automations.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  -- 2 orgs (cross-org isolation tests).
  insert into public.organizations (id, name, slug) values
    ('b1000000-0000-0000-0000-00000000000a', 'P7-S19 Org A', 'rls-p7s19-a'),
    ('b1000000-0000-0000-0000-00000000000b', 'P7-S19 Org B', 'rls-p7s19-b');

  -- auth.users for PM-A (Org A), LEASING_AGENT-A (Org A), TENANT-A (Org A).
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'b1a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p7s19-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b1a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     'p7s19-la-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b1a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p7s19-t1-a@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b1000000-0000-0000-0000-00000000000a'
    where id in ('b1a00000-0000-0000-0000-000000000010',
                 'b1a00000-0000-0000-0000-000000000011',
                 'b1a00000-0000-0000-0000-000000000014');

  insert into public.user_roles (user_id, organization_id, role) values
    ('b1a00000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b1a00000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-00000000000a', 'LEASING_AGENT'),
    ('b1a00000-0000-0000-0000-000000000014', 'b1000000-0000-0000-0000-00000000000a', 'TENANT');

  -- Seed automation rows in both orgs.
  insert into public.automations
    (id, organization_id, automation_type, name, enabled, schedule_cron)
  values
    ('b1f00000-0000-0000-0000-000000000001',
     'b1000000-0000-0000-0000-00000000000a',
     'vendor_doc_expiry', 'Org A vendor expiry', true, '0 6 * * *'),
    ('b1f00000-0000-0000-0000-000000000002',
     'b1000000-0000-0000-0000-00000000000b',
     'vendor_doc_expiry', 'Org B vendor expiry', true, '0 6 * * *');
end $$;

-- ============ Switch to PM-A (Org A, PROPERTY_MANAGER) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1a00000-0000-0000-0000-000000000010"}';

-- AU1 — PM-A SELECT own-org automations → at least 1 row.
do $$
declare n int;
begin
  select count(*) into n from public.automations
    where organization_id = 'b1000000-0000-0000-0000-00000000000a';
  assert n >= 1, format('FAIL AU1: PM-A sees %s own-org automations (expected >= 1)', n);
  raise notice 'AU1 PASS: PM-A SELECT own-org automations → % rows', n;
end $$;

-- AU2 — PM-A SELECT cross-org automations → 0 rows (org isolation).
do $$
declare n int;
begin
  select count(*) into n from public.automations
    where organization_id = 'b1000000-0000-0000-0000-00000000000b';
  assert n = 0, format('FAIL AU2: PM-A sees %s cross-org automations (expected 0)', n);
  raise notice 'AU2 PASS: PM-A SELECT cross-org automations → 0 rows (RLS isolation)';
end $$;

-- AU3 — PM-A INSERT into own-org → succeeds.
do $$
begin
  insert into public.automations
    (id, organization_id, automation_type, name, enabled)
  values
    ('b1f00000-0000-0000-0000-000000000003',
     'b1000000-0000-0000-0000-00000000000a',
     'vendor_doc_expiry_v2', 'PM-A insert test', false);
  raise notice 'AU3 PASS: PM-A INSERT own-org automation succeeded';
end $$;

-- AU4 — PM-A INSERT into cross-org → blocked (WITH CHECK).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.automations
      (id, organization_id, automation_type, name, enabled)
    values
      ('b1f00000-0000-0000-0000-000000000004',
       'b1000000-0000-0000-0000-00000000000b',
       'vendor_doc_expiry_v3', 'PM-A cross-org', false);
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AU4: PM-A INSERT into cross-org succeeded';
  raise notice 'AU4 PASS: PM-A INSERT cross-org automation denied (WITH CHECK)';
end $$;

-- ============ Switch to LEASING_AGENT-A (Org A) ============================
set local request.jwt.claims = '{"sub":"b1a00000-0000-0000-0000-000000000011"}';

-- AU5 — LEASING_AGENT INSERT → blocked (not manager).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.automations
      (id, organization_id, automation_type, name, enabled)
    values
      ('b1f00000-0000-0000-0000-000000000005',
       'b1000000-0000-0000-0000-00000000000a',
       'vendor_doc_expiry_v4', 'LA insert attempt', false);
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AU5: LEASING_AGENT INSERT succeeded';
  raise notice 'AU5 PASS: LEASING_AGENT INSERT into automations denied (manager-only)';
end $$;

-- ============ Switch to TENANT-A (Org A) ===================================
set local request.jwt.claims = '{"sub":"b1a00000-0000-0000-0000-000000000014"}';

-- AU6 — TENANT SELECT → 0 rows (not staff).
do $$
declare n int;
begin
  select count(*) into n from public.automations;
  assert n = 0, format('FAIL AU6: TENANT sees %s automations (expected 0)', n);
  raise notice 'AU6 PASS: TENANT SELECT automations → 0 rows (staff gate)';
end $$;

-- ============ Switch back to PM-A for RESTRICTIVE tests ====================
set local request.jwt.claims = '{"sub":"b1a00000-0000-0000-0000-000000000010"}';

-- AU7 — PM-A INSERT WITH app.is_ai_actor=true → blocked (RESTRICTIVE).
do $$
declare blocked bool := false;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    insert into public.automations
      (id, organization_id, automation_type, name, enabled)
    values
      ('b1f00000-0000-0000-0000-000000000006',
       'b1000000-0000-0000-0000-00000000000a',
       'vendor_doc_expiry_v5', 'AI-flagged insert', false);
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AU7: AI-flagged INSERT into automations succeeded';
  raise notice 'AU7 PASS: AI-flagged INSERT into automations denied (RESTRICTIVE)';
end $$;

-- AU8 — PM-A UPDATE WITH is_ai_actor=true → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    update public.automations set name = 'mutated by ai'
     where id = 'b1f00000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then blocked := false; else blocked := true; end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AU8: AI-flagged UPDATE on automations succeeded';
  raise notice 'AU8 PASS: AI-flagged UPDATE on automations denied (RESTRICTIVE)';
end $$;

-- AU9 — PM-A DELETE WITH is_ai_actor=true → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    delete from public.automations
     where id = 'b1f00000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then blocked := false; else blocked := true; end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AU9: AI-flagged DELETE on automations succeeded';
  raise notice 'AU9 PASS: AI-flagged DELETE on automations denied (RESTRICTIVE)';
end $$;

-- AU10 — Regression: PM SELECT without flag → still sees rows.
do $$
declare n int;
begin
  perform set_config('app.is_ai_actor', 'false', true);
  select count(*) into n from public.automations;
  assert n >= 2, format('FAIL AU10: PM sees %s automations (expected >= 2)', n);
  raise notice 'AU10 PASS: PM SELECT automations → % rows (PERMISSIVE intact)', n;
end $$;

rollback;
