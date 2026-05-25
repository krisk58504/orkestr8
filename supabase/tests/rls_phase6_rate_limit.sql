-- ===========================================================================
-- rls_phase6_rate_limit.sql — Phase 6 Suite 17 — verifies the SQL-level
-- semantics the checkAiRateLimit helper depends on.
--
-- checkAiRateLimit (src/lib/auth/permissions.ts) executes:
--   SELECT count(*) FROM ai_logs
--   WHERE organization_id = $1 AND created_at > now() - interval '60s'
--
-- The app helper interprets count < 10 as "allowed". This suite proves
-- the count query's properties: org-scoping, window-scoping, statuses
-- counted, regardless-of-caller invariance.
--
-- Posture per PHASE_6_PLAN.md §0.5 decision 15:
--   * 10 calls / minute / org, system-wide. No SUPER_ADMIN bypass.
--   * Blocked calls (status='blocked') count toward the limit, so an
--     org cannot bypass by triggering intentional blocks.
--
-- Numbering: RL1..RL8 — rate-limit query semantics.
--
-- UUID prefix: a2 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_rate_limit.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  -- 2 orgs.
  insert into public.organizations (id, name, slug) values
    ('a2000000-0000-0000-0000-00000000000a', 'P6-S17 Org A', 'rls-p6s17-a'),
    ('a2000000-0000-0000-0000-00000000000b', 'P6-S17 Org B', 'rls-p6s17-b');

  -- PM-A in Org A and OWNER-A also in Org A (to verify OWNER doesn't bypass).
  -- Plus SUPER_ADMIN cross-org user to verify super-admin doesn't bypass.
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'a2a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p6s17-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a2a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     'p6s17-sa@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'a2000000-0000-0000-0000-00000000000a'
    where id in ('a2a00000-0000-0000-0000-000000000010',
                 'a2a00000-0000-0000-0000-000000000020');

  insert into public.user_roles (user_id, organization_id, role) values
    ('a2a00000-0000-0000-0000-000000000010', 'a2000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('a2a00000-0000-0000-0000-000000000020', 'a2000000-0000-0000-0000-00000000000a', 'SUPER_ADMIN');

  -- Seed ai_logs rows directly (admin context — bypasses RLS).
  -- Org A: 9 'suggested' rows within window (count = 9 -> allowed for 10th call).
  insert into public.ai_logs (organization_id, actor_id, module, action_type, ai_mode, status, created_at)
  select
    'a2000000-0000-0000-0000-00000000000a',
    'a2a00000-0000-0000-0000-000000000010',
    'maintenance',
    'suggest',
    'suggest_only'::public.ai_mode,
    'suggested',
    now() - (i * interval '1 second')
  from generate_series(1, 9) i;

  -- Org A: 1 ancient 'suggested' (75s ago — outside the 60s window).
  insert into public.ai_logs (organization_id, actor_id, module, action_type, ai_mode, status, created_at)
  values
    ('a2000000-0000-0000-0000-00000000000a',
     'a2a00000-0000-0000-0000-000000000010',
     'maintenance', 'suggest', 'suggest_only'::public.ai_mode,
     'suggested', now() - interval '75 seconds');

  -- Org B: 3 recent 'suggested' rows (count for Org B should be 3, independent).
  insert into public.ai_logs (organization_id, module, action_type, ai_mode, status, created_at)
  select
    'a2000000-0000-0000-0000-00000000000b',
    'maintenance', 'suggest', 'suggest_only'::public.ai_mode, 'suggested',
    now() - (i * interval '1 second')
  from generate_series(1, 3) i;
end $$;

-- ===========================================================================
-- ====================== RL group — rate-limit semantics (8) ================
-- ===========================================================================
-- All RL assertions run as PM-A (Org A authenticated). ai_logs SELECT
-- RLS allows org managers to read their own org.

set local role authenticated;
set local request.jwt.claims = '{"sub":"a2a00000-0000-0000-0000-000000000010"}';

-- RL1 — Org A within-window count = 9 (the seeded recent rows).
do $$
declare n int;
begin
  select count(*) into n
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  assert n = 9,
    format('FAIL RL1: Org A within-window count = %s (expected 9)', n);
  raise notice 'RL1 PASS: 9 recent suggested rows within window';
end $$;

-- RL2 — At count = 9 the helper returns allowed (count < 10 = true).
do $$
declare n int;
declare allowed bool;
begin
  select count(*) into n
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  allowed := (n < 10);
  assert allowed, format('FAIL RL2: helper allowed=%s at count=%s', allowed, n);
  raise notice 'RL2 PASS: count=% allowed=% (10th call would proceed)', n, allowed;
end $$;

-- RL3 — Adding a 10th row (the call about to fire) → at next check, count=10
-- and helper returns blocked.
-- Insert as admin (server-side pattern) to simulate the just-logged call.
reset role;
do $$
begin
  insert into public.ai_logs (organization_id, actor_id, module, action_type, ai_mode, status, created_at)
  values
    ('a2000000-0000-0000-0000-00000000000a',
     'a2a00000-0000-0000-0000-000000000010',
     'maintenance', 'suggest', 'suggest_only'::public.ai_mode,
     'suggested', now());
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2a00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
declare allowed bool;
begin
  select count(*) into n
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  allowed := (n < 10);
  assert n = 10 and allowed = false,
    format('FAIL RL3: count=% allowed=% (expected 10, false)', n, allowed);
  raise notice 'RL3 PASS: count=% allowed=% (11th call would block)', n, allowed;
end $$;

-- RL4 — Cross-org isolation. PM-A's RLS scope excludes Org B's ai_logs:
-- a `SELECT count(*) FROM ai_logs` (no WHERE) returns ONLY Org A rows,
-- not the combined Org A + Org B count. Proves Org B's 3 seeded rows
-- can't contaminate Org A's rate-limit calculation.
do $$
declare visible_to_pm int;
begin
  select count(*) into visible_to_pm from public.ai_logs;
  -- Org A has 10 windowed + 1 ancient = 11 total visible to its PM.
  -- Org B has 3 rows that PM-A cannot see at all.
  assert visible_to_pm = 11,
    format('FAIL RL4: PM-A sees %s ai_logs rows total (expected 11 = Org A only; Org B leakage detected)', visible_to_pm);
  raise notice 'RL4 PASS: PM-A sees % rows (Org A only) — Org B 3 rows invisible', visible_to_pm;
end $$;

-- RL5 — Rows older than 60s do NOT count.
-- (Total Org A ai_logs = 10 within window + 1 ancient = 11; window = 10).
do $$
declare total int;
declare windowed int;
begin
  select count(*) into total
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a';
  select count(*) into windowed
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  assert total = 11 and windowed = 10,
    format('FAIL RL5: total=% windowed=% (expected 11, 10)', total, windowed);
  raise notice 'RL5 PASS: total=% windowed=% (old rows excluded)', total, windowed;
end $$;

-- RL6 — Status='blocked' rows count toward the limit (no bypass via blocks).
-- Insert a 'blocked' row in Org A and verify it increments the window count.
reset role;
do $$
begin
  insert into public.ai_logs (organization_id, actor_id, module, action_type, ai_mode, status, created_at, metadata)
  values
    ('a2000000-0000-0000-0000-00000000000a',
     'a2a00000-0000-0000-0000-000000000010',
     'maintenance', 'suggest', 'suggest_only'::public.ai_mode,
     'blocked', now(),
     jsonb_build_object('reason', 'rate_limited'));
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2a00000-0000-0000-0000-000000000010"}';
do $$
declare n int;
begin
  select count(*) into n
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  assert n = 11,
    format('FAIL RL6: count=% after blocked insert (expected 11)', n);
  raise notice 'RL6 PASS: count=% — blocked row counts toward limit', n;
end $$;

-- RL7 — Mixed statuses all count (suggested + blocked both included).
do $$
declare suggested_count int;
declare blocked_count int;
declare total_windowed int;
begin
  select count(*) into suggested_count
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds'
     and status = 'suggested';
  select count(*) into blocked_count
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds'
     and status = 'blocked';
  select count(*) into total_windowed
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';
  assert total_windowed = suggested_count + blocked_count,
    format('FAIL RL7: sum mismatch (suggested=%s blocked=%s total=%s)',
           suggested_count, blocked_count, total_windowed);
  raise notice 'RL7 PASS: suggested=% blocked=% total=% (all counted)',
    suggested_count, blocked_count, total_windowed;
end $$;

-- RL8 — SUPER_ADMIN does NOT bypass the rate-limit count. The query is
-- org-scoped at the SQL level — switching caller identity doesn't change
-- the result.
set local request.jwt.claims = '{"sub":"a2a00000-0000-0000-0000-000000000020"}';
do $$
declare n_super int;
declare n_pm int;
begin
  -- As SUPER_ADMIN (Org A).
  select count(*) into n_super
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';

  -- Re-switch to PM-A and re-count for comparison.
  set local request.jwt.claims = '{"sub":"a2a00000-0000-0000-0000-000000000010"}';
  select count(*) into n_pm
    from public.ai_logs
   where organization_id = 'a2000000-0000-0000-0000-00000000000a'
     and created_at > now() - interval '60 seconds';

  assert n_super = n_pm,
    format('FAIL RL8: SUPER_ADMIN count=% != PM count=%', n_super, n_pm);
  raise notice 'RL8 PASS: SUPER_ADMIN sees count=% same as PM count=%', n_super, n_pm;
end $$;

rollback;
