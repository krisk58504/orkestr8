# PHASE_4_PLAN.md — Phase 4 build plan (Leasing CRM)

> Read SPEC.md before working from this plan. This document paraphrases the
> spec where it is clear and **names ambiguities where it is not**. It does
> not silently resolve them.
>
> Source-of-record snapshot: branch `phase-2-maintenance` at HEAD `93a4842`
> (Phase 3 §11.9 Gate 1 sign-off). Authored 2026-05-23, immediately after
> Phase 3 closure.

## 0. Spec headline (verbatim)

```
Phase 4:
Leasing CRM
```

That is the entire phase header, per SPEC.md line 557-558.

The product surface, also verbatim, from SPEC.md §"LEASING CRM" (lines
361-365):

```
### LEASING CRM
- Lead pipeline
- Tours
- Applications
- Lease conversion
```

Four bullets. Plus three named tables in SPEC's core tables list (lines
315-317): `leads`, `tours`, `applications`. Plus two app structure paths
(lines 598-599): `/app/leasing`, `/app/applications`. Plus two
`enabled: false` nav placeholders already in `src/components/layout/nav.ts`
("Leasing CRM" → `/leasing`, "Applications" → `/applications`).

That is the totality of what SPEC names for Phase 4.

## 1. SCOPE

### What SPEC says Phase 4 includes

The four bullets, faithfully:

- **Lead pipeline** — capturing prospects, tracking them through stages.
- **Tours** — scheduling and recording tour outcomes.
- **Applications** — taking and deciding on applications to lease.
- **Lease conversion** — turning an approved application into a tenant
  on a lease.

### What SPEC says Phase 4 does NOT include

Phase 4 is the smallest spec headline of any phase so far (three words).
Everything not in the four bullets above is excluded. The table below
lists items that might *feel* like natural extensions but are not in
SPEC's Phase 4 scope — call them out so they don't sneak in:

| Excluded item | Why deferred |
|---|---|
| Lead scoring / auto-qualification | Not in SPEC. AI feature — Phase 6 |
| Bulk lead import / CSV upload | Not in SPEC |
| Lead deduplication / merge | Not in SPEC |
| Application credit-check integration | Not in SPEC. Real-money workflow — Phase 5+ |
| Application document upload (proof of income, ID, etc.) | Not in SPEC. Couples to document management module — phase-untagged but likely Phase 6 |
| Digital signing of leases | Not in SPEC. Possibly Phase 5 (when leases get financial mutation surface) |
| Co-signers / guarantors on applications | Not in SPEC. Lean applications first |
| Application fees / payments | Phase 5 |
| Tour confirmation / reminder emails to prospect | Could lean in (email infrastructure exists from Phase 2/3) but SPEC doesn't name it. Recommend defer to keep slice tight |
| Marketing automation / drip campaigns | Phase 6 (Automation engine) |
| Lead source UTM tracking / web widget for prospect intake | Not in SPEC. Would require public ingest endpoint — non-trivial |
| Tour calendar view / iCal export | Not in SPEC |
| Vacancy listing pages (public-facing) | Not in SPEC |
| Lease renewals workflow | Not in SPEC. Adjacent shape but different from lease conversion |
| Move-in inspections | Phase 6 (Inspections module) |

### Phase 3 integration touchpoints

Phase 4 is the first phase that lights up infrastructure Phase 3 built
and left dormant. Three load-bearing touchpoints:

1. **`public.leases` table (Phase 3 slice 5a / migration M3L).** Created
   with staff-driven CRUD only — staff manually create leases via the
   tenant form sheet. Phase 4 slice 9d makes the conversion action the
   first **programmatic** creator of leases, going through the existing
   `create_lease_with_tenants` SECURITY DEFINER RPC (M3LR). No changes
   to the RPC are anticipated; conversion uses it as-is.
2. **`public.tenants` table (Phase 1).** Phase 3 staff create tenant
   rows manually via the tenant form sheet (`/tenants`). Phase 4 slice
   9d makes conversion the first **programmatic** creator of tenant
   rows, from approved-application data. Adds one additive column
   (`tenants.source_application_id`) for provenance — see §2.
3. **Tenant invite flow (Phase 3 slice 6b/6c/6d).** Invite-send and
   acceptance are fully wired. Phase 4 slice 9d *can* fire `sendInvite`
   immediately after creating the tenant, closing the lead-to-portal
   loop end-to-end — or the LA can issue the invite manually after
   conversion. Both UX paths are valid; recommendation in §7 risk 5.

These touchpoints mean Phase 4 doesn't introduce new external user
identities — the LEASING_AGENT role already exists in the enum and is
already in `is_org_staff()` / `can_write_tenants()`. No new linchpin
question of Phase 3's magnitude.

### Cross-phase layering — minor

Unlike Phase 3 (whose tenant-portal bullet cut across Rent=Phase5,
Amenities=Phase6, AI=Phase6, Documents=phase-untagged), Phase 4's
four bullets stay cleanly inside the leasing domain. The only cross-
phase boundary worth flagging:

- **Lease conversion (Phase 4) writes to the `leases` table (Phase 3).**
  Phase 3 deliberately created the leases table with staff-only manager
  write policies; Phase 4 conversion uses the existing
  `create_lease_with_tenants` RPC which already authorizes
  `is_org_manager() OR can_write_tenants() via downstream RLS`. Walk
  the authority verification before slice 9d ships — the RPC's internal
  authority check (M3LR) requires `is_org_manager()`, but a LEASING_AGENT
  may need to convert without being a manager. This is a Step 0
  decision: do we expand the RPC's authority check to include
  `can_write_tenants()`, or do we restrict conversion to managers? See
  §7 risk 7.

## 2. NEW TABLES AND COLUMNS

The spec names three tables (`leads`, `tours`, `applications`) and four
product bullets. The column shapes below are derived from the bullets,
not directly quoted from SPEC. Treat each as a planning hypothesis to
be confirmed before the migration.

### 2a. `leads` (slice 9a)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | isolation column |
| `status` | `public.lead_status not null default 'new'` | enum, see below |
| `source` | `public.lead_source not null default 'other'` | enum, see below |
| `first_name` | `text not null` | |
| `last_name` | `text not null` | |
| `email` | `text` | nullable (walk-ins may not provide email upfront) |
| `phone` | `text` | nullable |
| `assigned_to` | `uuid references public.users(id) on delete set null` | the LA owning the lead |
| `desired_property_id` | `uuid references public.properties(id) on delete set null` | nullable |
| `desired_move_in` | `date` | nullable |
| `desired_bedrooms` | `int` | nullable |
| `desired_budget` | `numeric(10,2)` | nullable |
| `notes` | `text` | free-form |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | trigger-maintained |

**Enums:**

- `public.lead_status`: `'new' | 'contacted' | 'qualified' | 'tour_scheduled' | 'applied' | 'converted' | 'disqualified' | 'lost'`
- `public.lead_source`: `'website' | 'referral' | 'walkin' | 'partner' | 'other'`

**Indexes worth pre-declaring:**

- `leads_organization_id_idx` — every list query filters by org first
- `leads_status_idx` — pipeline / Kanban grouping
- `leads_assigned_to_idx` — "leads I own" view for an LA
- `leads_desired_property_id_idx` — property-centric prospect lookup

**Trigger:** standard `set_updated_at` before-update trigger.

### 2b. `tours` (slice 9b)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | |
| `lead_id` | `uuid not null references leads(id) on delete cascade` | tour is always tied to a lead |
| `unit_id` | `uuid references units(id) on delete set null` | nullable — could be a general property tour |
| `agent_id` | `uuid references public.users(id) on delete set null` | the LA conducting |
| `scheduled_at` | `timestamptz not null` | |
| `status` | `public.tour_status not null default 'scheduled'` | |
| `outcome_notes` | `text` | free-form post-tour |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |

**Enum:**

- `public.tour_status`: `'scheduled' | 'completed' | 'no_show' | 'cancelled'`

**Indexes:**

- `tours_organization_id_idx`
- `tours_lead_id_idx`
- `tours_scheduled_at_idx` — for "tours this week" agent views
- `tours_status_idx`

**Trigger:** standard `set_updated_at`.

### 2c. `applications` (slice 9c)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `organization_id` | `uuid not null references organizations(id) on delete cascade` | |
| `lead_id` | `uuid references leads(id) on delete set null` | **nullable** — walk-in applicants might not have a prior lead row; see §7 risk 2 |
| `unit_id` | `uuid not null references units(id) on delete restrict` | the unit being applied for |
| `status` | `public.application_status not null default 'draft'` | |
| `applicant_first_name` | `text not null` | denormalized copy — applications outlive lead rows |
| `applicant_last_name` | `text not null` | |
| `applicant_email` | `text not null` | required for tenant creation on approval |
| `applicant_phone` | `text` | |
| `desired_move_in` | `date` | |
| `monthly_income` | `numeric(10,2)` | |
| `employment_status` | `text` | free-form for now (employed/self-employed/student/retired/other) |
| `prior_address` | `text` | |
| `background_check_consent` | `boolean not null default false` | check-box; out-of-band BG check workflow is deferred |
| `submitted_at` | `timestamptz` | nullable; set when status moves to `submitted` |
| `decided_at` | `timestamptz` | set when approved or rejected |
| `decided_by` | `uuid references public.users(id) on delete set null` | the decider |
| `decision_notes` | `text` | |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |

**Enum:**

- `public.application_status`: `'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn'`

**Indexes:**

- `applications_organization_id_idx`
- `applications_lead_id_idx` (partial: `where lead_id is not null`)
- `applications_unit_id_idx`
- `applications_status_idx`

**Trigger:** standard `set_updated_at`.

**Status transition rules:** RLS will NOT enforce these — per the
Phase 2 §8.2 precedent, status-transition rules live in the server
action, not the policy. Application action `updateApplicationStatus`
validates the transition before writing. Allowed transitions:

```
draft       → submitted, withdrawn
submitted   → under_review, withdrawn, rejected
under_review → approved, rejected, withdrawn
approved    → withdrawn  (rare — captures "approved but never moved in")
rejected    → (terminal)
withdrawn   → (terminal)
```

### 2d. `tenants.source_application_id` (slice 9d)

Single additive column:

```sql
alter table public.tenants
  add column if not exists source_application_id uuid
    references public.applications(id) on delete set null;
create index if not exists tenants_source_application_id_idx
  on public.tenants(source_application_id);
```

Provenance only. Nullable so existing tenant rows (created via the
Phase 3 tenant form sheet) keep `source_application_id` NULL forever.
The conversion action sets it; nothing else writes it.

No other column changes on existing tables in Phase 4.

## 3. NEW RLS SHAPES

### 3a. No linchpin question this phase

Unlike Phase 3 (which had the cross-cutting `tenants.user_id` vs
`users.tenant_id` design decision), Phase 4 introduces no new external
user identity and no new column on `public.users`. The LEASING_AGENT
role already exists in the `user_role` enum, is already in
`is_org_staff()` (Phase 1 helper), and is already in
`can_write_tenants()` (Phase 1 helper). **No new helpers are needed.
No `protect_user_columns` extension is needed.** No novel RLS pattern
of the "membership-based" (Phase 3 messages) or "SECURITY DEFINER
with anonymous grant" (Phase 3 accept_tenant_invite) variety.

### 3b. RLS shape per new table

All three new tables (`leads`, `tours`, `applications`) follow the
same shape, mirroring the **broad-read / narrow-write split** Phase 3
established for `messages`:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `leads` | `is_org_staff()` in org **OR** super_admin | `can_write_tenants()` in org **OR** super_admin | `can_write_tenants()` in org **OR** super_admin | `can_write_tenants()` in org **OR** super_admin |
| `tours` | (same shape) | (same shape) | (same shape) | (same shape) |
| `applications` | (same shape) | (same shape) | (same shape) | (same shape) |

**Rationale for the split:**

- **Broad read** (`is_org_staff()`): a maintenance tech might
  legitimately want context on a prospect for a property they service.
  Read access doesn't expose sensitive financial data — applications
  carry monthly_income but that's already exposed to all staff via
  tenants table screens in Phase 3.
- **Narrow write** (`can_write_tenants()` = management + leasing
  roles): only the cohort with tenant-write authority can mutate
  prospect data. Matches the existing posture on `tenants`,
  `tenant_invites`.

Each policy will use the standard one-policy-per-operation +
`for all` shape from Phase 1/2 — drop+recreate idempotency, USING +
WITH CHECK both populated identically for write policies.

### 3c. The Phase-3-equivalents of Phase-2-gaps

Phase 3 §3c walked through whether Phase 2's four §8 gaps (org-id
pinning, status restriction, role gate on SELECT, NULL→value linchpin
pin) had analogues. Phase 4 walks the same checklist:

- **§8.1 analogue — `organization_id` pinning on cross-org writes.**
  Phase 4 has no cross-tenant write surface (no vendor branch, no
  tenant-self branch). Every write is by org-staff into their own
  org; the `current_user_org_id()` check in the policy already pins
  it. **Not applicable.**
- **§8.2 analogue — RESTRICTIVE status policies.** The
  `application_status` enum has constrained transitions, but those
  transitions live in the application server action (per the Phase 3
  §11.7-style precedent). Adding a RESTRICTIVE policy to enforce
  e.g. "submitted cannot jump to approved without passing under_review"
  is possible but heavier than the rule warrants. Recommend
  application-layer enforcement; revisit if a Phase 4 audit finds a
  bypass path.
- **§8.3 analogue — role gate on SELECT.** Phase 4 has no vendor-style
  or tenant-self-style SELECT branch that would key on a user-settable
  column (no `users.tenant_id` analogue). The SELECT branch is
  `is_org_staff()` — already role-gated. **Not applicable.**
- **§8.4 analogue — linchpin column write protection.** No new
  user-linkage column. **Not applicable.**

### 3d. Open RLS question — read scope width

The proposal above puts SELECT on `is_org_staff()` (broad). The
alternative is `can_write_tenants()` (narrow — same as write). The
tighter option:

- Pros: tighter information-disclosure surface. Maintenance tech /
  accounting doesn't see prospect data they have no reason to act on.
- Cons: a maintenance tech investigating a property issue can't see
  "we have three tours scheduled there this week" context.

Recommendation: **broad read**, matching Phase 3's `messages` posture.
Flag as a Step 0 decision in §8 so it's deliberate.

## 4. NEW GATES

**Per SPEC, Phase 4 does not name a new gate.** SPEC defines exactly
four gates (1: RLS, 2: AI/automation, 3: Email, 4: Production
deployment). None of them is added in Phase 4. Phase 4 *extends the
surface area* of exactly one existing gate:

| Gate | Phase 4 extension |
|---|---|
| **Gate 1 (RLS)** | Three new tables, six new policies (2 per table: select + write). All follow established patterns from Phase 1/2/3 — no new helpers, no novel surfaces. The §12 sign-off (analog of §11) will be significantly shorter than §11 was. |
| **Gate 2 (AI/automation)** | Untouched. Lead scoring, application auto-decisioning, and similar AI features are explicitly deferred per §1 — Phase 6. |
| **Gate 3 (Email)** | Untouched unless tour confirmation emails are added (deferred per §1). If tour emails are wanted, they go through the existing `sendEmail()` chokepoint with a new template; no gate change. |
| **Gate 4 (Production)** | Untouched. |

**Phase 4 does not need a new gate but does need:**

- A documented confirmation that lead scoring / application
  auto-decisioning stays out of Phase 4 (Step 0 risk 1).
- A documented confirmation that the application-status transition
  enforcement lives in the server action layer, not RLS (§3c.§8.2).

**Forward note**: when Phase 5 (Payments + owner portal + reporting)
lands, the team should propose a **Gate 5** — "no real charges
without human authorization," analogous to Email's production-mode
gate. SPEC doesn't enumerate it; the Phase 5 plan will need to add it.
Not a Phase 4 concern.

## 5. SERVER ACTIONS AND UI SURFACE

Just the list — not specifications.

### Routes

- `/leasing` — lead pipeline list (default view; Kanban variant deferred
  to Step 0 decision).
- `/leasing/[leadId]` — lead detail. Shows lead profile + tours
  scheduled + applications submitted. Toolbar action: "Schedule tour",
  "Start application".
- `/leasing/[leadId]/tours/new` — tour scheduling sheet (or inline form
  on the lead detail page; UI choice).
- `/leasing/[leadId]/applications/new` — start an application from this
  lead (sheet pre-fills applicant identity from lead).
- `/applications` — global applications list (all leads' applications,
  filterable by status).
- `/applications/[appId]` — application detail. Status timeline, edit
  fields, "Approve & convert" action (slice 9d) when status =
  `under_review`.

Sub-routes for tours could alternatively live at `/leasing/tours` as a
top-level tour calendar — explicitly deferred per §1 (calendar view).

### Server actions (high level)

**`src/app/(app)/leasing/actions.ts`** (slice 9a):
- `createLead(input)` — staff captures a new lead (`can_write_tenants` gate).
- `updateLead(id, input)` — edit profile, change status, reassign owner.
- `deleteLead(id)` — disqualified leads cleanup.

**`src/app/(app)/leasing/[leadId]/tour-actions.ts`** (slice 9b) — split
file matches the `photo-actions.ts` / `triage-actions.ts` /
`invite-actions.ts` precedent:
- `scheduleTour(leadId, input)` — create a tour row.
- `completeTour(tourId, outcome_notes)` — status → `completed`, stamp outcome.
- `cancelTour(tourId)` — status → `cancelled`.
- `markTourNoShow(tourId)` — status → `no_show`.

**`src/app/(app)/applications/actions.ts`** (slice 9c):
- `createApplication(input)` — new application (possibly from a lead,
  possibly walk-in).
- `updateApplication(id, input)` — edit fields before submission.
- `submitApplication(id)` — transition `draft` → `submitted`, stamp
  `submitted_at`.
- `transitionApplicationStatus(id, newStatus, notes?)` — validated
  status transition (in-action enforcement per §3c.§8.2).
- `withdrawApplication(id, notes?)` — terminal transition.

**`src/app/(app)/applications/[appId]/convert-actions.ts`** (slice 9d):
- `approveApplicationAndConvert(applicationId, options: { sendInvite: boolean, monthly_rent: numeric, start_date: date })` —
  the load-bearing slice 9d action. Multi-step:
  1. `requireSession` + `can_write_tenants` gate (or `is_org_manager`
     depending on §1 cross-phase decision).
  2. Validate `application.status = 'under_review'` or `'submitted'`.
  3. Transition `application.status → 'approved'`, stamp
     `decided_at`/`decided_by`.
  4. INSERT into `tenants` from application data; set
     `source_application_id = applicationId`.
  5. Call `create_lease_with_tenants` RPC (M3LR from Phase 3) with the
     unit, the rent, the start date, and the new tenant_id.
  6. Update `leads.status → 'converted'` if the application has a
     `lead_id`.
  7. Audit-log `application.approved`, `tenant.created` with
     `metadata.source = "leasing_conversion"`, `lease.created` with
     same metadata.
  8. If `options.sendInvite` is true, fire `sendInvite` (Phase 3 slice
     6b infrastructure) to the new tenant's email.

### Components

- `src/components/leasing/lead-form-sheet.tsx` — mirror of
  `tenant-form-sheet.tsx`.
- `src/components/leasing/lead-pipeline-view.tsx` — list or Kanban.
- `src/components/leasing/tour-schedule-dialog.tsx` — AlertDialog
  pattern from Phase 3's end-lease dialog.
- `src/components/applications/application-form-sheet.tsx` — multi-step
  if needed; otherwise single form sheet.
- `src/components/applications/application-detail-view.tsx` — status
  timeline + "Approve & convert" affordance gated on status.
- `src/components/applications/convert-application-dialog.tsx` —
  AlertDialog for the lease conversion confirmation, with form fields
  for `monthly_rent`, `start_date`, and a checkbox for "Send invite
  to tenant on conversion."

## 6. TEST STRATEGY

One new RLS test suite. Per §3 there are no new helpers, no novel
patterns, no RPC granted-to-authenticated, no immutability tricks —
the three new tables all share the same structurally-identical RLS
shape, so one suite covers all three.

| File | Proves |
|---|---|
| `supabase/tests/rls_phase4_leasing.sql` | (a) `can_write_tenants()` gating on write — PROPERTY_MANAGER and LEASING_AGENT can INSERT/UPDATE/DELETE leads/tours/applications in their org; MAINTENANCE_TECH cannot. (b) Cross-org isolation — Org A leads/tours/applications invisible to Org B staff. (c) `is_org_staff()` gating on read — MAINTENANCE_TECH CAN read (broad-read split, per §3b). (d) Application status transition rules are NOT enforced by RLS — verify a vendor-style direct UPDATE bypasses the transition rule (confirming the rule lives in app-layer, per §3c.§8.2). |

Pattern mirrors **Phase 3 Suite 9** (tenant_invites lifecycle):
single-table shape repeated three times with a small assertion table.

**Numbering convention:** assertion IDs grouped by concern within the
single file:
- `K1–K6` — leads (K for "Kandidate", avoiding L which is Suite 7's leases prefix)
- `T1–T6` — tours
- `A1–A6` — applications (no conflict — Suite 8 used A for accept_tenant_invite, but Suite 8 is in a different file)

Or sequential `L1–Lxx` within this suite — actually L is Suite 7's prefix. Recommend the per-concern grouping (K/T/A).

**Estimated assertion count**: ~18 (6 per table × 3 tables). One
allowed-write per role per table = 3 × 3 = 9 baseline assertions, plus
cross-org denials (3), plus status-transition-bypass demonstration (1),
plus a few cleanup verifications.

**Regressions that must be re-verified after each Phase 4 migration:**

- All 12 existing suites — `rls_cross_org.sql` (13/13),
  `rls_within_org.sql` (5/5), `rls_phase2.sql` (23/23),
  `user_columns_pin.sql` (10/10), `rls_phase2_blockers_closed.sql`
  (25/25), `users_select_staff_gate.sql` (8/8),
  `rls_phase3_accept_tenant_invite.sql` (15/15),
  `rls_phase3_messages_immutable.sql` (14/14),
  `rls_phase3_leases_tenant_self.sql` (7/7),
  `rls_phase3_tenant_invites_lifecycle.sql` (9/9),
  `rls_phase3_maintenance_tenant_self.sql` (10/10),
  `rls_phase3_units_properties_tenant_self.sql` (11/11). Cumulative
  150 assertions — no Phase 4 migration should cause any regression.
- **Particular attention to `rls_phase3_leases_tenant_self.sql`**: slice
  9d writes leases programmatically for the first time. If the lease
  conversion action somehow bypasses the existing `leases_write` policy
  (it shouldn't — it uses the existing RPC), Suite 7 catches it.

**New end-to-end test (optional, not Gate 1 blocking):**

- `scripts/test-lease-conversion.ts` — exercises the full slice-9d flow
  against the dev DB: seed a lead → application → call
  `approveApplicationAndConvert` → assert the tenant + lease rows
  exist + the audit log entries are present + (if invite sent) the
  email_log entry shows the right template. Not RLS-flavoured; more
  of an integration smoke test. Pattern mirrors `scripts/test-email.ts`.

## 7. RISKS AND OPEN QUESTIONS

Highest-stakes, in rough order. Each item gets a provisional
recommendation but the decision is deferred to Step 0 of execution.

1. **Lead → tenant identity model.** Two options: (a) leads and
   tenants are separate entities; conversion CREATES a new tenant row
   from application data (recommended). (b) leads ARE proto-tenants
   on the same identity; conversion PROMOTES a lead row to a tenant
   row. **Recommendation: A (separate).** Cleaner semantics, simpler
   queries, easier history ("this tenant came from this application"
   via the `source_application_id` FK). The cost is that the same
   person's data lives in two rows (lead + tenant) if they convert.
   Acceptable trade.
2. **`applications.lead_id` nullable or not.** Walk-in applicants
   might not have a prior lead row (someone walks in off the street
   and applies immediately). **Recommendation: nullable.** Means the
   "every application has a lead" invariant doesn't hold — UI handles
   the missing-lead case via fallback rendering on the detail page.
   Forcing a lead row for walk-ins would create stub leads that clutter
   the pipeline.
3. **Kanban vs list for `/leasing`.** SPEC's GLOBAL UI mentions Kanban
   boards (line 259). Lead pipeline is the textbook Kanban use case
   (columns = statuses). **Recommendation: ship list view in slice 9a
   baseline; add Kanban as a follow-up UI slice if needed.** Don't
   block 9a on the more complex UI.
4. **Application status workflow rigor.** The `application_status`
   enum has 6 values with implicit transition rules
   (`draft → submitted → under_review → approved/rejected`). Per
   Phase 2 §8.2 precedent and §3c above, transitions live in the
   server action, NOT in RLS. **Recommendation: app-layer
   enforcement.** Server action validates `currentStatus → newStatus`
   against an allowed-set map; returns a friendly error on disallowed
   transitions. RLS test (above) verifies this is the only enforcement
   layer (no RESTRICTIVE policy).
5. **Auto-invite on conversion vs manual.** Slice 9d's
   `approveApplicationAndConvert` action could automatically fire
   `sendInvite` after creating the tenant, OR leave it as a separate
   manual step the LA initiates from the new tenant's row.
   **Recommendation: manual (with checkbox in the convert dialog).**
   Fewer side-effects per action; LA can confirm everything looks
   right before sending the email; matches the conservative posture
   of every other Phase 3 / Phase 4 action that touches the email
   chokepoint.
6. **Tour notifications to the prospect.** If we fire confirmation
   emails to the prospect (lead's email), we hit Gate 3 with a new
   template. SPEC doesn't require it. **Recommendation: defer.** Staff
   can call or email manually. Keeps slice 9b focused.
7. **RPC authority for conversion — manager-only or include
   leasing-agent.** The existing `create_lease_with_tenants` RPC
   (M3LR) checks `is_org_manager() OR is_super_admin()` in its body.
   But slice 9d's natural caller is a LEASING_AGENT (they own the
   pipeline). Two options: (a) restrict conversion to managers (LA
   has to escalate); (b) modify the RPC to accept `can_write_tenants()`
   as its authority check (LA can convert directly). **Recommendation:
   (b) — modify the RPC's authority check** to `can_write_tenants()`
   when the Phase 4 work begins. The RPC is the right place to widen
   (it's a manager-named function only because Phase 3 had no leasing
   workflow). Modification is a small migration; counts as a Phase 4
   schema change and goes into the Phase 4 sign-off. Alternative: leave
   the RPC alone and have the conversion action invoke it via the
   admin client (bypassing the authority check inside the SECURITY
   DEFINER body). Worse — bypasses an explicit safety check.

## 8. SUGGESTED ORDER OF WORK

A sensible sequence — same shape as Phase 2/3 (decisions → schema → RLS
→ modules → tests → sign-off).

**Step 0 — Decisions documented (no code).** Write down, in
`PHASE_4_DECISIONS.md` or as a §0a addendum to this file, the answers
to:
- §7 risk 1: lead↔tenant identity model (recommend A: separate).
- §7 risk 2: `applications.lead_id` nullability (recommend nullable).
- §7 risk 3: Kanban vs list for `/leasing` (recommend list-first).
- §7 risk 5: auto-invite vs manual on conversion (recommend manual).
- §7 risk 6: tour confirmation emails (recommend defer).
- §7 risk 7: conversion RPC authority (recommend widen to
  `can_write_tenants()`).
- §3d: read scope width (recommend broad `is_org_staff()`).

**Step 1 — Slice 9a (Leads foundation).** Migration: `leads` table +
two enums + indexes + RLS (two policies) + `set_updated_at` trigger.
Routes: `/leasing` list, `/leasing/[leadId]` detail. Components:
lead form sheet, leads view. Server actions: `createLead`,
`updateLead`, `deleteLead`. Audit log: `lead.created`,
`lead.updated`, `lead.deleted`. Sidebar nav: flip "Leasing CRM"
from `enabled: false` to `enabled: true`, rename to "Leasing"
matching Phase 3's "Messages" naming pattern.

**Step 2 — Slice 9b (Tours).** Migration: `tours` table + enum + RLS
+ trigger. UI: tour scheduling on lead detail page (inline form OR
sheet). Server actions: `scheduleTour`, `completeTour`, `cancelTour`,
`markTourNoShow`. Audit log: `tour.scheduled`, `tour.completed`, etc.
**Independent of slice 9c** — can ship in either order.

**Step 3 — Slice 9c (Applications).** Migration: `applications` table
+ enum + RLS + trigger. Routes: `/applications` list,
`/applications/[appId]` detail. Components: application form sheet
(possibly multi-step), application detail with status timeline.
Server actions: `createApplication`, `updateApplication`,
`submitApplication`, `transitionApplicationStatus`,
`withdrawApplication`. Audit log: `application.created`,
`application.submitted`, `application.status_changed`, etc. Sidebar
nav: flip "Applications" from `enabled: false` to `enabled: true`.
**Independent of slice 9b** — can ship in either order.

**Step 4 — Slice 9d (Lease conversion).** **Depends on 9c done.**
Two pieces:
- Migration M4d-1: `tenants.source_application_id` additive column +
  index.
- Migration M4d-2 (per §7 risk 7, if Step 0 chose option b): modify
  `create_lease_with_tenants` RPC authority check from
  `is_org_manager()` to `can_write_tenants()`. SECURITY DEFINER
  semantics unchanged; only the authority guard changes.
- Server action: `approveApplicationAndConvert` per §5.
- UI: "Approve & convert" affordance on application detail page;
  conversion AlertDialog with form fields.
- Audit log: the three-event sequence
  (`application.approved`, `tenant.created` with leasing-source
  metadata, `lease.created` with leasing-source metadata).

**Step 5 — RLS test suite for Phase 4.** Author
`supabase/tests/rls_phase4_leasing.sql` per §6. ~18 assertions across
K (leads), T (tours), A (applications) prefixes. Verify the
broad-read/narrow-write split. Verify the status-transition rule is
NOT enforced by RLS (confirming app-layer enforcement is the only
enforcement). Update RLS_TEST_PLAN.md with the new suite — header
status row, run-list, §6 result log, and a new §4l section with the
assertion table.

**Step 6 — §12 sign-off.** Analog of §11 — Phase 4 RLS additions
inventoried verbatim, novel-pattern flag (NONE this phase — a clean
section), test-plan delta (Suite 13 authored), email-safety delta
(NONE if §7 risk 6 stays deferred), application-layer notes, and
attestation. Gate 1 re-certified for the new policy posture. The §12
document should be significantly shorter than §11 — no new helpers,
no new RPCs, no novel patterns.

### What can run in parallel

- Steps 2 and 3 (tours and applications) after step 1 lands. Two
  separate UI surfaces over independent tables.
- Step 6 sign-off prep work (drafting the §12 inventory) can start
  during step 5 if confident no migration changes are needed.

### What must serialize

- Step 0 → Step 1 (no migration without the decisions).
- Step 1 → Steps 2 and 3 (everything FK-references leads).
- Step 3 → Step 4 (conversion needs applications to exist).
- Step 5 → Step 6 (tests before sign-off — standard pattern).
- Step 6 gates any Phase 4 push to a Preview that real leasing-agent
  users could see.

## 9. Footnotes — what this plan deliberately does NOT do

- Does not include lead scoring / auto-qualification. AI feature —
  Phase 6.
- Does not include bulk lead import, CSV upload, or merge/dedup
  tooling. Not in SPEC.
- Does not include credit-check or background-check integrations.
  The `background_check_consent` checkbox is a consent capture, not
  an actual integration. Real BG check workflow is Phase 5+.
- Does not include application document upload. Couples to document
  management module (phase-untagged, likely Phase 6).
- Does not include digital signing. Phase 5 candidate.
- Does not include co-signers / guarantors on applications.
- Does not include application fees / payment processing. Phase 5.
- Does not include tour confirmation/reminder emails to the prospect.
  Step 0 decision; recommend defer.
- Does not include marketing automation or drip campaigns. Phase 6
  (Automation engine).
- Does not include lead source UTM tracking, web widget for public
  prospect intake, or any public ingest endpoint.
- Does not include tour calendar view or iCal export.
- Does not include vacancy listing pages (public-facing).
- Does not include lease renewals workflow. Adjacent shape to
  conversion but materially different.
- Does not include move-in inspections. Phase 6.
- Does not propose a Gate 5. When Phase 5 (payments) lands, the
  Phase 5 plan should propose adding it to SPEC. Not a Phase 4
  concern.
- Does not specify Kanban-vs-list UI for the pipeline — Step 0
  decision; recommend list-first with Kanban as a follow-up if needed.
- Does not pick the lead↔tenant identity model — Step 0 decision;
  recommend separate.
- Does not specify the conversion RPC authority widening — Step 0
  decision; recommend widening to `can_write_tenants()`.
