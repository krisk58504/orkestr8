-- ===========================================================================
-- 20260530000100_phase4_applications.sql — Phase 4 slice 9c: applications
--
-- Purely additive. Applications are the formal request-to-lease step in the
-- Leasing CRM pipeline. Per PHASE_4_PLAN.md §0.5 decision 1, applications
-- carry denormalized applicant identity (first/last/email/phone) — they
-- outlive their originating lead row (which may be deleted independently)
-- and they serve as the data source for slice 9d's lease conversion.
--
--   * new enum   public.application_status — 6 values (draft, submitted,
--                                                       under_review,
--                                                       approved, rejected,
--                                                       withdrawn)
--   * new table  public.applications — org-scoped, unit-targeted,
--                                       optionally lead-linked
--
-- RLS posture (per PHASE_4_PLAN.md §0.5 decision 7 — NARROW read+write):
-- both SELECT and WRITE are gated on can_write_tenants() (= management +
-- leasing roles). Four discrete policies matching the slice 9a / 9b
-- pattern. Status transition enforcement is INTENTIONALLY in the server
-- action layer (per §7 risk 4) — no RESTRICTIVE policies on this table.
--
-- CROSS-ORG FK PINS (built in from the start — §8.1 pattern, now a
-- Phase 4 default):
-- applications_insert and applications_update verify via EXISTS subqueries
-- that unit_id (required), lead_id (when non-null), and decided_by (when
-- non-null) all reference rows in the same organization as the application.
-- This pattern was established proactively in slice 9b's tours migration
-- (20260529000100) and applied retroactively to leads via the 9a follow-up
-- (20260528000200, commit dccbf45). Slice 9c is the third Phase 4
-- migration with these pins built in; the pattern is now treated as
-- the Phase 4 default rather than a §11.1-style add-on.
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- §12 sign-off (Phase 4 close) will re-certify Gate 1 for these additions
-- alongside the slice 9a/9b additions.
-- ===========================================================================

-- ---- enum: application_status (fail-loud guard) --------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'application_status'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.application_status already exists — aborting 20260530000100_phase4_applications';
  end if;
end $$;

create type public.application_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'withdrawn'
);

-- ---- table: applications -------------------------------------------------
create table if not exists public.applications (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  lead_id                   uuid references public.leads(id) on delete set null,
  unit_id                   uuid not null references public.units(id) on delete restrict,
  status                    public.application_status not null default 'draft',
  applicant_first_name      text not null,
  applicant_last_name       text not null,
  applicant_email           text not null,
  applicant_phone           text,
  desired_move_in           date,
  monthly_income            numeric(10, 2),
  employment_status         text,
  prior_address             text,
  background_check_consent  boolean not null default false,
  submitted_at              timestamptz,
  decided_at                timestamptz,
  decided_by                uuid references public.users(id) on delete set null,
  decision_notes            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists applications_organization_id_idx on public.applications(organization_id);
create index if not exists applications_lead_id_idx on public.applications(lead_id);
create index if not exists applications_unit_id_idx on public.applications(unit_id);
create index if not exists applications_status_idx on public.applications(status);

-- ---- updated_at trigger --------------------------------------------------
drop trigger if exists set_updated_at on public.applications;
create trigger set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — applications (narrow read+write + §8.1-pattern cross-org FK pins)
-- ===========================================================================
alter table public.applications enable row level security;

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.units u
        where u.id = applications.unit_id
          and u.organization_id = applications.organization_id
      )
      and (
        lead_id is null
        or exists (
          select 1 from public.leads l
          where l.id = applications.lead_id
            and l.organization_id = applications.organization_id
        )
      )
      and (
        decided_by is null
        or exists (
          select 1 from public.users usr
          where usr.id = applications.decided_by
            and usr.organization_id = applications.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.units u
        where u.id = applications.unit_id
          and u.organization_id = applications.organization_id
      )
      and (
        lead_id is null
        or exists (
          select 1 from public.leads l
          where l.id = applications.lead_id
            and l.organization_id = applications.organization_id
        )
      )
      and (
        decided_by is null
        or exists (
          select 1 from public.users usr
          where usr.id = applications.decided_by
            and usr.organization_id = applications.organization_id
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
        select 1 from public.units u
        where u.id = applications.unit_id
          and u.organization_id = applications.organization_id
      )
      and (
        lead_id is null
        or exists (
          select 1 from public.leads l
          where l.id = applications.lead_id
            and l.organization_id = applications.organization_id
        )
      )
      and (
        decided_by is null
        or exists (
          select 1 from public.users usr
          where usr.id = applications.decided_by
            and usr.organization_id = applications.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists applications_delete on public.applications;
create policy applications_delete on public.applications
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new applications table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
