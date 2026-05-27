-- ===========================================================================
-- rls_phase7_notifications.sql — Phase 7 Suite 21 — notifications RLS coverage.
--
-- Source migration:
--   * 20260518000500_infrastructure.sql (Phase 1 staging — table + indexes)
--   * 20260518000700_rls.sql:309-321 (Phase 1 staging — per-user policies)
--   * 20260611000000_phase7_slice2_notifications_wiring.sql (slice 2 —
--     adds kind/metadata columns + CHECK constraint + index)
--
-- Posture per docs/PHASE_7_SLICE_2_AUDIT.md §6:
--   * notifications_select — user_id = auth.uid()
--   * notifications_update — user_id = auth.uid()
--   * notifications_delete — user_id = auth.uid()
--   * No client INSERT policy — service-role only (the producer at
--     src/lib/notifications/produce.ts uses createAdminClient()).
--
-- Numbering:
--   NX1     User A SELECT own notifications
--   NX2     User A SELECT cross-org user's notifications → 0 rows
--   NX3     User A UPDATE own row (mark read) — succeeds
--   NX4     User A UPDATE other user's row — 0 rows affected
--   NX5     User A client INSERT — blocked
--   NX6     User A DELETE own row — succeeds
--   NX7     Service-role / privileged INSERT (producer path) — succeeds
--           regardless of recipient role (TENANT recipient verified)
--   NX8     CASCADE on org delete — notifications removed when org deleted
--
-- Two audit §6.4 sketch items NOT covered here (application-layer
-- behavior, not SQL-layer RLS):
--   * Actor-self-skip (produceNotification TS short-circuit)
--   * Zero-recipient skip → audit_logs entry (TS application of the
--     resolver result)
-- Both are documented walk-test responsibilities in §8 of the slice 2
-- audit.
--
-- UUID prefix: b3 (verified no collision via grep against existing suites).
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase7_notifications.sql
-- ===========================================================================

begin;

-- ---- fixtures (privileged seed) -------------------------------------------
do $$
begin
  -- 2 orgs (cross-org isolation tests).
  insert into public.organizations (id, name, slug) values
    ('b3000000-0000-0000-0000-00000000000a', 'P7-S21 Org A', 'rls-p7s21-a'),
    ('b3000000-0000-0000-0000-00000000000b', 'P7-S21 Org B', 'rls-p7s21-b');

  -- 3 users: PM-A (Org A), TENANT-A (Org A), PM-B (Org B).
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',
     'b3a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     'p7s21-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b3a00000-0000-0000-0000-000000000014', 'authenticated', 'authenticated',
     'p7s21-t1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000',
     'b3a00000-0000-0000-0000-000000000020', 'authenticated', 'authenticated',
     'p7s21-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b3000000-0000-0000-0000-00000000000a'
    where id in ('b3a00000-0000-0000-0000-000000000010',
                 'b3a00000-0000-0000-0000-000000000014');
  update public.users set organization_id = 'b3000000-0000-0000-0000-00000000000b'
    where id = 'b3a00000-0000-0000-0000-000000000020';

  insert into public.user_roles (user_id, organization_id, role) values
    ('b3a00000-0000-0000-0000-000000000010', 'b3000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b3a00000-0000-0000-0000-000000000014', 'b3000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('b3a00000-0000-0000-0000-000000000020', 'b3000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Seed notifications: one for PM-A (Org A), one for PM-B (Org B),
  -- one for TENANT-A (Org A) — exercises both manager + tenant recipients.
  insert into public.notifications
    (id, organization_id, user_id, title, type, kind, link, metadata, is_read)
  values
    ('b3c00000-0000-0000-0000-000000000001',
     'b3000000-0000-0000-0000-00000000000a',
     'b3a00000-0000-0000-0000-000000000010',
     'PM-A: maintenance request', 'info', 'maintenance.created',
     '/maintenance/abc', '{"maintenance_request_id":"abc"}'::jsonb, false),
    ('b3c00000-0000-0000-0000-000000000002',
     'b3000000-0000-0000-0000-00000000000b',
     'b3a00000-0000-0000-0000-000000000020',
     'PM-B: maintenance request', 'info', 'maintenance.created',
     '/maintenance/xyz', '{"maintenance_request_id":"xyz"}'::jsonb, false),
    ('b3c00000-0000-0000-0000-000000000003',
     'b3000000-0000-0000-0000-00000000000a',
     'b3a00000-0000-0000-0000-000000000014',
     'Tenant-A: message received', 'info', 'message.received',
     '/portal/messages', '{"tenant_id":"abc"}'::jsonb, false);
end $$;

-- ============ Switch to PM-A (Org A) =======================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b3a00000-0000-0000-0000-000000000010"}';

-- NX1 — PM-A SELECT own notifications → 1 row.
do $$
declare n int;
begin
  select count(*) into n from public.notifications
    where user_id = 'b3a00000-0000-0000-0000-000000000010';
  assert n = 1, format('FAIL NX1: PM-A sees %s own rows (expected 1)', n);
  raise notice 'NX1 PASS: PM-A SELECT own notifications → 1 row';
end $$;

-- NX2 — PM-A SELECT PM-B's notifications (cross-org) → 0 rows.
do $$
declare n int;
begin
  select count(*) into n from public.notifications
    where user_id = 'b3a00000-0000-0000-0000-000000000020';
  assert n = 0, format('FAIL NX2: PM-A sees %s PM-B rows (expected 0)', n);
  raise notice 'NX2 PASS: PM-A SELECT PM-B notifications → 0 rows (RLS per-user)';
end $$;

-- NX3 — PM-A UPDATE own row (mark read) → succeeds, is_read = true.
do $$
declare new_state bool;
begin
  update public.notifications set is_read = true
    where id = 'b3c00000-0000-0000-0000-000000000001'
  returning is_read into new_state;
  assert new_state = true, format('FAIL NX3: is_read = %s after UPDATE (expected true)', new_state);
  raise notice 'NX3 PASS: PM-A UPDATE own row → is_read flipped to true';
end $$;

-- NX4 — PM-A UPDATE PM-B's row → 0 rows affected (RLS denies).
do $$
declare row_count int;
begin
  update public.notifications set is_read = true
    where id = 'b3c00000-0000-0000-0000-000000000002';
  get diagnostics row_count = row_count;
  assert row_count = 0,
    format('FAIL NX4: PM-A UPDATE on PM-B row affected %s rows (expected 0)', row_count);
  raise notice 'NX4 PASS: PM-A UPDATE on PM-B row → 0 rows (RLS isolation)';
end $$;

-- NX5 — PM-A client INSERT → blocked (no client INSERT policy).
do $$
declare blocked bool := false;
begin
  begin
    insert into public.notifications
      (organization_id, user_id, title, kind)
    values
      ('b3000000-0000-0000-0000-00000000000a',
       'b3a00000-0000-0000-0000-000000000010',
       'Self-injected', 'info');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL NX5: PM-A client INSERT into notifications succeeded';
  raise notice 'NX5 PASS: PM-A client INSERT denied (no INSERT policy — service-role only)';
end $$;

-- NX6 — PM-A DELETE own row → succeeds.
do $$
declare row_count int;
begin
  delete from public.notifications
    where id = 'b3c00000-0000-0000-0000-000000000001';
  get diagnostics row_count = row_count;
  assert row_count = 1,
    format('FAIL NX6: PM-A DELETE own row affected %s rows (expected 1)', row_count);
  raise notice 'NX6 PASS: PM-A DELETE own row → 1 row affected';
end $$;

-- ============ Switch back to privileged context for service-role + cascade ==
reset role;

-- NX7 — Privileged INSERT (mirrors producer's admin-client path) succeeds
-- regardless of recipient role. Verifies a TENANT-role recipient.
do $$
declare n int;
begin
  insert into public.notifications
    (id, organization_id, user_id, title, type, kind, link, metadata, is_read)
  values
    ('b3c00000-0000-0000-0000-000000000099',
     'b3000000-0000-0000-0000-00000000000a',
     'b3a00000-0000-0000-0000-000000000014',
     'Tenant: insurance update', 'info', 'message.received',
     '/portal/messages', '{}'::jsonb, false);
  select count(*) into n from public.notifications
    where id = 'b3c00000-0000-0000-0000-000000000099';
  assert n = 1, 'FAIL NX7: privileged INSERT for TENANT recipient did not land';
  raise notice 'NX7 PASS: privileged INSERT for TENANT-role recipient succeeded';
end $$;

-- NX8 — CASCADE on org delete: deleting Org A removes its notifications.
do $$
declare n int;
begin
  delete from public.organizations where id = 'b3000000-0000-0000-0000-00000000000a';
  select count(*) into n from public.notifications
    where organization_id = 'b3000000-0000-0000-0000-00000000000a';
  assert n = 0, format('FAIL NX8: %s notifications remain after org delete (expected 0)', n);
  raise notice 'NX8 PASS: org delete cascaded to notifications → 0 rows remain';
end $$;

rollback;
