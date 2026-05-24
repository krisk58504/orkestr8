-- ===========================================================================
-- 20260527000100_phase3_messaging.sql — Phase 3 slice 8: staff/tenant messaging
--
-- Adds an immutable messages table and a separate tenant_conversation_state
-- table that tracks high-water-mark read state per audience.
--
-- IMMUTABILITY: messages has no UPDATE and no DELETE policy. Once written, a
-- row cannot be mutated through the app's authenticated role. The service
-- role can still mutate for operator interventions, but ordinary code paths
-- cannot. Implementing this at the policy level (rather than via triggers or
-- application discipline) means an attempt to update returns zero affected
-- rows silently — no edit history is needed because edits aren't possible.
--
-- READ STATE: team-level. last_read_by_staff_at applies to ALL staff in the
-- org collectively — "we have looked at this conversation". Per-staff-user
-- read state is intentionally out of scope; it can layer in later if the
-- inbox needs personal-unread badges instead of team ones.
--
-- RLS SPLIT (intentional):
--   SELECT: any org staff (is_org_staff) so e.g. a maintenance tech can see
--     context on a tenant complaint that mentions plumbing.
--   INSERT: can_write_tenants (management + leasing) on the staff side —
--     same gate as tenant write authority. Tenants may insert into their own
--     conversation only.
--   sender_id = auth.uid() is enforced for both branches as defense-in-depth.
--
-- NOT certified production-safe until documented human review (SPEC Gate 1) —
-- see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- ===========================================================================

-- ---- enum: message_sender_role -------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_type
    where typname = 'message_sender_role'
      and typnamespace = 'public'::regnamespace
  ) then
    raise exception
      'enum public.message_sender_role already exists — aborting 20260527000100_phase3_messaging';
  end if;
end $$;

create type public.message_sender_role as enum ('tenant', 'staff');

-- ---- table: messages (immutable) ------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  sender_role     public.message_sender_role not null,
  body            text not null check (length(trim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists messages_tenant_id_created_at_idx
  on public.messages(tenant_id, created_at desc);
create index if not exists messages_organization_id_created_at_idx
  on public.messages(organization_id, created_at desc);

-- ---- table: tenant_conversation_state -------------------------------------
create table if not exists public.tenant_conversation_state (
  tenant_id              uuid primary key references public.tenants(id) on delete cascade,
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  last_read_by_tenant_at timestamptz,
  last_read_by_staff_at  timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists tenant_conversation_state_organization_id_idx
  on public.tenant_conversation_state(organization_id);

drop trigger if exists set_updated_at on public.tenant_conversation_state;
create trigger set_updated_at before update on public.tenant_conversation_state
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — messages (immutable: no UPDATE, no DELETE)
-- ===========================================================================
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.id = messages.tenant_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (
      sender_role = 'staff'
      and sender_id = auth.uid()
      and organization_id = public.current_user_org_id()
      and public.can_write_tenants()
    )
    or (
      sender_role = 'tenant'
      and sender_id = auth.uid()
      and exists (
        select 1 from public.tenants t
        where t.id = messages.tenant_id
          and t.user_id = auth.uid()
          and t.organization_id = messages.organization_id
      )
    )
    or public.is_super_admin()
  );

-- No UPDATE policy and no DELETE policy: messages are immutable through the
-- authenticated role. Drop any that may exist from a prior schema drift just
-- in case.
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

-- ===========================================================================
-- RLS — tenant_conversation_state (mutable; select/insert/update; no delete)
-- ===========================================================================
alter table public.tenant_conversation_state enable row level security;

drop policy if exists tenant_conversation_state_select on public.tenant_conversation_state;
create policy tenant_conversation_state_select on public.tenant_conversation_state
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists tenant_conversation_state_insert on public.tenant_conversation_state;
create policy tenant_conversation_state_insert on public.tenant_conversation_state
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists tenant_conversation_state_update on public.tenant_conversation_state;
create policy tenant_conversation_state_update on public.tenant_conversation_state
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists tenant_conversation_state_delete on public.tenant_conversation_state;

-- ===========================================================================
-- grants — re-applied so the new tables are covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
