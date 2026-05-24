-- ===========================================================================
-- rls_phase3_messages_immutable.sql — Suite 12 — verifies the messaging
-- table's RLS posture from migration 20260527000100_phase3_messaging.
--
-- The novel pattern in this slice is IMMUTABILITY enforced at the RLS
-- layer: messages has NO update and NO delete policies. RLS with no policy
-- for an operation denies all rows for that operation, so an authenticated
-- caller's UPDATE / DELETE silently affects 0 rows. This is application-
-- level immutability without a trigger.
--
-- The INSERT policy splits on sender_role with defence-in-depth on both
-- branches:
--   staff:  sender_role = 'staff'  AND sender_id = auth.uid()
--           AND organization_id = current_user_org_id()
--           AND can_write_tenants()
--   tenant: sender_role = 'tenant' AND sender_id = auth.uid()
--           AND exists tenants t WHERE t.id = messages.tenant_id
--                              AND t.user_id = auth.uid()
--                              AND t.organization_id = messages.organization_id
--
-- SELECT allows any org staff (is_org_staff()), the tenant whose tenant_id
-- the message points at, and super-admin.
--
-- Numbering:
--   M1..M5   SELECT scoping (staff read; tenant-self read; cross-conversation
--            and cross-org reads denied)
--   M6..M12  INSERT gating (staff/tenant branches + each defence-in-depth)
--   M13..M14 UPDATE / DELETE denied (no policy ⇒ 0 rows)
--
-- Run: npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_messages_immutable.sql
-- ===========================================================================

begin;

-- ---- fixtures (seeded as the privileged migration role) -------------------
do $$
begin
  insert into public.organizations (id, name, slug) values
    ('b2000000-0000-0000-0000-00000000000a', 'Suite 12 Org A', 'rls-s12-a'),
    ('b2000000-0000-0000-0000-00000000000b', 'Suite 12 Org B', 'rls-s12-b');

  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values
    -- Org A staff: PROPERTY_MANAGER (can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's12-pm-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A staff: MAINTENANCE_TECH (is_org_staff, NOT can_write_tenants)
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000011', 'authenticated', 'authenticated',
     's12-tech-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T1 (with auth user)
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
     's12-t1-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org A tenant T2 (with auth user)
    ('00000000-0000-0000-0000-000000000000',
     'b2a00000-0000-0000-0000-000000000022', 'authenticated', 'authenticated',
     's12-t2-a@rls.test', '', now(), '{}', '{}', now(), now()),
    -- Org B staff (cross-org test)
    ('00000000-0000-0000-0000-000000000000',
     'b2b00000-0000-0000-0000-000000000010', 'authenticated', 'authenticated',
     's12-pm-b@rls.test', '', now(), '{}', '{}', now(), now());

  update public.users set organization_id = 'b2000000-0000-0000-0000-00000000000a'
    where id in ('b2a00000-0000-0000-0000-000000000010',
                 'b2a00000-0000-0000-0000-000000000011',
                 'b2a00000-0000-0000-0000-000000000021',
                 'b2a00000-0000-0000-0000-000000000022');
  update public.users set organization_id = 'b2000000-0000-0000-0000-00000000000b'
    where id = 'b2b00000-0000-0000-0000-000000000010';

  insert into public.user_roles (user_id, organization_id, role) values
    ('b2a00000-0000-0000-0000-000000000010',
     'b2000000-0000-0000-0000-00000000000a', 'PROPERTY_MANAGER'),
    ('b2a00000-0000-0000-0000-000000000011',
     'b2000000-0000-0000-0000-00000000000a', 'MAINTENANCE_TECH'),
    ('b2a00000-0000-0000-0000-000000000021',
     'b2000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('b2a00000-0000-0000-0000-000000000022',
     'b2000000-0000-0000-0000-00000000000a', 'TENANT'),
    ('b2b00000-0000-0000-0000-000000000010',
     'b2000000-0000-0000-0000-00000000000b', 'PROPERTY_MANAGER');

  -- Tenant rows linked to their auth users.
  insert into public.tenants
    (id, organization_id, user_id, first_name, last_name, email)
  values
    ('b2c00000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-00000000000a',
     'b2a00000-0000-0000-0000-000000000021', 'Tee', 'One',
     's12-t1-a@rls.test'),
    ('b2c00000-0000-0000-0000-000000000002',
     'b2000000-0000-0000-0000-00000000000a',
     'b2a00000-0000-0000-0000-000000000022', 'Tee', 'Two',
     's12-t2-a@rls.test');

  -- One seed message in T1's conversation, sent by staff.
  insert into public.messages
    (id, organization_id, tenant_id, sender_id, sender_role, body)
  values
    ('b2f00000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-00000000000a',
     'b2c00000-0000-0000-0000-000000000001',
     'b2a00000-0000-0000-0000-000000000010',
     'staff', 'Welcome to the portal — let us know if you need anything.');

  raise notice 'Fixtures seeded: 2 orgs, 5 users, 2 tenants, 1 seed message';
end $$;

-- ===========================================================================
-- M1 — Org A staff (PM) can SELECT T1's message.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.messages
    where tenant_id = 'b2c00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL M1: staff PM sees %s messages in T1 conv (expected 1)', n);
  raise notice 'M1 PASS: staff PM sees T1 messages';
end $$;

-- ===========================================================================
-- M2 — non-write staff (MAINTENANCE_TECH) can also SELECT.
-- Any is_org_staff reads, even if they cannot send.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000011"}';

do $$
declare n int;
begin
  select count(*) into n from public.messages
    where tenant_id = 'b2c00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL M2: MAINTENANCE_TECH sees %s messages (expected 1)', n);
  raise notice 'M2 PASS: any is_org_staff can SELECT messages';
end $$;

-- ===========================================================================
-- M3 — tenant T1 (the subject of the conversation) can SELECT their own.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000021"}';

do $$
declare n int;
begin
  select count(*) into n from public.messages
    where tenant_id = 'b2c00000-0000-0000-0000-000000000001';
  assert n = 1, format('FAIL M3: tenant T1 sees %s own messages (expected 1)', n);
  raise notice 'M3 PASS: tenant T1 sees own conversation';
end $$;

-- ===========================================================================
-- M4 — tenant T2 (same org, different conversation) sees 0 of T1's messages.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000022"}';

do $$
declare n int;
begin
  select count(*) into n from public.messages
    where tenant_id = 'b2c00000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL M4: tenant T2 sees %s of T1 messages (expected 0)', n);
  raise notice 'M4 PASS: tenant T2 cannot SELECT T1 messages';
end $$;

-- ===========================================================================
-- M5 — cross-org staff (PM2 in Org B) sees 0 of Org A's messages.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2b00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  select count(*) into n from public.messages
    where tenant_id = 'b2c00000-0000-0000-0000-000000000001';
  assert n = 0, format('FAIL M5: cross-org PM sees %s messages (expected 0)', n);
  raise notice 'M5 PASS: cross-org staff cannot SELECT Org A messages';
end $$;

-- ===========================================================================
-- M6 — staff PM can INSERT sender_role=staff into T1 conversation.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

do $$
declare new_id uuid;
begin
  insert into public.messages
    (organization_id, tenant_id, sender_id, sender_role, body)
  values
    ('b2000000-0000-0000-0000-00000000000a',
     'b2c00000-0000-0000-0000-000000000001',
     'b2a00000-0000-0000-0000-000000000010',
     'staff', 'Following up on your last note.')
  returning id into new_id;
  assert new_id is not null, 'FAIL M6: staff PM INSERT was rejected';
  raise notice 'M6 PASS: staff PM CAN INSERT sender_role=staff (legitimate)';
end $$;

-- ===========================================================================
-- M7 — MAINTENANCE_TECH (is_org_staff but NOT can_write_tenants) CANNOT
-- INSERT sender_role=staff. SELECT works (M2) but send is gated.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000011"}';

do $$
declare blocked bool := false;
begin
  begin
    insert into public.messages
      (organization_id, tenant_id, sender_id, sender_role, body)
    values
      ('b2000000-0000-0000-0000-00000000000a',
       'b2c00000-0000-0000-0000-000000000001',
       'b2a00000-0000-0000-0000-000000000011',
       'staff', 'Tech trying to send.');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL M7: MAINTENANCE_TECH was able to INSERT a staff message';
  raise notice 'M7 PASS: MAINTENANCE_TECH cannot INSERT (can_write_tenants gate)';
end $$;

-- ===========================================================================
-- M8 — tenant T1 can INSERT sender_role=tenant into own conversation.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000021"}';

do $$
declare new_id uuid;
begin
  insert into public.messages
    (organization_id, tenant_id, sender_id, sender_role, body)
  values
    ('b2000000-0000-0000-0000-00000000000a',
     'b2c00000-0000-0000-0000-000000000001',
     'b2a00000-0000-0000-0000-000000000021',
     'tenant', 'Thanks — heater is acting up again.')
  returning id into new_id;
  assert new_id is not null, 'FAIL M8: tenant T1 INSERT into own conv rejected';
  raise notice 'M8 PASS: tenant T1 CAN INSERT into own conversation (legitimate)';
end $$;

-- ===========================================================================
-- M9 — tenant T1 CANNOT INSERT sender_role=tenant into T2's conversation.
-- Defence-in-depth: WITH CHECK requires the tenant row for messages.tenant_id
-- to belong to auth.uid(). T1 trying to write into T2's conv fails because
-- the EXISTS clause is false (T2.user_id ≠ T1's uid).
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.messages
      (organization_id, tenant_id, sender_id, sender_role, body)
    values
      ('b2000000-0000-0000-0000-00000000000a',
       'b2c00000-0000-0000-0000-000000000002',                  -- T2's tenant_id
       'b2a00000-0000-0000-0000-000000000021',                  -- T1's auth uid
       'tenant', 'T1 trying to write into T2 conv.');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL M9: T1 wrote into T2 conversation';
  raise notice 'M9 PASS: tenant cannot INSERT into another tenant''s conversation';
end $$;

-- ===========================================================================
-- M10 — tenant T1 CANNOT INSERT with sender_role=staff (impersonation).
-- The staff branch's WITH CHECK requires can_write_tenants(), which T1 lacks.
-- ===========================================================================
do $$
declare blocked bool := false;
begin
  begin
    insert into public.messages
      (organization_id, tenant_id, sender_id, sender_role, body)
    values
      ('b2000000-0000-0000-0000-00000000000a',
       'b2c00000-0000-0000-0000-000000000001',
       'b2a00000-0000-0000-0000-000000000021',
       'staff', 'T1 impersonating staff.');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL M10: tenant successfully sent a staff-role message';
  raise notice 'M10 PASS: tenant cannot INSERT with sender_role=staff';
end $$;

-- ===========================================================================
-- M11 — staff PM CANNOT INSERT with sender_id pointing at a different user.
-- The WITH CHECK requires sender_id = auth.uid() on both branches.
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

do $$
declare blocked bool := false;
begin
  begin
    insert into public.messages
      (organization_id, tenant_id, sender_id, sender_role, body)
    values
      ('b2000000-0000-0000-0000-00000000000a',
       'b2c00000-0000-0000-0000-000000000001',
       'b2a00000-0000-0000-0000-000000000011',                  -- tech's uid, not PM's
       'staff', 'PM forging sender_id.');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL M11: staff PM INSERT with mismatched sender_id succeeded';
  raise notice 'M11 PASS: sender_id = auth.uid() enforced (no forgery)';
end $$;

-- ===========================================================================
-- M12 — cross-org defence-in-depth: tenant cannot INSERT into a message
-- whose organization_id does NOT match their tenant row's organization_id.
-- (Both T1's org and the messages.organization_id would have to disagree for
-- this to fire — we craft the row with Org B's id while the tenant is in A.)
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000021"}';

do $$
declare blocked bool := false;
begin
  begin
    insert into public.messages
      (organization_id, tenant_id, sender_id, sender_role, body)
    values
      ('b2000000-0000-0000-0000-00000000000b',                  -- Org B (wrong)
       'b2c00000-0000-0000-0000-000000000001',                  -- T1 (Org A)
       'b2a00000-0000-0000-0000-000000000021',
       'tenant', 'T1 with mismatched org_id.');
  exception
    when insufficient_privilege or check_violation then blocked := true;
  end;
  assert blocked, 'FAIL M12: tenant INSERT with mismatched org_id succeeded';
  raise notice 'M12 PASS: tenant cannot INSERT with mismatched organization_id';
end $$;

-- ===========================================================================
-- M13 — UPDATE on messages by an authenticated user affects 0 rows.
-- messages has no UPDATE policy ⇒ RLS denies all rows for the operation.
-- (As staff PM, the most-privileged authenticated user available here.)
-- ===========================================================================
set local request.jwt.claims =
  '{"sub":"b2a00000-0000-0000-0000-000000000010"}';

do $$
declare n int;
begin
  with u as (
    update public.messages set body = 'EDITED'
     where id = 'b2f00000-0000-0000-0000-000000000001'
     returning 1
  )
  select count(*) into n from u;
  assert n = 0, format('FAIL M13: UPDATE on messages affected %s row(s) (expected 0)', n);
  -- Defence-in-depth: confirm body is unchanged.
  perform 1 from public.messages
    where id = 'b2f00000-0000-0000-0000-000000000001'
      and body = 'Welcome to the portal — let us know if you need anything.';
  assert found, 'FAIL M13b: seed message body was actually mutated';
  raise notice 'M13 PASS: UPDATE on messages denied (no policy ⇒ 0 rows; body unchanged)';
end $$;

-- ===========================================================================
-- M14 — DELETE on messages by an authenticated user affects 0 rows.
-- ===========================================================================
do $$
declare n_pre int; n_post int;
begin
  select count(*) into n_pre from public.messages
    where id = 'b2f00000-0000-0000-0000-000000000001';
  with d as (
    delete from public.messages
     where id = 'b2f00000-0000-0000-0000-000000000001'
     returning 1
  )
  select count(*) into n_post from d;
  assert n_post = 0,
    format('FAIL M14: DELETE on messages affected %s row(s) (expected 0)', n_post);
  perform 1 from public.messages
    where id = 'b2f00000-0000-0000-0000-000000000001';
  assert found, 'FAIL M14b: seed message was actually deleted';
  raise notice 'M14 PASS: DELETE on messages denied (no policy ⇒ 0 rows; row remains)';
end $$;

reset role;

do $$ begin raise notice 'ALL Suite 12 (messages immutability) assertions PASSED'; end $$;

rollback;
