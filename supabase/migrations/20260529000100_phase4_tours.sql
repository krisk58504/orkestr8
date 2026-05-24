-- ===========================================================================
-- 20260529000100_phase4_tours.sql — Phase 4 slice 9b: tours
--
-- Purely additive. Tours are a sub-concern of leads — every tour belongs to
-- exactly one lead (FK NOT NULL, ON DELETE CASCADE). Per PHASE_4_PLAN.md §5,
-- tours render as a section on the lead detail page rather than as a
-- standalone /tours route; this migration creates only the data surface,
-- not a route.
--
--   * new enum   public.tour_status — 4 values (scheduled, completed,
--                                              no_show, cancelled)
--   * new table  public.tours — org-scoped, lead-scoped, RLS-enabled
--
-- RLS posture (per PHASE_4_PLAN.md §0.5 decision 7 — NARROW read+write):
-- both SELECT and WRITE are gated on can_write_tenants() (= management +
-- leasing roles). MAINTENANCE_TECH cannot read tours. Four discrete
-- policies (select / insert / update / delete) matching the slice 9a
-- leads pattern.
--
-- CROSS-ORG FK PINS (built in from the start — §8.1 pattern):
-- tours_insert and tours_update both verify via EXISTS subqueries that
-- the row's lead_id, unit_id (when non-null), and agent_id (when non-null)
-- all reference rows in the same organization as the tour. This applies
-- the §8.1 cross-FK defense pattern proactively, mirroring the slice 9a
-- follow-up (migration 20260528000200_phase4_leads_cross_org_pin.sql,
-- commit dccbf45) which closed the same gap retroactively on leads.
-- Without these pins, a manager in Org A could create a tour with
-- organization_id = A pointing at Org B's lead/unit/user.
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- §12 sign-off (Phase 4 close) will re-certify Gate 1 for these additions
-- alongside the slice 9a leads policies and the 9a follow-up FK pins.
-- ===========================================================================

-- ---- enum: tour_status (fail-loud guard) ---------------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'tour_status'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.tour_status already exists — aborting 20260529000100_phase4_tours';
  end if;
end $$;

create type public.tour_status as enum (
  'scheduled',
  'completed',
  'no_show',
  'cancelled'
);

-- ---- table: tours --------------------------------------------------------
create table if not exists public.tours (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  unit_id         uuid references public.units(id) on delete set null,
  agent_id        uuid references public.users(id) on delete set null,
  scheduled_at    timestamptz not null,
  status          public.tour_status not null default 'scheduled',
  outcome_notes   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tours_organization_id_idx on public.tours(organization_id);
create index if not exists tours_lead_id_idx on public.tours(lead_id);
create index if not exists tours_agent_id_idx on public.tours(agent_id);
create index if not exists tours_scheduled_at_idx on public.tours(scheduled_at);

-- ---- updated_at trigger --------------------------------------------------
drop trigger if exists set_updated_at on public.tours;
create trigger set_updated_at before update on public.tours
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — tours (narrow read+write + §8.1-pattern cross-org FK pins)
-- ===========================================================================
alter table public.tours enable row level security;

drop policy if exists tours_select on public.tours;
create policy tours_select on public.tours
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists tours_insert on public.tours;
create policy tours_insert on public.tours
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leads l
        where l.id = tours.lead_id
          and l.organization_id = tours.organization_id
      )
      and (
        unit_id is null
        or exists (
          select 1 from public.units u
          where u.id = tours.unit_id
            and u.organization_id = tours.organization_id
        )
      )
      and (
        agent_id is null
        or exists (
          select 1 from public.users usr
          where usr.id = tours.agent_id
            and usr.organization_id = tours.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists tours_update on public.tours;
create policy tours_update on public.tours
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leads l
        where l.id = tours.lead_id
          and l.organization_id = tours.organization_id
      )
      and (
        unit_id is null
        or exists (
          select 1 from public.units u
          where u.id = tours.unit_id
            and u.organization_id = tours.organization_id
        )
      )
      and (
        agent_id is null
        or exists (
          select 1 from public.users usr
          where usr.id = tours.agent_id
            and usr.organization_id = tours.organization_id
        )
      )
    )
    or public.is_super_admin()
  )
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leads l
        where l.id = tours.lead_id
          and l.organization_id = tours.organization_id
      )
      and (
        unit_id is null
        or exists (
          select 1 from public.units u
          where u.id = tours.unit_id
            and u.organization_id = tours.organization_id
        )
      )
      and (
        agent_id is null
        or exists (
          select 1 from public.users usr
          where usr.id = tours.agent_id
            and usr.organization_id = tours.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists tours_delete on public.tours;
create policy tours_delete on public.tours
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new tours table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
