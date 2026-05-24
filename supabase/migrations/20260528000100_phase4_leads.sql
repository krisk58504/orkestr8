-- ===========================================================================
-- 20260528000100_phase4_leads.sql — Phase 4 slice 9a: leads foundation
--
-- Purely additive. Introduces the lead as a first-class prospect record in
-- the Leasing CRM domain, separate from tenants (per PHASE_4_PLAN.md §0.5
-- decision 1: lead↔tenant identity model is SEPARATE records; conversion in
-- slice 9d creates a new tenant row, not a promoted lead).
--
--   * new enum   public.lead_status — 8 values mapping the SPEC pipeline
--   * new enum   public.lead_source — 5 values for source attribution
--   * new table  public.leads — org-scoped, RLS-enabled
--
-- RLS posture (per PHASE_4_PLAN.md §0.5 decision 7 — NARROW read+write):
-- both SELECT and WRITE are gated on can_write_tenants() (= management +
-- leasing roles). This OVERRIDES the original broad-read recommendation
-- from §3d because lead data carries PII (monthly_income, employment status,
-- prior address — surfacing in slice 9c applications, but the read-scope
-- decision is set table-wide here). MAINTENANCE_TECH cannot read leads.
--
-- Four discrete policies (select / insert / update / delete) rather than a
-- single `for all` write policy — matches Phase 3 messaging precedent
-- (M3X tenant_conversation_state) for clearer pg_policies introspection.
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- §12 sign-off (Phase 4 close) will re-certify Gate 1 for these additions.
-- ===========================================================================

-- ---- enums ---------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'lead_status'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.lead_status already exists — aborting 20260528000100_phase4_leads';
  end if;
end $$;

create type public.lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'tour_scheduled',
  'applied',
  'converted',
  'disqualified',
  'lost'
);

do $$
begin
  if exists (select 1 from pg_type
             where typname = 'lead_source'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.lead_source already exists — aborting 20260528000100_phase4_leads';
  end if;
end $$;

create type public.lead_source as enum (
  'website',
  'referral',
  'walkin',
  'partner',
  'other'
);

-- ---- table: leads --------------------------------------------------------
create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  status               public.lead_status not null default 'new',
  source               public.lead_source not null default 'other',
  first_name           text not null,
  last_name            text not null,
  email                text,
  phone                text,
  assigned_to          uuid references public.users(id) on delete set null,
  desired_property_id  uuid references public.properties(id) on delete set null,
  desired_move_in      date,
  desired_bedrooms     int,
  desired_budget       numeric(10, 2),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists leads_organization_id_idx on public.leads(organization_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
create index if not exists leads_desired_property_id_idx on public.leads(desired_property_id);

-- ---- updated_at trigger --------------------------------------------------
drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — leads (narrow read+write per §0.5 decision 7)
-- ===========================================================================
alter table public.leads enable row level security;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new leads table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
