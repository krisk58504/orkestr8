-- ===========================================================================
-- rls_phase6_ai_restrictive.sql — Phase 6 Suite 16 — verifies the
-- RESTRICTIVE policy + is_ai_actor() helper introduced in slice 11a.
--
-- Source migration:
--   * 20260604000100_phase6_ai_foundation.sql
--     - ai_logs cost-tracking columns (not RLS surface; covered implicitly)
--     - is_ai_actor() helper, COALESCEs `app.is_ai_actor` setting to false
--     - rent_charges_no_ai_writes RESTRICTIVE policy
--     - payments_no_ai_writes RESTRICTIVE policy
--
-- Posture per PHASE_6_PLAN.md §3a:
--   * RESTRICTIVE policies AND with the four PERMISSIVE policies on
--     rent_charges + payments already shipped in Phase 5 slices 10a/10b.
--   * Phase 6.1 ships zero code that flips the `app.is_ai_actor` setting,
--     so the policy is a no-op for every real Phase 6 code path. The
--     helper + policies are deferred-activation defense-in-depth: the
--     day a future migration introduces an AI-context write path, this
--     policy denies it without code changes.
--
-- Numbering:
--   AI1..AI3  is_ai_actor() helper behavior
--   AI4..AI7  rent_charges RESTRICTIVE — block matrix (INSERT/UPDATE/DELETE
--             with flag flipped + happy-path INSERT without flag)
--   AI8..AI10 payments RESTRICTIVE — block matrix
--   AI11..AI12 PERMISSIVE policy regression (PM SELECT still works)
--
-- UUID prefix: a1 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_ai_restrictive.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  -- 1 org (no cross-org concerns in this suite — RESTRICTIVE is org-agnostic).
  insert into public.organizations (id, name, slug) values
    ('a1000000-0000-0000-0000-00000000000a', 'P6-S16 Org A', 'rls-p6s16-a');

  -- auth.users (handle_new_user trigger creates the public.users row).
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'a1a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p6s16-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'a1a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p6s16-t1-a@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'a1000000-0000-0000-0000-00000000000a'
    where id in ('a1a00000-0000-0000-0000-000000000010',
                 'a1a00000-0000-0000-0000-000000000014');

  insert into public.user_roles (user_id, organization_id, role) values
    ('a1a00000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('a1a00000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-00000000000a', 'TENANT');

  -- property → building → unit → tenant → lease → rent_charge → payment.
  insert into public.properties (id, organization_id, name, address_line1, city, state, postal_code, country)
    values ('a1d00000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'Prop-A1', '1 Main', 'Anytown', 'CA', '90001', 'US');

  insert into public.units (id, organization_id, property_id, unit_number, bedrooms, bathrooms)
    values ('a1e00000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'a1d00000-0000-0000-0000-000000000001',
            '101', 1, 1);

  insert into public.tenants (id, organization_id, user_id, unit_id, property_id, first_name, last_name)
    values ('a1c00000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'a1a00000-0000-0000-0000-000000000014',
            'a1e00000-0000-0000-0000-000000000001',
            'a1d00000-0000-0000-0000-000000000001',
            'Ten', 'A1');

  insert into public.leases
    (id, organization_id, unit_id, start_date, end_date, monthly_rent, status)
    values ('a1f00000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'a1e00000-0000-0000-0000-000000000001',
            date '2026-01-01', date '2026-12-31', 1500.00, 'active');

  -- Link tenant to lease.
  update public.tenants set lease_id = 'a1f00000-0000-0000-0000-000000000001'
    where id = 'a1c00000-0000-0000-0000-000000000001';

  -- Seed rent_charge + payment for UPDATE/DELETE tests.
  insert into public.rent_charges
    (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
    values ('a1f10000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'a1f00000-0000-0000-0000-000000000001',
            'a1c00000-0000-0000-0000-000000000001',
            'a1e00000-0000-0000-0000-000000000001',
            1500.00, date '2026-04-01');

  insert into public.payments
    (id, organization_id, charge_id, tenant_id, amount_paid, paid_at, method, recorded_by)
    values ('a1f20000-0000-0000-0000-000000000001',
            'a1000000-0000-0000-0000-00000000000a',
            'a1f10000-0000-0000-0000-000000000001',
            'a1c00000-0000-0000-0000-000000000001',
            500.00, now(), 'cash',
            'a1a00000-0000-0000-0000-000000000010');
end $$;

-- ===========================================================================
-- ====================== AI group — is_ai_actor + RESTRICTIVE (12) ==========
-- ===========================================================================

-- AI1 — is_ai_actor() returns false by default (no setting).
do $$
declare flag bool;
begin
  select public.is_ai_actor() into flag;
  assert flag = false,
    format('FAIL AI1: is_ai_actor() returned %s without setting (expected false)', flag);
  raise notice 'AI1 PASS: is_ai_actor() returns false by default';
end $$;

-- AI2 — is_ai_actor() returns true when app.is_ai_actor is set to 'true'.
do $$
declare flag bool;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  select public.is_ai_actor() into flag;
  assert flag = true,
    format('FAIL AI2: is_ai_actor() returned %s with flag set (expected true)', flag);
  raise notice 'AI2 PASS: is_ai_actor() returns true with app.is_ai_actor=true';
end $$;

-- AI3 — Flag is transaction-local: a fresh DO block sees false again
-- because SET LOCAL with set_config(_, _, true) is scoped to the
-- enclosing block. We reset to ensure later assertions start clean.
do $$
declare flag bool;
begin
  perform set_config('app.is_ai_actor', 'false', true);
  select public.is_ai_actor() into flag;
  assert flag = false,
    format('FAIL AI3: is_ai_actor() returned %s after explicit reset', flag);
  raise notice 'AI3 PASS: is_ai_actor() resets to false on explicit clear';
end $$;

-- ============ Switch to PM-A (authenticated) for write-path tests ==========
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a00000-0000-0000-0000-000000000010"}';

-- AI4 — PM-A INSERT into rent_charges WITHOUT is_ai_actor flag → succeeds.
do $$
begin
  insert into public.rent_charges
    (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
  values
    ('a1f10000-0000-0000-0000-000000000002',
     'a1000000-0000-0000-0000-00000000000a',
     'a1f00000-0000-0000-0000-000000000001',
     'a1c00000-0000-0000-0000-000000000001',
     'a1e00000-0000-0000-0000-000000000001',
     1500.00, date '2026-05-01');
  raise notice 'AI4 PASS: PM INSERT rent_charges (no AI flag) succeeded';
end $$;

-- AI5 — PM-A INSERT into rent_charges WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    insert into public.rent_charges
      (id, organization_id, lease_id, tenant_id, unit_id, amount_due, due_date)
    values
      ('a1f10000-0000-0000-0000-000000000003',
       'a1000000-0000-0000-0000-00000000000a',
       'a1f00000-0000-0000-0000-000000000001',
       'a1c00000-0000-0000-0000-000000000001',
       'a1e00000-0000-0000-0000-000000000001',
       1500.00, date '2026-06-01');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI5: AI-flagged INSERT into rent_charges succeeded';
  raise notice 'AI5 PASS: AI-flagged INSERT into rent_charges denied (RESTRICTIVE)';
end $$;

-- AI6 — PM-A UPDATE rent_charges WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    update public.rent_charges
       set amount_due = 9999.00
     where id = 'a1f10000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then
      blocked := false;
    else
      blocked := true; -- RESTRICTIVE policy on UPDATE silently affects zero rows.
    end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI6: AI-flagged UPDATE on rent_charges succeeded';
  raise notice 'AI6 PASS: AI-flagged UPDATE on rent_charges denied (RESTRICTIVE)';
end $$;

-- AI7 — PM-A DELETE rent_charges WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    delete from public.rent_charges
     where id = 'a1f10000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then
      blocked := false;
    else
      blocked := true;
    end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI7: AI-flagged DELETE on rent_charges succeeded';
  raise notice 'AI7 PASS: AI-flagged DELETE on rent_charges denied (RESTRICTIVE)';
end $$;

-- AI8 — PM-A INSERT into payments WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    insert into public.payments
      (organization_id, charge_id, tenant_id, amount_paid, paid_at,
       method, recorded_by)
    values
      ('a1000000-0000-0000-0000-00000000000a',
       'a1f10000-0000-0000-0000-000000000001',
       'a1c00000-0000-0000-0000-000000000001',
       250.00, now(), 'cash',
       'a1a00000-0000-0000-0000-000000000010');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI8: AI-flagged INSERT into payments succeeded';
  raise notice 'AI8 PASS: AI-flagged INSERT into payments denied (RESTRICTIVE)';
end $$;

-- AI9 — PM-A UPDATE payments WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    update public.payments
       set amount_paid = 9999.00
     where id = 'a1f20000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then blocked := false; else blocked := true; end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI9: AI-flagged UPDATE on payments succeeded';
  raise notice 'AI9 PASS: AI-flagged UPDATE on payments denied (RESTRICTIVE)';
end $$;

-- AI10 — PM-A DELETE payments WITH is_ai_actor flag → blocked.
do $$
declare blocked bool := false;
declare row_count int;
begin
  perform set_config('app.is_ai_actor', 'true', true);
  begin
    delete from public.payments
     where id = 'a1f20000-0000-0000-0000-000000000001';
    get diagnostics row_count = row_count;
    if row_count > 0 then blocked := false; else blocked := true; end if;
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL AI10: AI-flagged DELETE on payments succeeded';
  raise notice 'AI10 PASS: AI-flagged DELETE on payments denied (RESTRICTIVE)';
end $$;

-- AI11 — Regression: PM SELECT rent_charges WITHOUT flag → still sees rows
-- (PERMISSIVE policy unaffected by RESTRICTIVE when AI flag is false).
do $$
declare n int;
begin
  perform set_config('app.is_ai_actor', 'false', true);
  select count(*) into n from public.rent_charges;
  assert n >= 2, format('FAIL AI11: PM sees %s rent_charges (expected >= 2)', n);
  raise notice 'AI11 PASS: PM SELECT rent_charges → % rows (PERMISSIVE intact)', n;
end $$;

-- AI12 — Regression: PM SELECT payments WITHOUT flag → still sees rows.
do $$
declare n int;
begin
  perform set_config('app.is_ai_actor', 'false', true);
  select count(*) into n from public.payments;
  assert n >= 1, format('FAIL AI12: PM sees %s payments (expected >= 1)', n);
  raise notice 'AI12 PASS: PM SELECT payments → % rows (PERMISSIVE intact)', n;
end $$;

rollback;
