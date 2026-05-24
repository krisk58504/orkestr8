# PHASE_5_PLAN.md — Phase 5 build plan (Payments + Owner Portal + Reporting)

> Read SPEC.md before working from this plan. This document paraphrases the
> spec where it is clear and **names ambiguities where it is not**. It does
> not silently resolve them.
>
> Source-of-record snapshot: branch `phase-2-maintenance` at HEAD `3f17867`
> (Phase 4 §12.10 Gate 1 re-certification sign-off). Authored 2026-05-24,
> immediately after Phase 4 closure.

## 0. Spec headline (verbatim)

```
Phase 5:
Payments + owner portal + reporting
```

That is the entire phase header, per SPEC.md line 560-561.

The product surface, also verbatim, from SPEC.md three module sections
(lines 372-388):

```
### PAYMENTS (LITE FIRST)
- Ledger
- Charges
- Payments
- Statements

### OWNER PORTAL
- Portfolio view
- Reports
- AI summaries

### REPORTING
- Occupancy
- Rent roll
- Maintenance
- Vendor performance
- Leasing funnel
```

Four payments bullets, three owner-portal bullets, five report bullets.
**The "LITE FIRST" framing on PAYMENTS is load-bearing** — SPEC explicitly
scopes Phase 5 payments as a ledger + charges + payments + statements
records-keeping system, not as a payment-processor integration.

Plus the core-tables entries (lines 302-303): `rent_charges`, `payments`
— two tables for the entire payments module. No `invoices`,
`payment_methods`, `payment_attempts`, `disputes`, or `refunds`.

Plus three app structure paths (lines 601-602, 610): `/app/payments`,
`/app/reports`, `/app/owner-portal`.

Plus two cross-cutting constraints elsewhere in SPEC:

- Line 30-31 (RLS gate): *"Owner/investor users can only access
  properties linked to their ownership permissions."* — implies an
  owner-property linkage table that is NOT in the SPEC core-tables list;
  Phase 5 must invent it.
- Line 465 (AI gate): *"AI cannot modify financial data"* — explicit
  constraint, not just a default. Honored passively in Phase 5 (no AI
  write paths built); structural enforcement is a Phase 6 concern.

That is the totality of what SPEC names for Phase 5.

## 0.5. Step 0 decisions (closed 2026-05-24)

Ten decisions surfaced during read-first audit; all locked before slice
authoring begins. Each entry records the decision and the reasoning so
edge cases can be judged later without re-litigating the call.

1. **Charges generation: manual + button.** Staff clicks "Generate this
   month's charges" per property; a rent_charges row is inserted per
   active lease with the lease's `monthly_rent`. NO recurring job (no
   Vercel cron, no `pg_cron`, no Supabase scheduled function). Cron is
   non-trivial infrastructure (failure handling, monitoring, partial-month
   logic, idempotency on accidental double-clicks) that isn't in SPEC's
   PAYMENTS LITE bullets. Defer cron-based charge generation to Phase 6
   alongside the Automation engine, which is the natural home for
   trigger→condition→action automations.

2. **Payments ↔ charges link: required FK (`payments.charge_id NOT NULL`).**
   Every payment row points at exactly one rent_charge. One charge can
   receive multiple payments (partial payments allowed) — balance =
   charge.amount minus sum(payments where charge_id = charge.id). Overpayments
   are out of scope; if a tenant pays more than the charge amount, staff
   records two charges (the rent charge + a credit charge) and links the
   payment to the rent charge for the rent portion. Walk-test will reveal
   if this gets clunky; revisit if so.

3. **Owner-property linkage: junction table without `ownership_pct`.**
   New table `public.property_owners (property_id, user_id, created_at,
   created_by)` with composite primary key `(property_id, user_id)`. The
   `ownership_pct` column has real semantic load (does it affect what
   they see? what they're owed? does it have to sum to 100%? what if it
   doesn't?) — add it later when a concrete use case appears. Phase 5
   only needs boolean ownership visibility.

4. **Owner-portal identity model: OWNER stays staff; INVESTOR is portal-
   restricted; `property_owners` is identity-agnostic.** The `user_role`
   enum already contains both. OWNER behaves as full-org staff per Phase
   1 (`is_org_manager()` resolves true) — no change. INVESTOR is the new
   portal-restricted identity, analog of how `VENDOR_ADMIN` / `VENDOR_TECH`
   split from staff in Phase 2's vendor portal. **Dual-mode access:** a
   single user can hold BOTH OWNER (staff) AND INVESTOR (portal) roles —
   small landlords who operate their own portfolio see the staff app
   (`/dashboard`, `/leases`, etc.) AND the owner portal
   (`/owner-portal/*`) without contortion. The `property_owners` junction
   doesn't care about staff vs. portal — it records ownership.

5. **Reports: ship all 5 in Phase 5.** Occupancy, Rent roll, Maintenance,
   Vendor performance, Leasing funnel — all named in SPEC §"REPORTING".
   Four of the five run against data that already exists (Phase 1
   properties/units, Phase 2 maintenance/vendors, Phase 4 leasing); only
   Rent roll depends on Phase 5 charges/payments. Reports are
   structurally repetitive (read-only aggregations + Recharts compositions)
   so building all 5 in one slice is more efficient than serializing.

6. **Statements: HTML-only with print stylesheet.** Browser-print to PDF
   covers the "tenant wants a paper copy" use case. Real PDF generation
   (puppeteer, React-PDF, jsPDF) is a heavy dependency with deployment
   concerns (Vercel function memory ceilings, cold-start time, font
   licensing). Defer real PDF until walk-test reveals tenants/owners
   need email-attached statements as PDF files.

7. **Online payment processing: explicitly deferred to a future
   "PAYMENTS FULL" phase.** Documented in §9 as a non-deliverable.
   That future phase is also where Gate 5 ("no real charges without
   human authorization") lands — see §4. Don't number the future phase
   yet; just record the deferral.

8. **Tenant-portal Rent tab: read-only.** Tenant sees own charges
   (open / paid / partial / voided), own payments (date, amount, method,
   reference), and computed balance. NO self-reporting payment flow
   ("I paid via Zelle"). Self-reporting is CRM noise without actual
   money movement; it creates pending-confirmation states that staff
   must triage. Walk-test will reveal if tenants want a way to flag
   "I sent payment via X" — the natural answer is a Phase 6 comment
   field on a charge or a document-upload (statement screenshot, Zelle
   confirmation), neither of which belongs in Phase 5.

9. **Email vocabulary expansion: zero new templates in Phase 5.** Gate
   3 surface stays unchanged. Payment receipts, statement-ready
   notifications, and charge-posted notifications are all
   payment-event-driven and naturally pair with the Phase 6 Automation
   engine. Shipping `payment.received` in Phase 5 means one-off send
   logic in `recordPayment`; shipping it in Phase 6 means it's
   automation-engine-driven (trigger: payment.recorded; action: send
   `payment.received` template). The latter is the right architectural
   home.

10. **Rent-roll delinquency aging: include 30/60/90+ buckets.** Aging
    isn't a named SPEC bullet, but it's the standard partner to a rent
    roll in any real PMS context. Data is trivial to compute
    (`days_past_due = current_date - charge.due_date` for unpaid
    charges, bucketed). Without aging the rent-roll report is
    incomplete. Include it under the existing "Rent roll" report bullet
    rather than as a separate report.

These ten decisions are locked. Slice 10a authoring begins after this
update. Any deviation discovered during execution requires re-opening
the decision here, not silently changing implementation.

## 1. SCOPE

### What SPEC says Phase 5 includes

The eleven bullets across PAYMENTS / OWNER PORTAL / REPORTING:

- **Ledger** — running balance per tenant: `sum(charges) - sum(payments)`.
- **Charges** — `rent_charges` table; staff records what tenants owe.
- **Payments** — `payments` table; staff records what tenants paid.
- **Statements** — per-tenant HTML statement view; date-range filter;
  browser-print to PDF.
- **Portfolio view** (owner portal) — INVESTOR sees properties they
  own; basic occupancy / unit count / lease status per property.
- **Reports** (owner portal) — owner-scoped subset of the staff Reports.
- **AI summaries** (owner portal) — **out of scope for Phase 5** per
  Phase 6 dependency (see §9).
- **Occupancy** — Phase 1 data; units occupied vs vacant per property.
- **Rent roll** — Phase 5 data (charges + payments) + Phase 4 data
  (leases); current charges-vs-payments-vs-balance per active lease,
  with 30/60/90+ aging.
- **Maintenance** — Phase 2 data; request volume + average resolution
  time + open vs closed counts.
- **Vendor performance** — Phase 2 data; per-vendor on-time rate +
  rating average.
- **Leasing funnel** — Phase 4 data; lead-to-conversion ratio by source +
  pipeline stage distribution.

### What SPEC says Phase 5 does NOT include

The PAYMENTS bullet list is "LITE FIRST." Everything below is the FULL
counterpart and lives in a future phase (see §9 for the full deferral
list):

| Excluded item | Why deferred |
|---|---|
| Online payment processing (Stripe, etc.) | Not named in SPEC; "LITE FIRST" framing on PAYMENTS |
| Payment-method storage (card / ACH details) | Not named; no processor → no methods to store |
| Webhook handlers (payment.succeeded, refund.created, etc.) | No processor → no webhooks |
| Recurring auto-charge / scheduled charge generation | §0.5 decision 1 — manual + button in Phase 5 |
| Late fees + grace periods | Not named in SPEC |
| Owner payouts (funds-to-owner side) | Owner portal is "Portfolio view + Reports + AI summaries" — no payout surface |
| Refunds and disputes | Not named in SPEC |
| Real PDF statement generation | §0.5 decision 6 — HTML + print stylesheet only |
| AI summaries in owner portal | Phase 6 dependency (Automation + AI engine) |
| Payment-event email templates (receipts, etc.) | §0.5 decision 9 — Phase 6 Automation engine home |
| Statement delivery via email (attached PDF) | Couples to PDF + email vocabulary — both deferred |
| Tenant-side self-reported payments | §0.5 decision 8 — read-only Rent tab |
| Bulk charge import / CSV upload | Not in SPEC |
| Charge templates (recurring rules per lease) | Couples to cron — Phase 6 |
| `ownership_pct` on property_owners junction | §0.5 decision 3 — add when use case appears |
| Owner approval of maintenance requests | Not in owner portal bullets |
| Investor-class reporting (capital accounts, distributions, K-1s) | Not in SPEC; tax-domain — far-future phase |

### Phase 1-4 integration touchpoints

Phase 5 is the second phase (after Phase 4) that lights up
infrastructure earlier phases left dormant. Four load-bearing
touchpoints:

1. **`public.leases` (Phase 3 M3L).** Phase 5 `rent_charges` joins to
   leases via `lease_id` (NOT NULL). The charge's `period_start` /
   `period_end` should fall within `lease.start_date` / `lease.end_date`
   (app-layer validation, not RLS-enforced — same pattern as Phase 4
   application_status transitions per §7 risk).
2. **`public.tenants` (Phase 1).** Phase 5 `rent_charges` and `payments`
   both reference `tenant_id` (NOT NULL) for direct addressing and for
   the tenant-self portal branches. The denormalized link (vs.
   chasing `lease → tenants.lease_id`) keeps tenant-portal reads simple
   and stable across lease changes (a tenant who ends one lease and
   starts another retains their historical charges).
3. **`public.properties` (Phase 1).** Phase 5 introduces
   `property_owners (property_id, user_id)` as the new junction. The
   owner-self RLS branches on `properties_select` / `units_select` /
   `leases_select` / `rent_charges_select` / `payments_select` all key
   on this junction. **Properties is the root of the owner-self chain**
   — units / leases / charges / payments all reach it through known
   FKs.
4. **`public.users` (Phase 1) with INVESTOR role.** The INVESTOR role
   exists in the `user_role` enum from Phase 1 but has been unused. Phase
   5 wires it as a portal-restricted identity (analog of vendor-portal
   `VENDOR_ADMIN` / `VENDOR_TECH`). A user holding INVESTOR is admitted
   to `/owner-portal/*` routes via a Phase-5-new `isInvestor()` helper.
   **Dual-mode access** (§0.5 decision 4): a user can hold BOTH OWNER
   (staff) AND INVESTOR (portal) — both surfaces work for them.

Phase 5 does NOT introduce any new external user identity beyond
INVESTOR. The `LEASING_AGENT` cohort from Phase 4 sees Phase 5 payments
via the `can_write_tenants()` gate already established.

### Cross-phase layering — minor

Unlike Phase 3 (whose tenant-portal bullet cut across multiple future
phases), Phase 5 stays cleanly inside its own scope. The two cross-
phase boundaries worth flagging:

- **AI summaries in owner portal (SPEC line 381) is a Phase 6 dependency.**
  Surface area is not built in Phase 5; the portal page renders without
  it; Phase 6 will add the summary card when AI shipping. Documented in
  §9.
- **Payment-event emails (receipts, statement notifications) are a
  Phase 6 dependency.** Same shape — payment events fire `logAudit`
  entries that the Phase 6 Automation engine can trigger off; no
  Phase-5-direct email path.

## 2. NEW TABLES AND COLUMNS

The spec names two tables (`rent_charges`, `payments`) and implies a
third (owner-property linkage). The column shapes below are derived
from the bullets, not directly quoted from SPEC. Treat each as a
planning hypothesis to be confirmed before the migration.

### 2a. `rent_charges` (slice 10a)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | isolation column |
| `lease_id` | `uuid not null references leases(id) on delete restrict` | charge cannot orphan a lease deletion |
| `tenant_id` | `uuid not null references tenants(id) on delete restrict` | denormalized for direct addressing + tenant-self reads |
| `unit_id` | `uuid not null references units(id) on delete restrict` | denormalized for rent-roll grouping |
| `charge_type` | `public.charge_type not null default 'rent'` | enum, see below |
| `amount` | `numeric(10, 2) not null` | positive |
| `due_date` | `date not null` | |
| `period_start` | `date` | nullable for non-rent charges (one-time fees) |
| `period_end` | `date` | nullable for non-rent charges |
| `status` | `public.charge_status not null default 'open'` | enum, see below |
| `description` | `text` | free-form (e.g. "April 2026 rent") |
| `notes` | `text` | staff-internal notes |
| `voided_at` | `timestamptz` | set when status → 'voided' |
| `voided_by` | `uuid references users(id) on delete set null` | who voided |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | trigger-maintained |

**Enums:**

- `public.charge_type`: `'rent' | 'deposit' | 'fee' | 'credit' | 'other'`
  — `'credit'` is the overpayment-absorption pattern per §0.5 decision 2.
- `public.charge_status`: `'open' | 'paid' | 'partial' | 'voided'` —
  `'paid'` and `'partial'` are computed (`sum(payments.amount) >=
  charge.amount` vs `sum > 0 AND sum < amount`); they can be stored as
  a denormalized cache or always-computed (TBD slice 10a). `'voided'`
  is a terminal explicit transition by staff.

**Indexes worth pre-declaring:**

- `rent_charges_organization_id_idx` — every list query filters by org
- `rent_charges_lease_id_idx` — lease-detail page reads charges per lease
- `rent_charges_tenant_id_idx` — tenant-portal Rent tab + tenant-self RLS
- `rent_charges_unit_id_idx` — rent-roll grouping
- `rent_charges_status_idx` — open-vs-paid filtering
- `rent_charges_due_date_idx` — aging buckets + date-range filters

**Trigger:** standard `set_updated_at` before-update trigger.

### 2b. `payments` (slice 10b)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | |
| `charge_id` | `uuid not null references rent_charges(id) on delete restrict` | **REQUIRED FK** per §0.5 decision 2 |
| `tenant_id` | `uuid not null references tenants(id) on delete restrict` | denormalized for tenant-self reads |
| `amount` | `numeric(10, 2) not null` | positive |
| `payment_date` | `date not null` | when the money was actually received |
| `method` | `public.payment_method not null default 'other'` | enum, see below |
| `reference` | `text` | check number, transaction id, etc. |
| `notes` | `text` | |
| `recorded_by` | `uuid references users(id) on delete set null` | who entered the payment |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |

**Enum:**

- `public.payment_method`: `'check' | 'cash' | 'ach' | 'zelle' | 'card_offline' | 'other'`
  — `'card_offline'` covers "tenant paid via a card terminal we don't
  integrate with"; **no online card processing is in Phase 5** per §0.5
  decision 7.

**Indexes:**

- `payments_organization_id_idx`
- `payments_charge_id_idx` — balance computation joins this
- `payments_tenant_id_idx` — tenant-portal Rent tab + tenant-self RLS
- `payments_payment_date_idx` — date-range filters

**Trigger:** standard `set_updated_at`.

**No refund/dispute fields.** Per §0.5 decision 7 (no online processing
in Phase 5) refunds and disputes are processor-integration concerns,
not LITE-payments concerns. Recording a refund in LITE is "delete the
original payment row" (with audit trail capturing the deletion). Walk-
test will reveal if a dedicated refund flow is warranted; until then,
delete is the recovery path.

### 2c. `property_owners` (slice 10e)

| Column | Type | Notes |
|---|---|---|
| `property_id` | `uuid not null references properties(id) on delete cascade` | composite PK |
| `user_id` | `uuid not null references users(id) on delete cascade` | composite PK |
| `created_at` | `timestamptz not null default now()` | |
| `created_by` | `uuid references users(id) on delete set null` | who granted ownership |

Composite primary key: `(property_id, user_id)`. **No `ownership_pct`**
per §0.5 decision 3.

**No `organization_id` column.** Both `properties` and `users` carry
`organization_id` already; the junction inherits org scoping via its
FKs. The RLS policy (see §3) verifies both FK targets are in the
caller's org (§8.1 cross-org FK pin pattern, now the established
default).

**Indexes:**

- `property_owners_user_id_idx` — owner-self RLS branches read this
  side ("which properties does this user own?")
- Primary key covers `(property_id, user_id)` lookup natively.

**No trigger** (no `updated_at` — the junction is insert/delete only;
ownership isn't "edited," it's granted or revoked).

### 2d. No other column changes on existing tables in Phase 5.

`public.users` does NOT get an `is_investor` column — INVESTOR
membership is determined by `user_roles` enum membership (existing
shape). `public.properties` does NOT get a denormalized
`owner_user_ids[]` array. Both would be anti-patterns vs. the junction
table.

## 3. NEW RLS SHAPES

### 3a. The linchpin question — RESOLVED via §0.5 decision 4

**Phase 5's linchpin is the owner-portal identity model.** Unlike Phase
3's identity question (tenant.user_id vs users.tenant_id), Phase 5
inherits the relevant infrastructure: the INVESTOR role exists in the
enum since Phase 1, `users.organization_id` is set on signup, the
`property_owners` junction (§2c) supplies the property-mediated
isolation key. **No new column on `public.users` is needed.** No
analog of Phase 3's `protect_user_columns` extension. The linchpin
question collapses to "junction table or array column" and §0.5
decision 3 answered it: junction.

### 3b. RLS shape per new table

All three new tables (`rent_charges`, `payments`, `property_owners`)
follow established patterns from Phase 1-4. **None of the three is a
narrow-write table only** — they each need at least one tenant-self or
owner-self read branch, which makes their shape closer to Phase 3
`leases` / `messages` than to Phase 4 leasing tables.

#### rent_charges and payments — read has THREE branches

| Operation | Cohorts admitted |
|---|---|
| SELECT | (a) `can_write_tenants()` in org; (b) **tenant-self** via `tenants.user_id = auth.uid()` AND `tenants.id = rent_charges.tenant_id` (or `payments.tenant_id`); (c) **owner-self** via `property_owners → properties → units → leases → rent_charges` chain (or via `units` for `payments` joined through the charge); (d) `is_super_admin()` |
| INSERT / UPDATE / DELETE | `can_write_tenants()` in org **OR** `is_super_admin()`; tenants and INVESTOR users cannot mutate financial data |

**Tenant-self branch** for `rent_charges_select`:
```sql
EXISTS (
  SELECT 1 FROM public.tenants t
  WHERE t.id = rent_charges.tenant_id
    AND t.user_id = auth.uid()
)
```
Mirrors the M3M `maintenance_requests_select` tenant-by-tenant_id
branch exactly. Direct tenant_id join (no lease chain) — same posture
as M3M.

**Owner-self branch** for `rent_charges_select`:
```sql
EXISTS (
  SELECT 1 FROM public.property_owners po
  JOIN public.units u ON u.property_id = po.property_id
  JOIN public.leases l ON l.unit_id = u.id
  WHERE l.id = rent_charges.lease_id
    AND po.user_id = auth.uid()
)
```
Three-table join (property_owners → units → leases), keyed on the
charge's `lease_id`. Reviewer attention: this is the **novel pattern**
for §13.5 — junction-table-mediated isolation (see 3e).

For `payments_select` the owner-self branch joins one extra step
(`payments.charge_id → rent_charges.lease_id → ...`) — four-table
join. Acceptable for read frequency; index on `payments.charge_id`
covers it.

#### property_owners — read by org staff + the linked user; write manager-only

| Operation | Cohorts admitted |
|---|---|
| SELECT | (a) `is_org_staff()` in the org of either FK target; (b) `auth.uid() = user_id` (the INVESTOR sees their own ownership rows); (c) `is_super_admin()` |
| INSERT / UPDATE / DELETE | `is_org_manager()` in the property's org **OR** `is_super_admin()`; LEASING_AGENT does NOT have grant-ownership authority |

Write authority is manager-only (NOT `can_write_tenants()`) because
granting ownership is closer in stakes to "change billing details" than
to "edit a tenant record." Matches the manager-only posture of M3L
leases write.

### 3c. The §8.1 cross-org FK pin pattern — now the established default

Phase 4 propagated the pattern to three tables; Phase 5 continues it as
the default-from-the-start. Each new table's INSERT/UPDATE policies
must verify ALL FK columns reference same-org rows via EXISTS
subqueries:

- **rent_charges**: `lease_id` (required), `tenant_id` (required),
  `unit_id` (required) — all three must match `organization_id`.
- **payments**: `charge_id` (required, must match
  `payments.organization_id`), `tenant_id` (required).
- **property_owners**: `property_id` (required, FK target's org must
  match caller's org), `user_id` (required, FK target's org must match
  caller's org).

Test coverage: per-FK rejection assertions in Suite 14 (see §6).

### 3d. Owner-self branch on EXISTING tables

Phase 5's owner portal needs read visibility on multiple existing
tables for the portfolio view + reports. Each requires a new SELECT
branch keyed on the `property_owners` junction. The drop-and-recreate
pattern from Phase 3 M3T/M3LU applies — the existing policies are
extended, not replaced wholesale.

| Table | New branch (added to existing `_select` policy) |
|---|---|
| `properties_select` | `EXISTS (SELECT 1 FROM property_owners po WHERE po.property_id = properties.id AND po.user_id = auth.uid())` |
| `units_select` | `EXISTS (SELECT 1 FROM property_owners po WHERE po.property_id = units.property_id AND po.user_id = auth.uid())` |
| `buildings_select` | `EXISTS (SELECT 1 FROM property_owners po WHERE po.property_id = buildings.property_id AND po.user_id = auth.uid())` — closes the §11.5 item 1 gap (buildings_select tenant-self was deferred; owner-self is its first reader) |
| `leases_select` | new fourth branch: `EXISTS (SELECT 1 FROM property_owners po JOIN units u ON u.property_id = po.property_id WHERE u.id = leases.unit_id AND po.user_id = auth.uid())` |
| `rent_charges_select` | covered in 3b above (owner-self is part of the policy from the start) |
| `payments_select` | covered in 3b above |

**Migration approach.** Single Phase 5 migration that drops and
recreates the five existing `_select` policies (`properties`,
`units`, `buildings`, `leases`, plus the new `rent_charges` and
`payments` policies created elsewhere). All existing branches
(staff, tenant-self direct, tenant-self lease-mediated where
applicable, super-admin) are preserved verbatim; the owner-self
branch is appended as a new `OR EXISTS (...)`.

### 3e. The novel pattern — flagged for §13.5 reviewer attention

**Pattern: junction-table-mediated isolation.** Phase 3's tenant-self
pattern reached its target table via a direct FK from `public.tenants`
(or via a one-hop join through `leases`). Phase 5's owner-self pattern
reaches every visible row via the `property_owners` junction, which is
itself a many-to-many resolution table.

Structurally analogous to M3T's tenant-self direct branches and
M3LU's tenant-self lease-mediated branches, but with one extra hop:
the junction → property → (unit / lease / charge / payment) chain.
This is genuinely new compared to anything in §11.1 / §12.1.

**§13.5 callout language** (drafted now to lock the framing):

> Pattern N — Junction-table-mediated portal isolation
> (`property_owners` for INVESTOR users, Phase 5). The owner portal
> identifies INVESTOR users; each INVESTOR sees only properties (and
> their units / leases / charges / payments) where a row in
> `property_owners` links `auth.uid()` to the property. Unlike
> Phase 3's tenant-self pattern (single-FK chain via
> `tenants.user_id`), the INVESTOR chain goes through a junction
> table, which has subtly different semantics for write authority
> (the junction is managed by org managers, not by the INVESTOR
> themselves — an INVESTOR cannot grant themselves additional
> property visibility). Reviewer attention: validate that
> `property_owners_insert` / `_update` / `_delete` are manager-only
> (not `is_investor()` or `can_write_tenants()`); that the read
> branches on the five extended `_select` policies (3d) all match
> the same junction-chain shape; and that the §8.1 cross-org FK
> pin pattern applies to junction writes (both `property_id` and
> `user_id` must resolve to rows in the manager's org).

## 4. NEW GATES

**Per SPEC, Phase 5 does not name a new gate.** SPEC defines exactly
four gates (1: RLS, 2: AI/automation, 3: Email, 4: Production
deployment) and Phase 5 extends only one of them:

| Gate | Phase 5 extension |
|---|---|
| **Gate 1 (RLS)** | Three new tables (`rent_charges`, `payments`, `property_owners`) with 8-10 new policies; the owner-self branch added to five existing `_select` policies (drop-and-recreate per §3d); the §8.1 cross-org FK pin pattern propagated to all new write policies + the `property_owners` write policy. **No modifications to Phase 1-4 surface that's already certified under §11 / §12.** Owner-self branch additions are *extensions* of existing policies — they preserve all prior branches verbatim — but per the M3T / M3LU drop-and-recreate precedent, the §13 reviewer should re-verify the preserved branches survived the recreation byte-for-byte. |
| **Gate 2 (AI/automation)** | Untouched in active code, but **honored passively** — SPEC line 465 says "AI cannot modify financial data" and Phase 5 builds the financial data tables. The passive enforcement is: no AI write paths exist anywhere in Phase 5 server actions. **Structural enforcement** (a RESTRICTIVE policy keyed on an `is_ai_actor()` helper that disallows writes to `rent_charges` / `payments`) is deferred to Phase 6 where AI shipping requires it. Documented in §9. |
| **Gate 3 (Email)** | Untouched per §0.5 decision 9 — zero new templates in Phase 5. |
| **Gate 4 (Production)** | Untouched. |

**Phase 5 does NOT introduce a Gate 5.** Reasoning:

- No money actually moves (no payment processor integration per §0.5
  decision 7) → no PCI scope, no webhook security, no idempotency
  surface, no reconciliation drift between DB and processor state.
- Financial data sensitivity is real but Gate 1 (RLS isolation) +
  audit-log completeness (already required by Gate 1 implicit) cover
  it.

**Forward note**: a **Gate 5 — "no real charges without human
authorization"** absolutely WILL be needed when online payment
processing is added in the future PAYMENTS FULL phase. Document in §9
as deferred; the Phase-N+ plan that picks up PAYMENTS FULL will
propose Gate 5 explicitly at that time. **Not a Phase 5 concern.**

## 5. SERVER ACTIONS AND UI SURFACE

Just the list — not specifications.

### Routes (staff app)

- `/payments` — payments landing. Two tabs (charges / payments) OR
  split into `/payments/charges` + `/payments/payments` (slice 10a/10b
  UI choice).
- `/payments/charges/[chargeId]` — charge detail with linked payments
  + balance.
- `/payments/statements/[tenantId]` — per-tenant statement view; date-
  range query param; print stylesheet.
- `/reports` — reports landing (5 cards linking to individual reports).
- `/reports/occupancy` — Occupancy report.
- `/reports/rent-roll` — Rent roll + 30/60/90+ aging.
- `/reports/maintenance` — Maintenance report.
- `/reports/vendor-performance` — Vendor performance report.
- `/reports/leasing-funnel` — Leasing funnel report.

### Routes (owner portal)

- `/owner-portal` — portfolio landing (list of owned properties +
  occupancy summary per property).
- `/owner-portal/properties/[propertyId]` — single-property detail
  (units + leases + maintenance summary for that property).
- `/owner-portal/reports` — owner-scoped reports landing (subset of
  staff reports, scoped to owned properties).
- `/owner-portal/reports/[reportName]` — individual owner-scoped
  report (mirrors `/reports/[reportName]` structure with implicit
  property filter).

### Routes (tenant portal)

- `/portal/rent` — Rent tab (charges + payments + balance). Extension
  of the existing `/portal/*` structure from Phase 3.

### Server actions (high level)

**`src/app/(app)/payments/actions.ts`** (slice 10a + 10b):
- `createCharge(input)` — staff records a single charge.
- `updateCharge(id, input)` — edit before any payment lands; once
  payments link, only `notes` editable.
- `voidCharge(id, reason)` — status → 'voided'; stamps
  `voided_at`/`voided_by`; preserves payment links.
- `recordPayment(input)` — staff records a payment against a charge;
  recomputes the charge's effective status.
- `updatePayment(id, input)` — staff fixes a recording error.
- `deletePayment(id)` — staff reverses a wrongly-recorded payment;
  audit log captures full payload pre-delete.

**`src/app/(app)/payments/charges/bulk-actions.ts`** (slice 10a):
- `generateChargesForProperty(propertyId, period_start, period_end)` —
  the §0.5 decision 1 manual button. Inserts one charge per active
  lease in the property for the given period. Idempotent on
  (lease_id, period_start, period_end) — running twice in the same
  month does NOT double-charge.

**`src/app/(app)/owner-portal/actions.ts`** (slice 10e):
- Mostly read-only; staff-side grant flow lives in
  `src/app/(app)/properties/[id]/owner-actions.ts`:
  - `grantPropertyOwnership(propertyId, userId)` — manager grants
    INVESTOR access to a user.
  - `revokePropertyOwnership(propertyId, userId)` — manager revokes.

### Components

- `src/components/payments/charges-view.tsx` — DataTable list view
  (slice 10a).
- `src/components/payments/charge-form-sheet.tsx` — mirror of
  `lead-form-sheet.tsx` (slice 10a).
- `src/components/payments/payments-view.tsx` — DataTable list view
  (slice 10b).
- `src/components/payments/payment-form-sheet.tsx` — mirror; pre-fills
  amount from selected charge (slice 10b).
- `src/components/payments/balance-card.tsx` — shared balance display
  (used by `/payments`, `/portal/rent`, `/owner-portal/*`) — single
  source of truth for the balance computation per §7 risk 4.
- `src/components/portal/rent-tab.tsx` — tenant-portal Rent tab
  (slice 10c).
- `src/components/payments/statement-view.tsx` — HTML statement
  composition with print stylesheet (slice 10d).
- `src/components/owner-portal/portfolio-view.tsx` — owner portfolio
  landing (slice 10e).
- `src/components/owner-portal/property-owners-section.tsx` — staff-
  side affordance on `/properties/[id]` for granting/revoking
  INVESTOR access (slice 10e).
- `src/components/reports/*` — five report pages + shared chart
  components (slice 10f).
- `src/components/owner-portal/owner-report-views.tsx` — owner-scoped
  variants of the report compositions (slice 10g).

## 6. TEST STRATEGY

**One new RLS test suite (Suite 14)** covering all Phase 5 RLS surface.
Single-file shape mirrors Phase 4 Suite 13's "single suite for the
whole phase" pattern, but with more assertions because the owner-self
branch propagates across multiple tables.

| File | Proves |
|---|---|
| `supabase/tests/rls_phase5_payments_owner.sql` | (a) `can_write_tenants()` gating on write for rent_charges and payments; MAINTENANCE_TECH cannot write. (b) Cross-org isolation per standard pattern. (c) Tenant-self read branches on rent_charges and payments — tenant T1 sees own charges/payments only. (d) **Owner-self read branches on FIVE tables** (properties, units, buildings, leases, rent_charges, payments) — INVESTOR I1 with `property_owners(P1, I1)` sees P1's chain only; does NOT see P2's chain (owned by I2 in same org); does NOT see cross-org. (e) §8.1 cross-org FK pin rejection on each FK column of rent_charges (lease_id, tenant_id, unit_id), payments (charge_id, tenant_id), property_owners (property_id, user_id). (f) `property_owners` write authority is manager-only (LEASING_AGENT rejected; INVESTOR rejected). (g) Dual-mode access regression: a user holding both OWNER and INVESTOR roles sees `/dashboard` data via OWNER + `/owner-portal` data via INVESTOR; no interference. |

Pattern mirrors **Phase 4 Suite 13** (single-file for the whole phase)
with assertion-prefix grouping per concern:

- `C1–C8` — rent_charges (charges)
- `Y1–Y8` — payments (Y for "pYment" — P is taken by Phase 2 / Suite 2)
- `O1–O12` — owner-self branches across the 5 extended tables (3 per
  table × 4 cohort permutations roughly)
- `J1–J6` — property_owners junction (write authority + cross-org pins)
- `D1–D2` — dual-mode access regressions

**UUID prefix**: pick `f1` (unused — `e1` was Phase 4 Suite 13).
Pre-flight check at slice authoring: `grep -lE "f1[0-9a-f]{6}-"
supabase/tests/*.sql` must return zero files.

Estimated assertion count: **~36** (8 + 8 + 12 + 6 + 2). Larger than
Suite 13's 31 because the owner-self branch propagates across more
tables.

**Regressions that must be re-verified after Phase 5 migrations:**

- All 13 existing suites — same drill as Phase 4 closure. Particular
  attention to:
  - **Suite 7 (leases tenant-self)** — Phase 5 extends `leases_select`
    with a fourth branch (owner-self lease-mediated). The existing
    tenant-self branches MUST survive the drop-and-recreate verbatim.
  - **Suite 10 (units/properties tenant-self)** — same shape; the
    units_select / properties_select tenant-self branches must survive.
  - **Suite 12 (messages immutability)** — Phase 5 does not touch
    messages but a regression run confirms.

## 7. RISKS AND OPEN QUESTIONS

The ten Step 0 questions surfaced during read-first audit were resolved
in §0.5 and are NOT duplicated here. Four genuine risks remain — these
are not decisions but ongoing surface-area concerns that need
resolution mechanisms.

1. **Cross-org financial isolation.** A bug here means an organization
   sees another's rent charges / payments. Same shape as every prior
   Gate 1 isolation concern.
   - Resolution: standard 4-policy-per-table RLS shape + §8.1 cross-
     org FK pin pattern on every new write policy.
   - Test coverage: Suite 14 C-group, Y-group, J-group (cross-org
     rejection per FK column).
   - Status: covered by established pattern; reviewer attention
     should focus on the §8.1 pins being present on every FK column.

2. **Owner-property linkage isolation.** A bug here means INVESTOR
   sees properties they don't own (or doesn't see properties they do
   own). **NEW identity wiring**; this is the load-bearing Phase 5
   risk.
   - Resolution: junction-table-mediated read branches per §3d;
     manager-only write authority on `property_owners` per §3b;
     §8.1 cross-org FK pin on both `property_id` and `user_id` of
     the junction.
   - Test coverage: Suite 14 O-group (12 assertions across 5 extended
     tables + 1 new pattern) + J-group (write authority).
   - Status: novel pattern flagged for §13.5; reviewer attention
     follows the §3e callout language.

3. **Audit-log completeness for financial events.** Already required
   by Gate 1 implicit; Phase 5 just extends the vocabulary. A bug
   here means a financial mutation occurs without an audit-log entry,
   which violates the "every write logged" invariant.
   - Resolution: every Phase 5 server action calls the existing
     `logAudit()` chokepoint after a successful write. Vocabulary
     extension: `rent_charge.created` / `.updated` / `.voided`;
     `payment.recorded` / `.updated` / `.deleted`;
     `property_owner.granted` / `.revoked`.
   - Test coverage: not directly RLS-testable (audit log is a write-
     side concern, not a read-side policy). Smoke-tested via walk-
     test: perform each action, query `audit_logs` to verify entry
     landed with correct `entity_type` / `action` / `metadata`.
   - Status: existing chokepoint pattern; reviewer attention
     follows the §13.4 audit-vocabulary-expansion paragraph.

4. **Reconciliation invariants (app-layer).** Balance computation
   (`sum(charges) - sum(payments) = balance`) must yield the same
   number across views: staff `/payments` page, tenant `/portal/rent`,
   owner `/owner-portal`, Rent roll report. Inconsistency would be a
   trust-undermining bug even though no money actually moves.
   - Resolution: single helper `computeBalance(tenantId)` in
     `src/lib/data/payments.ts` consumed by all four views. NO
     ad-hoc balance computation in any page-level component.
     Voided charges excluded from the sum; deleted payments
     naturally absent.
   - Test coverage: TypeScript unit test (Vitest or similar) — not
     RLS-suite-testable. The unit test seeds known
     charges/payments/voids/deletes and asserts the helper returns
     the expected balance for representative scenarios.
   - Status: app-layer convention; reviewer attention follows the
     §13.8 application-layer-notes paragraph (analog of §12.9).

## 8. SUGGESTED ORDER OF WORK

A sensible sequence — same shape as Phase 2/3/4 (decisions → schema →
RLS → modules → tests → sign-off). Slice ordering follows §0.5
locked decisions, with **slice 10e (owner portal foundation) moved
early** (right after the basic schema) to validate the novel
junction-mediated pattern before downstream slices harden against it.

**Step 0 — Decisions documented (no code). ✅ CLOSED 2026-05-24 — see §0.5.**
Ten Step 0 questions surfaced during read-first audit, resolved and
recorded in §0.5. All ten match the original recommendation leans;
none deviated.

**Step 1 — Slice 10a (Rent charges foundation).** Migration:
`rent_charges` table + two enums (`charge_type`, `charge_status`) +
6 indexes + 4 RLS policies (with §8.1 cross-org FK pins on all three
FK columns) + `set_updated_at` trigger. Routes: `/payments` list
page (charges tab) + `/payments/charges/[chargeId]` detail.
Components: `charges-view`, `charge-form-sheet`. Server actions:
`createCharge`, `updateCharge`, `voidCharge` +
`generateChargesForProperty` (the manual button per §0.5 decision 1).
Audit log: `rent_charge.created` / `.updated` / `.voided`. Sidebar
nav: flip "Payments" from `enabled: false` to `enabled: true`.

**Step 2 — Slice 10b (Payments foundation).** **Depends on 10a done.**
Migration: `payments` table + `payment_method` enum + 4 indexes + 4
RLS policies (with §8.1 cross-org FK pins on `charge_id` + `tenant_id`
+ implicit `charge.organization_id` match). UI: payments tab/view
on `/payments` (or `/payments/payments` if split) +
`recordPayment` affordance from the charge detail page. Server
actions: `recordPayment`, `updatePayment`, `deletePayment`. Audit
log: `payment.recorded` / `.updated` / `.deleted`. Introduce
`computeBalance(tenantId)` helper in `src/lib/data/payments.ts`
(consumed initially by `/payments`; later wired into slice 10c /
10d / 10f).

**Step 3 — Slice 10e (Owner portal foundation).** **Moved earlier
than the natural dependency order** to validate the novel junction-
mediated pattern before slice 10g depends on it. Migration:
`property_owners` junction table (composite PK; no `updated_at`;
no `organization_id`) + 4 RLS policies (manager-only write,
org-staff + self-read) with §8.1 cross-org FK pins on both
`property_id` and `user_id` + the drop-and-recreate of FIVE existing
`_select` policies per §3d (`properties`, `units`, `buildings`,
`leases`, plus the new `rent_charges` / `payments` if not already
shaped this way in 10a / 10b). Add `isInvestor()` helper to
`src/lib/auth/roles.ts`. Add `/owner-portal` route group with
portfolio view. Add staff-side `property-owners-section` on
`/properties/[id]` for grant/revoke. Server actions:
`grantPropertyOwnership`, `revokePropertyOwnership`. Audit log:
`property_owner.granted` / `.revoked`. Sidebar nav: NO new entry
(owner portal is route-group-scoped; INVESTOR users land at
`/owner-portal` after login).

**Step 4 — Slice 10c (Tenant portal Rent tab).** **Depends on 10a +
10b.** No migration (RLS branches already shipped in 10a / 10b).
Add `/portal/rent` route + `rent-tab` component. Reuses
`balance-card` and `computeBalance` from 10b. Walk-test as tenant
user: see own charges + payments + balance; do not see other
tenants' or other orgs'.

**Step 5 — Slice 10d (Statements).** **Depends on 10a + 10b.** No
migration. Add `/payments/statements/[tenantId]` route +
`statement-view` component with date-range filter + print
stylesheet. Walk-test: render statement as staff; render same
statement as tenant via `/portal/rent` (statement link); browser-
print to PDF works.

**Step 6 — Slice 10f (Reports).** **Depends on 10a + 10b** (Rent
roll specifically). No migration. Five report pages under
`/reports/*` + shared chart components (`DateRangePicker`,
`ChartCard`, `ExportCSVButton`). Each report is a server component
with a date-range query param + a Recharts composition. Rent roll
includes 30/60/90+ aging per §0.5 decision 10. Sidebar nav: flip
"Reports" from `enabled: false` to `enabled: true`.

**Step 7 — Slice 10g (Owner reports).** **Depends on 10e + 10f.**
No migration. Add `/owner-portal/reports` route + owner-scoped
variants of the report components. Each owner-scoped report applies
an implicit filter to the property list (only properties the
INVESTOR owns). Walk-test as INVESTOR user: see report data only
for owned properties; do not see other owners' properties' data.

**Step 8 — RLS test suite for Phase 5.** Author
`supabase/tests/rls_phase5_payments_owner.sql` per §6. ~36
assertions across C / Y / O / J / D prefixes. Verify cross-org
isolation, tenant-self read branches, owner-self read branches
across 5 extended tables, §8.1 cross-org FK pin rejections,
manager-only `property_owners` write authority, dual-mode access
regression. Update `RLS_TEST_PLAN.md` with the new suite — header
status row, run-list, §6 result log, and a new §4m section with
the assertion table.

**Step 9 — §13 sign-off.** Analog of §11 / §12. Phase 5 RLS
additions inventoried verbatim; the §3e novel-pattern flag
(junction-table-mediated portal isolation); test-plan delta (Suite
14 authored); email-safety delta (NONE per §0.5 decision 9);
application-layer notes (the `computeBalance` helper convention,
the audit-vocabulary expansion); attestation. Gate 1 re-certified
for the new policy posture. The §13 document inventories more new
tables than §12 (three vs two for Phase 4) but no Phase-3-surface
modifications (vs the M3LR RPC widening in Phase 4 §12.2), so net
length is similar.

### What can run in parallel

- Slices 10c (tenant rent tab) and 10d (statements) after 10a + 10b
  land. Two read-only UI surfaces over the same data.
- Slice 10f (reports) after 10a + 10b land; can run in parallel with
  10c / 10d / 10e (10e doesn't depend on 10a/10b).
- Step 9 sign-off prep work (drafting the §13 inventory) can start
  during Step 8 if confident no migration changes are needed.

### What must serialize

- Step 0 → Step 1 (no migration without the decisions).
- Step 1 (10a) → Step 2 (10b) — payments FK to charges.
- Step 3 (10e) does NOT depend on 10a / 10b; runs in parallel after
  Step 2 lands.
- Steps 4-6 depend on 10a / 10b being available; can themselves
  parallelize.
- Step 7 (10g) depends on 10e + 10f.
- Step 8 → Step 9 (tests before sign-off — standard pattern).
- Step 9 gates any Phase 5 push to a Preview that real INVESTOR
  users could see.

## 9. Footnotes — what this plan deliberately does NOT do

This is the Phase 5 deliberate-omissions list. Each entry is a
candidate item that might *feel* like Phase 5 scope but is explicitly
out, with a destination phase or rationale.

- **Online payment processing (Stripe Connect, ACH, etc.).** Per §0.5
  decision 7. Future PAYMENTS FULL phase — not numbered yet. That
  phase is also where **Gate 5** ("no real charges without human
  authorization") lands. SPEC's "LITE FIRST" framing is the licensing.
- **Payment method storage** (cards, ACH bank tokens). No processor
  → nothing to store. PAYMENTS FULL.
- **Webhook handlers** (payment.succeeded, charge.failed, etc.). No
  processor → no webhooks. PAYMENTS FULL.
- **Idempotency layer** for external state transitions. No external
  state transitions in Phase 5. PAYMENTS FULL.
- **PCI compliance scope.** No card data ever touches the DB in Phase
  5. PAYMENTS FULL would need a scoped review.
- **Reconciliation pipeline** (DB ↔ processor). No processor. PAYMENTS
  FULL.
- **Auto-charging / cron-based recurring charge generation.** Per
  §0.5 decision 1. Phase 6 — Automation engine is the natural home
  (trigger: lease.activated; action: generate monthly charges).
- **Late fees + grace periods.** Not in SPEC PAYMENTS LITE bullets.
  Could be Phase 6 (Automation engine — trigger: charge.overdue;
  action: create fee charge) or PAYMENTS FULL.
- **Refunds and disputes.** Not in SPEC. Phase 5 recovery for a
  wrongly-recorded payment is `deletePayment`. Processor-integration
  refunds wait for PAYMENTS FULL.
- **Real PDF statement generation** (puppeteer, React-PDF, etc.). Per
  §0.5 decision 6. Walk-test will reveal need; not Phase 5 baseline.
- **Email statement delivery** (statement as PDF attachment, "Your
  March statement is ready" emails). Couples to PDF + Gate 3 surface
  expansion; both deferred. Phase 6.
- **Payment receipt emails** (`payment.received` template). Per §0.5
  decision 9. Phase 6 Automation engine — trigger: payment.recorded;
  action: send receipt template.
- **Tenant-side self-reported payments.** Per §0.5 decision 8. Walk-
  test will reveal if needed; natural answer is a Phase 6 comment-
  on-charge or document-upload affordance.
- **Owner payouts** (the funds-to-owner side). Not in SPEC owner-
  portal bullets. Owner portal is read-only portfolio view + reports.
  Far-future phase (likely PAYMENTS FULL + investor-class accounting).
- **AI summaries in owner portal** (SPEC line 381). Phase 6 dependency
  — Owner portal page renders without the summary card; Phase 6 adds
  the surface area when AI ships.
- **AI summaries on reports.** SPEC line 415 names "Reporting
  insights" under AI. Phase 6.
- **Owner approval of maintenance requests.** Not in SPEC owner-
  portal bullets. Owner is read-only in Phase 5.
- **Investor-class reporting** (capital accounts, distributions, K-1s).
  Not in SPEC. Tax-domain — far-future phase.
- **`ownership_pct` on the property_owners junction.** Per §0.5
  decision 3. Add when a concrete use case appears.
- **Bulk charge import / CSV upload.** Not in SPEC. Possible Phase 6
  if walk-test reveals need (real PMS migrations from legacy systems
  often start with a charge-history import).
- **Charge templates** (per-lease recurring rules: "this lease pays
  rent on the 1st, late fee on the 6th, water bill quarterly").
  Couples to cron — Phase 6.
- **Inspections (move-in / move-out).** SPEC names Inspections as a
  module but groups it with Phase 6 (Automations + AI + inspections
  + amenities per SPEC line 564). Not Phase 5.
- **Amenities reservations.** Phase 6 (per SPEC line 564).
- **Documents module** (lease attachments, statement archives, etc.).
  Phase-untagged; couples to Supabase Storage. Not Phase 5; possible
  Phase 6 to ship alongside AI document understanding.
- **Multi-currency support.** Not in SPEC. Far-future.
- **Tax computation** (sales tax on fees, etc.). Not in SPEC.

**Forward note on Gate 5.** The future PAYMENTS FULL plan will need to
propose Gate 5 — "no real charges without human authorization,"
analogous to Email's production-mode gate. SPEC doesn't enumerate it
(SPEC names only Gates 1-4); the PAYMENTS FULL plan will need to
extend the gate list explicitly. Not a Phase 5 concern.
