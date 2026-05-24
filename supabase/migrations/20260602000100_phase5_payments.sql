-- ===========================================================================
-- 20260602000100_phase5_payments.sql — Phase 5 slice 10b: payments
--
-- The second Phase 5 migration. Establishes the payments side of the
-- Payments LITE ledger per SPEC.md PAYMENTS LITE FIRST and
-- PHASE_5_PLAN.md §2b. Pairs with slice 10a's rent_charges.
--
--   * new enum   public.payment_method — 8 values (cash / check / ach /
--                                          wire / money_order / zelle /
--                                          card_offline / other)
--   * new table  public.payments       — org-scoped, charge-scoped (FK
--                                          required per §0.5 decision 2),
--                                          tenant-scoped, RLS-enabled
--
-- ===========================================================================
-- SCHEMA RECONCILIATION (authoritative version going forward)
-- ===========================================================================
-- PHASE_5_PLAN.md §2b contained an early sketch that this migration
-- supersedes after the slice 10b read-first audit. The divergences (all
-- documented in the audit proposal accepted 2026-05-24) are:
--
--   * column `amount` renamed → `amount_paid` (semantically clearer;
--     parallel to slice 10a's amount_due)
--   * `payment_date date` renamed → `paid_at timestamptz` (more
--     flexible — PAYMENTS FULL will want exact moments for online
--     payments — and matches the *_at timestamptz naming convention
--     used by created_at, updated_at, voided_at)
--   * `recorded_by` upgraded from nullable (ON DELETE SET NULL) to
--     NOT NULL + ON DELETE RESTRICT — accountability invariant: every
--     payment has an attributable staff recorder. Users are soft-
--     deleted via is_active in this codebase, so hard-delete is rare;
--     if/when a hard-delete user flow ships, a sentinel migration
--     will need to land first. Documented as a forward known-constraint.
--   * REFUND COLUMNS ADDED for forward-compat: refunded_at, refunded_by,
--     refund_reason (all nullable). NO ACTION IN SLICE 10b WRITES THEM.
--     refundPayment is deferred to a future slice (likely paired with
--     the future PAYMENTS FULL refund-via-processor work). Adding the
--     columns now saves an ALTER migration later and mirrors the
--     audit-rich triple shape from slice 10a's void columns.
--   * enum at 8 values dropping "credit" — overlaps with
--     rent_charge_type='credit' from slice 10a (the overpayment-
--     absorption pattern per §0.5 decision 2). Keeping a separate
--     credit payment_method would create audit-log ambiguity.
--
-- §0.5 DECISION 2 (LOAD-BEARING IDENTITY): payments.charge_id is NOT NULL.
-- Every payment row points at exactly one rent_charge. Partial payments
-- link to the same charge multiple times. Overpayments are absorbed via
-- charge_type='credit' rent_charges (NOT by allowing amount > balance on
-- a single charge — the action layer admits over-payments without UI
-- warning per audit decision 9, but the absorption pattern is the
-- documented recovery).
--
-- ===========================================================================
-- RLS posture (per PHASE_5_PLAN.md §3b — narrow write + multi-branch read)
-- ===========================================================================
-- WRITE: `can_write_tenants()` only. MAINTENANCE_TECH cannot write.
--
-- READ: THREE branches per §3b, but slice 10b ships TWO of them:
--   1. `can_write_tenants()` in org    — staff cohort
--   2. tenant-self via tenants.user_id — tenant portal Rent tab (slice 10c)
--
-- The THIRD branch (owner-self via property_owners junction) is **deferred
-- to slice 10e** — drop-and-recreate of payments_select adds it there.
-- Same M3T → M3LU pattern as Phase 3 and as slice 10a's rent_charges.
--
-- ===========================================================================
-- CROSS-ORG FK PINS (built in from the start — §8.1 pattern)
-- ===========================================================================
-- payments_insert and payments_update verify FOUR FKs via EXISTS:
--   * charge_id     — required, must match payments.organization_id
--   * tenant_id     — required, must match payments.organization_id
--   * recorded_by   — required, must match payments.organization_id
--                     (super_admins with NULL org_id are admitted via the
--                     top-level OR is_super_admin() branch which bypasses
--                     the entire FK-pin clause)
--   * refunded_by   — conditional (is null OR same-org); never written by
--                     a slice-10b action but the policy validates it
--                     defensively for the future refundPayment slice
--
-- ===========================================================================
-- AUDIT VOCABULARY (Option A per audit decision 10)
-- ===========================================================================
-- recordPayment / updatePayment / deletePayment may transition the parent
-- rent_charge's status (open ↔ partial ↔ paid). The actions emit TWO
-- audit entries when status changes: payment.* (the direct write) AND
-- rent_charge.status_changed (the cross-table effect, with
-- triggered_by: 'payment.recorded' | 'payment.updated' | 'payment.deleted'
-- + payment_id metadata so the cross-entity audit chain is traceable).
-- Matches the slice 9c pattern of emitting separate audit entries per
-- affected entity (tenant.created + application.approved on convert).
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- §13 sign-off (Phase 5 close) will certify Gate 1 for this addition.
-- ===========================================================================

-- ---- enum: payment_method (fail-loud guard) ------------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'payment_method'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.payment_method already exists — aborting 20260602000100_phase5_payments';
  end if;
end $$;

create type public.payment_method as enum (
  'cash',
  'check',
  'ach',
  'wire',
  'money_order',
  'zelle',
  'card_offline',
  'other'
);

-- ---- table: payments -----------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  charge_id       uuid not null references public.rent_charges(id) on delete restrict,
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  amount_paid     numeric(10, 2) not null,
  paid_at         timestamptz not null,
  method          public.payment_method not null default 'other',
  reference       text,
  notes           text,
  recorded_by     uuid not null references public.users(id) on delete restrict,
  refunded_at     timestamptz,
  refunded_by     uuid references public.users(id) on delete set null,
  refund_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists payments_organization_id_idx on public.payments(organization_id);
create index if not exists payments_charge_id_idx on public.payments(charge_id);
create index if not exists payments_tenant_id_idx on public.payments(tenant_id);
create index if not exists payments_paid_at_idx on public.payments(paid_at);

-- ---- updated_at trigger --------------------------------------------------
drop trigger if exists set_updated_at on public.payments;
create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — payments
--   * SELECT: staff (can_write_tenants) + tenant-self via tenants.user_id
--             (owner-self via property_owners deferred to slice 10e)
--   * INSERT/UPDATE: can_write_tenants + §8.1 four-FK cross-org pins
--   * DELETE: can_write_tenants (corrective deletion; refund is the
--             future-slice alternative path)
-- ===========================================================================
alter table public.payments enable row level security;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or exists (
      select 1 from public.tenants t
      where t.id = payments.tenant_id
        and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.rent_charges rc
        where rc.id = payments.charge_id
          and rc.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = payments.tenant_id
          and t.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.users usr
        where usr.id = payments.recorded_by
          and usr.organization_id = payments.organization_id
      )
      and (
        refunded_by is null
        or exists (
          select 1 from public.users usr2
          where usr2.id = payments.refunded_by
            and usr2.organization_id = payments.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.rent_charges rc
        where rc.id = payments.charge_id
          and rc.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = payments.tenant_id
          and t.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.users usr
        where usr.id = payments.recorded_by
          and usr.organization_id = payments.organization_id
      )
      and (
        refunded_by is null
        or exists (
          select 1 from public.users usr2
          where usr2.id = payments.refunded_by
            and usr2.organization_id = payments.organization_id
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
        select 1 from public.rent_charges rc
        where rc.id = payments.charge_id
          and rc.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = payments.tenant_id
          and t.organization_id = payments.organization_id
      )
      and exists (
        select 1 from public.users usr
        where usr.id = payments.recorded_by
          and usr.organization_id = payments.organization_id
      )
      and (
        refunded_by is null
        or exists (
          select 1 from public.users usr2
          where usr2.id = payments.refunded_by
            and usr2.organization_id = payments.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new payments table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
