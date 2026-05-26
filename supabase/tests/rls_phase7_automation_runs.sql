-- ===========================================================================
-- rls_phase7_automation_runs.sql — Phase 7 Suite 20 — automation_runs RLS.
--
-- Source migration:
--   * 20260609000100_phase7_automation_substrate.sql
--     - automation_runs table + 1 policy (SELECT manager-only)
--     - no client INSERT/UPDATE/DELETE policy (service-role only)
--
-- Posture per docs/PHASE_7_SLICE_1_AUDIT.md §6.2:
--   * SELECT manager-only — matches the audit_logs / ai_logs /
--     automation_logs peer pattern (migration 20260518000700_rls.sql:268).
--     Run history may contain operational details (recipient emails,
--     error messages); LEASING_AGENT staff don't get visibility.
--   * No client INSERT — the runner is service-role; never writes from
--     a session context.
--
-- Numbering:
--   AR1       PM-A (manager) SELECT own-org → succeeds
--   AR2       PM-A SELECT cross-org → 0 rows
--   AR3       LEASING_AGENT (staff but not manager) SELECT → 0 rows
--   AR4       TENANT SELECT → 0 rows
--   AR5       PM-A INSERT → blocked (no client INSERT policy)
--   AR6       PM-A UPDATE → blocked (no client UPDATE policy)
--
-- UUID prefix: b2 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase7_automation_runs.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  -- 2 orgs.
  insert into public.organizations (id, name, slug) values
    ('b2000000-0000-0000-0000-00000000000a', 'P7-S20 Org A', 'rls-p7s20-a'),
    ('b2000000-0000-0000-0000-00000000000b', 'P7-S20 Org B', 'rls-p7s20-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p7s20-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     'p7s20-la-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p7s20-t1-a@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b2000000-0000-0000-0000-00000000000a'
    where id in ('b2a00000-0000-0000-0000-000000000010',
                 'b2a00000-0000-0000-0000-000000000011',
                 'b2a00000-0000-0000-0000-000000000014');

  insert into public.user_roles (user_id, organization_id, role) values
    ('b2a00000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b2a00000-0000-0000-0000-000000000011', 'b2000000-0000-0000-0000-00000000000a', 'LEASING_AGENT'),
    ('b2a00000-0000-0000-0000-000000000014', 'b2000000-0000-0000-0000-00000000000a', 'TENANT');

  -- Seed automation rows in both orgs.
  insert into public.automations
    (id, organization_id, automation_type, name, enabled, schedule_cron)
  values
    ('b2f00000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-00000000000a',
     'vendor_doc_expiry', 'Org A vendor expiry', true, '0 6 * * *'),
    ('b2f00000-0000-0000-0000-000000000002',
     'b2000000-0000-0000-0000-00000000000b',
     'vendor_doc_expiry', 'Org B vendor expiry', true, '0 6 * * *');

  -- Seed automation_run rows in both orgs (privileged insert; the
  -- runner does this in production via service-role).
  insert into public.automation_runs
    (id, organization_id, automation_id, status, idempotency_key, result)
  values
    ('b2c00000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-00000000000a',
     'b2f00000-0000-0000-0000-000000000001',
     'ok', 'vendor_doc_expiry:fixture:30',
     '{"fixture": true}'::jsonb),
    ('b2c00000-0000-0000-0000-000000000002',
     'b2000000-0000-0000-0000-00000000000b',
     'b2f00000-0000-0000-0000-000000000002',
     'ok', 'vendor_doc_expiry:fixture:30',
     '{"fixture": true}'::jsonb);
end $$;

-- ============ Switch to PM-A (Org A, PROPERTY_MANAGER) =====================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

-- AR1 — PM-A SELECT own-org automation_runs → returns rows.
do $$
declare n int;
begin
  select count(*) into n from public.automation_runs
    where organization_id = 'b2000000-0000-0000-0000-00000000000a';
  assert n >= 1, format('FAIL AR1: PM-A sees %s own-org runs (expected >= 1)', n);
  raise notice 'AR1 PASS: PM-A SELECT own-org automation_runs → % rows', n;
end $$;

-- AR2 — PM-A SELECT cross-org automation_runs → 0 rows.
do $$
declare n int;
begin
  select count(*) into n from public.automation_runs
    where organization_id = 'b2000000-0000-0000-0000-00000000000b';
  assert n = 0, format('FAIL AR2: PM-A sees %s cross-org runs (expected 0)', n);
  raise notice 'AR2 PASS: PM-A SELECT cross-org automation_runs → 0 rows';
end $$;

-- ============ Switch to LEASING_AGENT (Org A, staff but not manager) =======
set local request.jwt.claims = '{"sub":"b2a00000-0000-0000-0000-000000000011"}';

-- AR3 — LEASING_AGENT SELECT → 0 rows (manager-only).
do $$
declare n int;
begin
  select count(*) into n from public.automation_runs;
  assert n = 0, format('FAIL AR3: LEASING_AGENT sees %s runs (expected 0)', n);
  raise notice 'AR3 PASS: LEASING_AGENT SELECT automation_runs → 0 rows (manager-only)';
end $$;

-- ============ Switch to TENANT (Org A) =====================================
set local request.jwt.claims = '{"sub":"b2a00000-0000-0000-0000-000000000014"}';

-- AR4 — TENANT SELECT → 0 rows.
do $$
declare n int;
begin
  select count(*) into n from public.automation_runs;
  assert n = 0, format('FAIL AR4: TENANT sees %s runs (expected 0)', n);
  raise notice 'AR4 PASS: TENANT SELECT automation_runs → 0 rows';
end $$;

-- ============ Switch back to PM-A for write-attempt tests ==================
set local request.jwt.claims = '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

-- AR5 — PM-A INSERT → blocked (no client INSERT policy at all).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.automation_runs
      (id, organization_id, automation_id, status, idempotency_key)
    values
      ('b2c00000-0000-0000-0000-000000000099',
       'b2000000-0000-0000-0000-00000000000a',
       'b2f00000-0000-0000-0000-000000000001',
       'ok', 'rogue_pm_insert');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AR5: PM-A client INSERT into automation_runs succeeded';
  raise notice 'AR5 PASS: PM-A client INSERT into automation_runs denied (no policy)';
end $$;

-- AR6 — PM-A UPDATE → blocked (no client UPDATE policy).
do $$
declare blocked bool := false;
declare row_count int;
begin
  begin
    update public.automation_runs set status = 'failed'
     where id = 'b2c00000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then blocked := false; else blocked := true; end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AR6: PM-A client UPDATE on automation_runs succeeded';
  raise notice 'AR6 PASS: PM-A client UPDATE on automation_runs denied (no policy)';
end $$;

rollback;
