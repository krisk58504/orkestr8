-- ===========================================================================
-- 20260518000700_rls.sql  —  Row Level Security (SPEC Gate 1)
--
-- Every table in public is RLS-enabled with organization-level isolation.
-- These policies are GENERATED and ENABLED here, but per SPEC Gate 1 they are
-- NOT certified production-safe until a documented human review has occurred.
-- See SECURITY_REVIEW.md and RLS_TEST_PLAN.md.
--
-- Recursion note: helper functions are SECURITY DEFINER so they read
-- public.users / public.user_roles as the table owner, bypassing RLS, and
-- therefore do not re-enter the policies that call them.
-- ===========================================================================

-- ---- helper functions -----------------------------------------------------
create or replace function public.current_user_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.users where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.users where id = auth.uid()), false);
$$;

create or replace function public.has_role(p_roles public.user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = (select organization_id from public.users where id = auth.uid())
      and ur.role = any(p_roles)
  );
$$;

-- Internal staff (can read management data within their own org).
create or replace function public.is_org_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array[
    'SUPER_ADMIN','OWNER','REGIONAL_MANAGER','PROPERTY_MANAGER','LEASING_AGENT',
    'MAINTENANCE_MANAGER','MAINTENANCE_TECH','ACCOUNTING'
  ]::public.user_role[]);
$$;

-- Management roles (can write properties / buildings / units / tenants).
create or replace function public.is_org_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array[
    'SUPER_ADMIN','OWNER','REGIONAL_MANAGER','PROPERTY_MANAGER'
  ]::public.user_role[]);
$$;

-- Roles allowed to maintain tenant records (management + leasing).
create or replace function public.can_write_tenants()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array[
    'SUPER_ADMIN','OWNER','REGIONAL_MANAGER','PROPERTY_MANAGER','LEASING_AGENT'
  ]::public.user_role[]);
$$;

grant execute on function public.current_user_org_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_role(public.user_role[]) to authenticated;
grant execute on function public.is_org_staff() to authenticated;
grant execute on function public.is_org_manager() to authenticated;
grant execute on function public.can_write_tenants() to authenticated;

-- ===========================================================================
-- organizations
-- ===========================================================================
alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.current_user_org_id() or public.is_super_admin());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (
    (id = public.current_user_org_id()
      and public.has_role(array['OWNER']::public.user_role[]))
    or public.is_super_admin()
  )
  with check (id = public.current_user_org_id() or public.is_super_admin());
-- INSERT: none. Orgs are created only via rpc public.create_organization().
-- DELETE: none. Org deletion is an operator-only action.

-- ===========================================================================
-- users
-- ===========================================================================
alter table public.users enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or organization_id = public.current_user_org_id()
    or public.is_super_admin()
  );

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- is_super_admin / organization_id tampering is blocked by trigger
-- protect_user_columns, so a self-update is safe.

drop policy if exists users_update_by_manager on public.users;
create policy users_update_by_manager on public.users
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    organization_id = public.current_user_org_id() or public.is_super_admin()
  );
-- INSERT: none. Profiles are created by trigger handle_new_user().

-- ===========================================================================
-- user_roles
-- ===========================================================================
alter table public.user_roles enable row level security;

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = auth.uid()
    or organization_id = public.current_user_org_id()
    or public.is_super_admin()
  );

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- settings
-- ===========================================================================
alter table public.settings enable row level security;

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- ===========================================================================
-- properties / buildings / units  — identical org-scoped policy shape
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['properties','buildings','units'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          (organization_id = public.current_user_org_id() and public.is_org_staff())
          or public.is_super_admin()
        )$f$, t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          (organization_id = public.current_user_org_id() and public.is_org_manager())
          or public.is_super_admin()
        )
        with check (
          (organization_id = public.current_user_org_id() and public.is_org_manager())
          or public.is_super_admin()
        )$f$, t || '_write', t);
  end loop;
end $$;

-- ===========================================================================
-- tenants  — staff can read; management + leasing can write; a linked portal
-- user (Phase 3) can read their own record.
-- ===========================================================================
alter table public.tenants enable row level security;

drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or user_id = auth.uid()
    or public.is_super_admin()
  );

drop policy if exists tenants_write on public.tenants;
create policy tenants_write on public.tenants
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- audit_logs / ai_logs / automation_logs  — read-only to org managers.
-- Inserts happen server-side via the service_role key (bypasses RLS) only.
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['audit_logs','ai_logs','automation_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          (organization_id = public.current_user_org_id() and public.is_org_manager())
          or public.is_super_admin()
        )$f$, t || '_select', t);
  end loop;
end $$;

-- ===========================================================================
-- notifications  — each user sees and manages only their own.
-- ===========================================================================
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
-- INSERT: none. Notifications are created server-side.

-- ===========================================================================
-- schema_migrations  — RLS on, no policies: invisible to authenticated.
-- The migration runner connects as the table owner and is unaffected.
-- ===========================================================================
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'schema_migrations') then
    execute 'alter table public.schema_migrations enable row level security';
  end if;
end $$;

-- ===========================================================================
-- table-level grants. RLS filters rows; grants are still required for the
-- authenticated role to reach the tables at all. anon gets nothing.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on public.schema_migrations from authenticated;
