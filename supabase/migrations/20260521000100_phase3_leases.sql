-- ===========================================================================
-- 20260521000100_phase3_leases.sql  —  Phase 3 foundation: leases
--
-- Purely additive. Introduces the lease as a first-class record, distinct from
-- the tenant (person). No existing data migrates, no existing app code changes,
-- no existing RLS policy changes.
--
--   * new enum   public.lease_status ('upcoming','active','ended')
--   * new table  public.leases — org-scoped, unit-linked, RLS-enabled
--   * new column public.tenants.lease_id (nullable FK; existing rows stay NULL)
--
-- Lease linkage was deferred from Phase 1 (see 20260518000400_tenants.sql:
-- "Lease linkage arrives in a later phase"). This migration is that phase's
-- foundation; application code and tenant-portal scoping arrive in later
-- Phase 3 commits.
--
-- RLS on leases mirrors the established org-scoping patterns:
--   * leases_select — org staff (own org), a portal user linked through
--     tenants.lease_id / tenants.user_id, or a platform super-admin.
--   * leases_write  — org managers (own org) or super-admin (ALL command).
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
--
-- The enum guard below fails LOUD if public.lease_status already exists,
-- rather than the silent duplicate_object skip used by 20260518000100_enums.sql.
-- ===========================================================================

-- ---- enum: lease_status (fail loud on pre-existence) ----------------------
do $$
begin
  if exists (
    select 1 from pg_type
    where typname = 'lease_status'
      and typnamespace = 'public'::regnamespace
  ) then
    raise exception
      'enum public.lease_status already exists — aborting 20260521000100_phase3_leases';
  end if;
end $$;

create type public.lease_status as enum ('upcoming', 'active', 'ended');

-- ---- table: leases --------------------------------------------------------
create table if not exists public.leases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id         uuid not null references public.units(id) on delete restrict,
  start_date      date not null,
  end_date        date,
  monthly_rent    numeric(10, 2) not null,
  status          public.lease_status not null default 'upcoming',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists leases_organization_id_idx on public.leases(organization_id);
create index if not exists leases_unit_id_idx on public.leases(unit_id);
create index if not exists leases_status_idx on public.leases(status);
create index if not exists leases_start_date_idx on public.leases(start_date);

-- ---- tenants.lease_id (additive — existing rows stay NULL) ----------------
alter table public.tenants
  add column if not exists lease_id uuid references public.leases(id) on delete set null;
create index if not exists tenants_lease_id_idx on public.tenants(lease_id);

-- ---- updated_at trigger ---------------------------------------------------
drop trigger if exists set_updated_at on public.leases;
create trigger set_updated_at before update on public.leases
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — leases
-- ===========================================================================
alter table public.leases enable row level security;

drop policy if exists leases_select on public.leases;
create policy leases_select on public.leases
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or exists (
      select 1 from public.tenants t
      where t.lease_id = leases.id and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists leases_write on public.leases;
create policy leases_write on public.leases
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
-- grants — RLS filters rows; the authenticated role still needs table grants.
-- Re-applied so the new leases table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
