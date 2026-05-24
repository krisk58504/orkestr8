-- ===========================================================================
-- 20260601000100_phase5_rent_charges.sql — Phase 5 slice 10a: rent charges
--
-- The first Phase 5 migration. Establishes the ledger-side of the Payments
-- LITE module per SPEC.md PAYMENTS LITE FIRST and PHASE_5_PLAN.md §2a.
--
--   * new enum   public.rent_charge_type   — 5 values (rent / deposit /
--                                            fee / credit / other)
--   * new enum   public.rent_charge_status — 4 values (open / paid /
--                                            partial / voided)
--   * new table  public.rent_charges       — org-scoped, lease-scoped,
--                                            tenant-scoped, unit-scoped,
--                                            RLS-enabled
--
-- ===========================================================================
-- SCHEMA RECONCILIATION (auditoritative version going forward)
-- ===========================================================================
-- PHASE_5_PLAN.md §2a contained an early sketch that this migration
-- supersedes after the slice 10a read-first audit. The divergences (all
-- documented in the audit proposal accepted 2026-05-24) are:
--
--   * column `amount` renamed → `amount_due` (more semantically clear:
--     "what's owed", not "what was paid")
--   * `posted_at` dropped (no scheduled→posted distinction under §0.5
--     decision 1's manual-button workflow — `created_at` is the posted
--     moment for manually-generated charges)
--   * void columns expanded to the audit-rich triple: voided_at +
--     voided_by + void_reason (matches §11.1.6 acceptance-flow audit
--     pattern of when + who + why)
--   * enums prefixed `rent_charge_` (vs the §2a sketch's `charge_`) to
--     avoid future name collision with non-rent charging concepts (work-
--     order charges, vendor invoices, etc.)
--   * status enum at 4 values (open/paid/partial/voided) — the §2a
--     sketch's 5-value scheduled/posted distinction is overkill under
--     §0.5 decision 1's manual-button workflow; defer to PAYMENTS FULL
--
-- §2a `charge_type` and `period_start`/`period_end` columns are retained
-- as originally sketched.
--
-- ===========================================================================
-- RLS posture (per PHASE_5_PLAN.md §3b — narrow write + multi-branch read)
-- ===========================================================================
-- WRITE: `can_write_tenants()` only (= management + LEASING_AGENT).
-- MAINTENANCE_TECH cannot write. ACCOUNTING is not in the cohort.
--
-- READ: THREE branches per §3b, but slice 10a ships TWO of them:
--   1. `can_write_tenants()` in org    — staff cohort
--   2. tenant-self via tenants.user_id — tenant portal Rent tab (slice 10c)
--
-- The THIRD branch (owner-self via property_owners junction) is **deferred
-- to slice 10e**. Slice 10e's migration drops-and-recreates rent_charges_
-- select with the owner-self branch added — same pattern as Phase 3 M3T →
-- M3LU which extended units_select / properties_select. Slice 10a ships
-- the two-branch shape so the tenant portal (slice 10c) can land before
-- the owner portal foundation (slice 10e).
--
-- ===========================================================================
-- CROSS-ORG FK PINS (built in from the start — §8.1 pattern, Phase 4 default)
-- ===========================================================================
-- rent_charges_insert and rent_charges_update both verify via EXISTS
-- subqueries that lease_id, tenant_id, and unit_id ALL reference rows in
-- the same organization as the charge. All three FKs are NOT NULL so
-- there's no `is null OR exists` shape — each EXISTS is unconditional.
-- Without these pins, a manager in Org A could create a charge with
-- organization_id = A pointing at Org B's lease/tenant/unit.
--
-- ===========================================================================
-- NO DB UNIQUE CONSTRAINT on (lease_id, charge_type, period_start, period_end)
-- ===========================================================================
-- The generateChargesForProperty bulk action handles double-click
-- idempotency via an app-layer existence check before each INSERT. A DB
-- UNIQUE would correctly block duplicate-month bulk-generation but also
-- block legitimate same-period charges (supplemental rent on a partial-
-- payment month, mid-period adjustments, separate co-tenant rent
-- charges). Manual single-charge creation via createRentCharge must be
-- allowed to create whatever the staff member needs.
--
-- ===========================================================================
-- KNOWN LIMITATION — single-tenant-per-charge
-- ===========================================================================
-- rent_charges.tenant_id is NOT NULL and references exactly one tenant.
-- For joint leases (two or more tenants sharing a lease with split rent
-- obligations), staff create one rent_charge per tenant manually. A
-- future enhancement could introduce a junction table or a NULL-tenant_id
-- semantic for "this charge applies to the lease, allocate to tenants
-- later," but neither is needed for slice 10a baseline. Will be tracked
-- as a §13 known limitation; revisited if walk-test reveals real
-- friction for property managers with joint-lease portfolios.
--
-- ===========================================================================
-- STATUS TRANSITIONS — app-layer only (per Phase 4 §7 risk 4 precedent)
-- ===========================================================================
-- No RLS RESTRICTIVE policy enforces the status transition map.
-- Transitions:
--   open → partial   (recorded by slice 10b's recordPayment when
--                     sum(payments) < amount_due)
--   open → paid      (recorded by slice 10b's recordPayment when
--                     sum(payments) >= amount_due)
--   partial → paid   (additional payment lands)
--   open → voided    (voidRentCharge action; requires void_reason)
--   partial → voided (voidRentCharge action; admits partial-paid voids
--                     for reconciliation edge cases like refunded
--                     erroneous partial payment)
--   paid → voided    (voidRentCharge action; admits paid voids for
--                     reconciliation edge cases)
-- voided is terminal — voidRentCharge rejects already-voided charges.
--
-- Generated + enabled here; NOT certified production-safe until documented
-- human review (SPEC Gate 1) — see SECURITY_REVIEW.md / RLS_TEST_PLAN.md.
-- §13 sign-off (Phase 5 close) will certify Gate 1 for this addition.
-- ===========================================================================

-- ---- enum: rent_charge_type (fail-loud guard) ----------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'rent_charge_type'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.rent_charge_type already exists — aborting 20260601000100_phase5_rent_charges';
  end if;
end $$;

create type public.rent_charge_type as enum (
  'rent',
  'deposit',
  'fee',
  'credit',
  'other'
);

-- ---- enum: rent_charge_status (fail-loud guard) --------------------------
do $$
begin
  if exists (select 1 from pg_type
             where typname = 'rent_charge_status'
               and typnamespace = 'public'::regnamespace) then
    raise exception 'enum public.rent_charge_status already exists — aborting 20260601000100_phase5_rent_charges';
  end if;
end $$;

create type public.rent_charge_status as enum (
  'open',
  'paid',
  'partial',
  'voided'
);

-- ---- table: rent_charges -------------------------------------------------
create table if not exists public.rent_charges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lease_id        uuid not null references public.leases(id) on delete restrict,
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  unit_id         uuid not null references public.units(id) on delete restrict,
  charge_type     public.rent_charge_type not null default 'rent',
  amount_due      numeric(10, 2) not null,
  due_date        date not null,
  period_start    date,
  period_end      date,
  status          public.rent_charge_status not null default 'open',
  description     text,
  notes           text,
  voided_at       timestamptz,
  voided_by       uuid references public.users(id) on delete set null,
  void_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists rent_charges_organization_id_idx on public.rent_charges(organization_id);
create index if not exists rent_charges_lease_id_idx on public.rent_charges(lease_id);
create index if not exists rent_charges_tenant_id_idx on public.rent_charges(tenant_id);
create index if not exists rent_charges_unit_id_idx on public.rent_charges(unit_id);
create index if not exists rent_charges_status_idx on public.rent_charges(status);
create index if not exists rent_charges_due_date_idx on public.rent_charges(due_date);

-- ---- updated_at trigger --------------------------------------------------
drop trigger if exists set_updated_at on public.rent_charges;
create trigger set_updated_at before update on public.rent_charges
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- RLS — rent_charges
--   * SELECT: staff (can_write_tenants) + tenant-self via tenants.user_id
--             (owner-self via property_owners deferred to slice 10e)
--   * INSERT/UPDATE: can_write_tenants + §8.1 cross-org FK pins
--   * DELETE: can_write_tenants (rarely used — voidRentCharge is the
--             primary lifecycle terminal; delete is for super-admin
--             cleanup of truly erroneous test data)
-- ===========================================================================
alter table public.rent_charges enable row level security;

drop policy if exists rent_charges_select on public.rent_charges;
create policy rent_charges_select on public.rent_charges
  for select to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or exists (
      select 1 from public.tenants t
      where t.id = rent_charges.tenant_id
        and t.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

drop policy if exists rent_charges_insert on public.rent_charges;
create policy rent_charges_insert on public.rent_charges
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leases l
        where l.id = rent_charges.lease_id
          and l.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = rent_charges.tenant_id
          and t.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.units u
        where u.id = rent_charges.unit_id
          and u.organization_id = rent_charges.organization_id
      )
    )
    or public.is_super_admin()
  );

drop policy if exists rent_charges_update on public.rent_charges;
create policy rent_charges_update on public.rent_charges
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leases l
        where l.id = rent_charges.lease_id
          and l.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = rent_charges.tenant_id
          and t.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.units u
        where u.id = rent_charges.unit_id
          and u.organization_id = rent_charges.organization_id
      )
    )
    or public.is_super_admin()
  )
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and exists (
        select 1 from public.leases l
        where l.id = rent_charges.lease_id
          and l.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.tenants t
        where t.id = rent_charges.tenant_id
          and t.organization_id = rent_charges.organization_id
      )
      and exists (
        select 1 from public.units u
        where u.id = rent_charges.unit_id
          and u.organization_id = rent_charges.organization_id
      )
    )
    or public.is_super_admin()
  );

drop policy if exists rent_charges_delete on public.rent_charges;
create policy rent_charges_delete on public.rent_charges
  for delete to authenticated
  using (
    (organization_id = public.current_user_org_id() and public.can_write_tenants())
    or public.is_super_admin()
  );

-- ===========================================================================
-- grants — re-applied so the new rent_charges table is covered.
-- ===========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
