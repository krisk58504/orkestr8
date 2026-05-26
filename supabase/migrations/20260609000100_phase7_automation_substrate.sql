-- ===========================================================================
-- 20260609000100_phase7_automation_substrate.sql — Phase 7 slice 1 (β).
--
-- Ships the automation engine substrate so subsequent Phase 7 slices have
-- the runner + tables to consume. The substrate alone has no user-visible
-- effect — slice 1's concrete consumer is the vendor_doc_expiry handler
-- (app code), which writes here for the first time.
--
-- Five coupled deltas per docs/PHASE_7_SLICE_1_AUDIT.md §2:
--
--   1. automation_mode_type enum — three values: 'disabled' | 'enabled' |
--      'paused'. Per PHASE_7_DECISIONS Q11 (mode split): separate from
--      organizations.ai_mode so cron-only automations can run without
--      forcing AI elevation.
--
--   2. automations table — the parent table that automation_logs.automation_id
--      (Phase 1 staging) now FK-references. One row per (organization,
--      automation_type) pair. Config is jsonb validated by the handler's
--      Zod schema per PHASE_7_PLAN Q10 (B1+jsonb hybrid).
--
--   3. automation_runs table — per-execution rows, separate from
--      automation_logs (which is the audit-log peer). UNIQUE on
--      (automation_id, idempotency_key) is the structural loop-prevention
--      enforcement per PHASE_6_AUDIT_DRAFT.md Section 2 §D option D1.
--
--   4. organizations columns — automation_mode + automation_freeze (+ audit
--      metadata). Per PHASE_7_DECISIONS Q8 (off-switch surface) + Q11
--      (mode split). All values default to "automations continue running"
--      so existing orgs are unaffected on migration.
--
--   5. FK on automation_logs.automation_id — the column has existed since
--      Phase 1 as nullable + unconstrained. Now references automations(id)
--      with ON DELETE SET NULL (audit log history must survive automation
--      deletion).
--
-- Discipline references:
--   * docs/PHASE_7_SLICE_1_AUDIT.md — full slice audit (§1-§11).
--   * PHASE_7_PLAN.md §0.4 — discipline carrying forward from Phase 6.
--   * PHASE_6_PLAN.md §13.5 — SECURITY DEFINER for junction chains
--     (none needed in slice 1 per audit §6.5).
--   * SPEC Gate 2 (line 35-68, 462-477) — AI/automation control gate;
--     RESTRICTIVE policy on automations table is the structural enforcement
--     that AI cannot rewrite its own gates.
-- ===========================================================================

-- ---- 1. automation_mode_type enum ----------------------------------------
do $$ begin
  create type public.automation_mode_type as enum (
    'disabled', 'enabled', 'paused'
  );
exception when duplicate_object then null; end $$;

-- ---- 2. organizations columns (added before automations so the runner's
--          JOIN organizations(automation_mode, automation_freeze) compiles
--          regardless of migration ordering during development) -----------
alter table public.organizations
  add column if not exists automation_mode
    public.automation_mode_type not null default 'enabled',
  add column if not exists automation_freeze boolean not null default false,
  add column if not exists automation_freeze_at timestamptz,
  add column if not exists automation_freeze_by
    uuid references public.users(id) on delete set null;

-- ---- 3. automations table ------------------------------------------------
create table if not exists public.automations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null
                    references public.organizations(id) on delete cascade,
  automation_type   text not null,
  name              text not null check (length(trim(name)) > 0),
  description       text,
  enabled           boolean not null default false,
  schedule_cron     text,
  config            jsonb not null default '{}'::jsonb,
  last_run_at       timestamptz,
  last_run_status   text,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.users(id) on delete set null,
  constraint automations_org_type_unique unique (organization_id, automation_type)
);

create index if not exists automations_org_enabled_idx
  on public.automations (organization_id, enabled)
  where enabled = true;

create index if not exists automations_type_idx
  on public.automations (automation_type);

alter table public.automations enable row level security;

drop policy if exists automations_select on public.automations;
create policy automations_select on public.automations
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_staff())
    or public.is_super_admin()
  );

drop policy if exists automations_write on public.automations;
create policy automations_write on public.automations
  for all to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  )
  with check (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- RESTRICTIVE: AI actor cannot write to automations. Defense-in-depth per
-- PHASE_6_PLAN §0.5 decision 13 + AI_AUTOMATION_SAFETY.md §9 note.
-- Today is_ai_actor() always returns false → policy is a no-op. When a
-- future migration enables an AI write surface, the policy denies any
-- AI-actor attempt to flip automation gates structurally.
drop policy if exists automations_no_ai_writes on public.automations;
create policy automations_no_ai_writes on public.automations
  as restrictive
  for all to authenticated
  using (not public.is_ai_actor())
  with check (not public.is_ai_actor());

-- ---- 4. automation_runs table --------------------------------------------
create table if not exists public.automation_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null
                    references public.organizations(id) on delete cascade,
  automation_id     uuid not null
                    references public.automations(id) on delete cascade,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  status            text not null check (
                      status in ('running', 'ok', 'failed', 'skipped')
                    ),
  idempotency_key   text,
  result            jsonb,
  error_message     text,
  constraint automation_runs_idempotency_unique
    unique (automation_id, idempotency_key)
);

create index if not exists automation_runs_automation_started_idx
  on public.automation_runs (automation_id, started_at desc);

create index if not exists automation_runs_org_started_idx
  on public.automation_runs (organization_id, started_at desc);

alter table public.automation_runs enable row level security;

-- SELECT: managers only — matches the audit-log peer pattern
-- (audit_logs / ai_logs / automation_logs all manager-only).
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.is_org_manager())
    or public.is_super_admin()
  );

-- No client INSERT/UPDATE/DELETE policy. Service-role only via the runner.

-- ---- 5. FK on automation_logs.automation_id -------------------------------
-- Existing column is nullable + unconstrained from Phase 1. Zero existing
-- rows in production (verified) so backfill not required.
-- ON DELETE SET NULL — automation_logs is the audit record; deleting an
-- automation must not delete its log history.
do $$ begin
  alter table public.automation_logs
    add constraint automation_logs_automation_id_fkey
    foreign key (automation_id)
    references public.automations(id)
    on delete set null;
exception when duplicate_object then null; end $$;

-- ---- 6. Grants (RLS filters rows; grants are still required) -------------
grant select, insert, update, delete on public.automations to authenticated;
grant select, insert, update, delete on public.automation_runs to authenticated;
grant all on public.automations to service_role;
grant all on public.automation_runs to service_role;
