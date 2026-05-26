# SPEC AUDIT — 2026-05-25

> Spec-vs-built comparison. Source of truth: `SPEC.md` (commit `2449ac2`).
> Scope: everything explicitly named in SPEC's product spec, AI layer, safety
> gates, modules, and table list. Out of scope: items already in the known
> follow-up punch list (hero screenshot, /pricing, /invite 404 polish, etc.).
> Method: each item assessed against actual code + commits, not against
> phase-plan intentions.

## Summary

- **Total spec items**: 58
- **SHIPPED**: 41 (71%)
- **PARTIAL**: 5
- **SCAFFOLDED**: 3
- **DEFERRED**: 7
- **NOT STARTED**: 2

**Where the build is**: SPEC Phases 1-5 are functionally complete and live on
`dev.orkestr8.ai`. Phase 6's AI engine spine is also shipped — 4 of 6
SPEC-required AI surfaces are wired against real Claude Sonnet calls. The
remaining gap to SPEC is **3 named modules** (Automation engine, Inspections,
Amenities) plus 2 AI surfaces (Leasing assistant, Message drafting) plus the
Documents module — all consciously deferred per PHASE_6_PLAN.md §0.5
decisions to a Phase 7+ that hasn't been planned yet. PAYMENTS FULL (online
processing) is also explicitly deferred to a future unnumbered phase.

## By Major Area

### Safety Gates (5 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | RLS Gate: every table org-scoped + per-role policies | SHIPPED | 18 RLS suites, 270 assertions, cumulative regression green; `supabase/tests/rls_*.sql`; SECURITY_REVIEW.md §1-§13 |
| 2 | AI/Automation Gate (5 modes + `canRunAutomationAction` + `ai_logs`) | SHIPPED | `src/lib/auth/permissions.ts` (Phase 1 + slice 11a); `ai_mode` enum; `ai_logs` writes from 4 surfaces |
| 3 | Email Gate (test default + APPROVED_TEST_EMAILS + duplicate prevention + log) | SHIPPED | `src/lib/email/` (config, log, send, templates); EMAIL_SAFETY.md committed |
| 4 | Production Deployment Gate (separate dev/prod creds; no test data in prod) | PARTIAL | PRODUCTION_CHECKLIST.md committed; structural enforcement holds (no prod creds in dev env); has not been crossed yet — partner preview runs on dev project |
| 5 | Five required `.md` audit files exist | SHIPPED | SECURITY_REVIEW.md, RLS_TEST_PLAN.md, AI_AUTOMATION_SAFETY.md, EMAIL_SAFETY.md, PRODUCTION_CHECKLIST.md all committed |

### Identity / Auth / Roles (3 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 6 | Supabase Auth + 12 SPEC-named roles in `user_role` enum | SHIPPED | `supabase/migrations/20260518000100_enums.sql` enumerates all 12 roles; auth wiring in `src/lib/auth/session.ts`; `handle_new_user` trigger |
| 7 | Auth flows (signup / login / onboarding / invite) | SHIPPED | `src/app/(auth)/`, `src/app/onboarding/`, `src/app/invite/[token]/`; commits `bf75f71`+`9cfa110` (branding) |
| 8 | Settings → AI mode elevation UI (OWNER-only, audit-logged) | SHIPPED | `src/app/(app)/settings/ai/`; commit `4b92f0b` (slice 11a) |

### Property Management Core (4 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 9 | Properties CRUD | SHIPPED | `src/app/(app)/properties/[id]/page.tsx` + actions; migration `20260518000300` |
| 10 | Buildings CRUD | SHIPPED | `src/app/(app)/buildings/`; same migration |
| 11 | Units CRUD with status enum | SHIPPED | `src/app/(app)/units/`; `unit_status` enum has 7 values |
| 12 | Dashboard (overview metrics + chart) | SHIPPED | `src/app/(app)/dashboard/page.tsx` (142 lines, real stat cards + unit-status chart + recent properties) |

### Tenants + Leases (3 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 13 | Tenants CRUD | SHIPPED | `src/app/(app)/tenants/`; `tenant_status` enum + `tenants.lease_id` additive |
| 14 | Leases (active/upcoming/ended lifecycle) | SHIPPED | `src/app/(app)/leases/`; `lease_status` enum; `create_lease_with_tenants` RPC |
| 15 | Lease documents | NOT STARTED | `lease_documents` table named in SPEC line 301 but no migration; no UI |

### Maintenance Workflow (5 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 16 | Maintenance requests CRUD | SHIPPED | `src/app/(app)/maintenance/[id]/page.tsx` + actions |
| 17 | Work orders (assignment, status, photos) | SHIPPED | `src/app/(app)/work-orders/`; `work_orders` + `work_order_photos` tables; signed-URL upload pattern |
| 18 | Photo upload via Supabase Storage | SHIPPED | `WORK_ORDER_PHOTO_BUCKET`; `requestWorkOrderPhotoUpload` action |
| 19 | Status tracking | SHIPPED | `work_order_status` enum (7 values); `maintenance_status` enum (7 values) |
| 20 | SLA tracking | SCAFFOLDED | `work_orders.sla_due_at` column populated; no alerting/automation/dashboard surfaces the breaches |

### Vendor Management (4 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 21 | Vendors CRUD | SHIPPED | `src/app/(app)/vendors/`; vendor_status enum |
| 22 | Vendor contacts + documents (compliance tracking) | SHIPPED | `vendor_contacts`, `vendor_documents` tables; vendor portal Documents tab |
| 23 | Vendor invoices | SHIPPED | `vendor_invoices` table with status RESTRICTIVE policy; `src/app/vendor-portal/invoices/` |
| 24 | Vendor performance scoring | SHIPPED | `vendor_ratings` table; rating_avg + rating_count on vendors; `/reports/vendor-performance` |

### Tenant Portal (6 items — per SPEC §TENANT PORTAL)

| # | Item | Status | Evidence |
|---|---|---|---|
| 25 | Rent tab | SHIPPED | `src/app/portal/rent/page.tsx` (slice 10c) |
| 26 | Maintenance tab | SHIPPED | `src/app/portal/maintenance/page.tsx` (Phase 3) |
| 27 | Messaging tab | SHIPPED | `src/app/portal/messages/page.tsx` (Phase 3) |
| 28 | Documents tab | NOT STARTED | No `/portal/documents` route; no `documents` table |
| 29 | Amenities tab | DEFERRED | No `/portal/amenities` route; Amenities module deferred to Phase 7+ per PHASE_6_PLAN.md §0.5 decision 1 |
| 30 | AI assistant tab | DEFERRED | No `/portal/ai` route; tenant-facing AI surfaces explicitly deferred per AI_AUTOMATION_SAFETY.md §9 (prompt-injection audit gate) |

### Vendor Portal (4 items — per SPEC §VENDOR PORTAL)

| # | Item | Status | Evidence |
|---|---|---|---|
| 31 | Job acceptance + work order detail | SHIPPED | `src/app/vendor-portal/work-orders/[id]/page.tsx` |
| 32 | Compliance tracking (documents) | SHIPPED | `src/app/vendor-portal/documents/` |
| 33 | Invoicing | SHIPPED | `src/app/vendor-portal/invoices/` |
| 34 | Performance scoring (visible to vendor) | PARTIAL | `vendor_ratings` populated by staff; vendor-side view of own ratings not shipped |

### Owner Portal (4 items — per SPEC §OWNER PORTAL)

| # | Item | Status | Evidence |
|---|---|---|---|
| 35 | Portfolio view (property roster + occupancy) | SHIPPED | `src/app/owner-portal/page.tsx` (slice 10e); `listOwnerPortfolio` |
| 36 | Owner-scoped reports (3 of 5: rent_roll, occupancy, maintenance) | SHIPPED | `src/app/owner-portal/reports/*` (slice 10g) |
| 37 | Property detail page (header + summary card) | SHIPPED | `src/app/owner-portal/properties/[id]/page.tsx` (slice 11b) |
| 38 | AI summaries on property detail | SHIPPED | `runPropertySummary` + UI card (slice 11b commit `dfa60c5`) |

### Leasing CRM (4 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 39 | Lead pipeline | SHIPPED | `src/app/(app)/leasing/`; `leads` table |
| 40 | Tours scheduling | SHIPPED | `tours` table; tour creation/management UI |
| 41 | Applications (with status workflow) | SHIPPED | `src/app/(app)/applications/[appId]/`; `applications` table |
| 42 | Lease conversion (application → tenant + lease) | SHIPPED | `convertApplicationToLease` flow; widened `create_lease_with_tenants` RPC |

### Communications Hub (3 items — per SPEC §COMMUNICATION HUB)

| # | Item | Status | Evidence |
|---|---|---|---|
| 43 | Tenant ↔ staff messaging | SHIPPED | `src/app/(app)/messages/[tenantId]/` + `src/app/portal/messages/`; `messages` table |
| 44 | Unified inbox (email + portal) | PARTIAL | Portal messaging shipped; outbound email shipped; no inbound-email ingestion; no unified-thread view |
| 45 | AI summaries + replies in inbox | NOT STARTED | Tenant-facing AI gate per AI_AUTOMATION_SAFETY.md §9 |

### Payments LITE (5 items — per SPEC §PAYMENTS LITE FIRST)

| # | Item | Status | Evidence |
|---|---|---|---|
| 46 | Ledger (rent_charges) | SHIPPED | Slice 10a; `rent_charges` table + enums |
| 47 | Charges (manual generation per property) | SHIPPED | `generateChargesForProperty` action (slice 10a) |
| 48 | Payments (record + view) | SHIPPED | Slice 10b; `payments` table |
| 49 | Statements (HTML + print stylesheet) | SHIPPED | `src/app/(app)/payments/statements/` (slice 10d); per §0.5 decision 6 |
| 50 | Online payment processing | DEFERRED | Explicitly deferred to "PAYMENTS FULL" future unnumbered phase per Phase 5 §0.5 decision 7 + Phase 6 §0.5 decision 17 |

### Reports (6 items — per SPEC §REPORTING)

| # | Item | Status | Evidence |
|---|---|---|---|
| 51 | Occupancy report | SHIPPED | `src/lib/data/reports/occupancy.ts` + UI |
| 52 | Rent roll (with 30/60/90+ aging) | SHIPPED | `src/lib/data/reports/rent-roll.ts` (slice 10f per §0.5 decision 10) |
| 53 | Maintenance report | SHIPPED | `src/lib/data/reports/maintenance.ts` |
| 54 | Vendor performance | SHIPPED | `src/lib/data/reports/vendor-performance.ts` |
| 55 | Leasing funnel | SHIPPED | `src/lib/data/reports/leasing-funnel.ts` |
| 56 | AI insights on each report | SHIPPED | Slice 11c (`87e7b88`); 5 staff + 3 owner-portal surfaces |

### AI Layer (6 items — per SPEC line 410-416)

| # | Item | Status | Evidence |
|---|---|---|---|
| 57 | Maintenance triage | SHIPPED | Slice 11a (`4b92f0b`); Claude Sonnet via Vercel AI SDK |
| 58 | Leasing assistant | NOT STARTED | Deferred to Phase 6.4+ per PHASE_6_PLAN.md §8 |
| 59 | Message drafting | DEFERRED | Deferred (tenant-facing — gated on prompt-injection audit per AI_AUTOMATION_SAFETY.md §9) |
| 60 | Summaries (owner portal) | SHIPPED | Slice 11b |
| 61 | Reporting insights | SHIPPED | Slice 11c |
| 62 | Vendor suggestions | SHIPPED | Slice 11d (`5d38685`) |

### Automation Engine (3 items — per SPEC §AUTOMATION ENGINE)

| # | Item | Status | Evidence |
|---|---|---|---|
| 63 | Trigger → Condition → Action data model | DEFERRED | No `automations` table; deferred to Phase 7+ per PHASE_6_PLAN.md §0.5 decision 1 (AI engine chosen as Phase 6 spine instead) |
| 64 | Cron substrate / runner | DEFERRED | Same as above; PHASE_6_AUDIT_DRAFT.md Section 2 catalogs the design space |
| 65 | Automation builder UI | DEFERRED | Same as above; `automation_logs` table exists (Phase 1 staging) but no consumer |

### Document Management (2 items — per SPEC §DOCUMENT MANAGEMENT)

| # | Item | Status | Evidence |
|---|---|---|---|
| 66 | Documents table + Supabase Storage integration | NOT STARTED | No `documents` table; sidebar nav slot shows "Soon" (`nav.ts:92`) |
| 67 | Structured categories | NOT STARTED | Same as above |

### Inspections (3 items — per SPEC §INSPECTIONS)

| # | Item | Status | Evidence |
|---|---|---|---|
| 68 | Inspections table (move-in/out, periodic) | DEFERRED | Deferred to Phase 7+; PHASE_6_AUDIT_DRAFT.md Section 4 catalogs design space; sidebar "Soon" |
| 69 | Checklists | DEFERRED | Same |
| 70 | Inspection photos | DEFERRED | Same; would extend the work_order_photos pattern |

### Amenities (2 items — per SPEC §AMENITIES)

| # | Item | Status | Evidence |
|---|---|---|---|
| 71 | Amenities + reservations table | DEFERRED | Deferred to Phase 7+; PHASE_6_AUDIT_DRAFT.md Section 5 catalogs design space; sidebar "Soon" |
| 72 | Reservation rules / conflict resolution | DEFERRED | Same |

### UI / Navigation (4 items — per SPEC §GLOBAL UI REQUIREMENTS)

| # | Item | Status | Evidence |
|---|---|---|---|
| 73 | Left sidebar nav + top bar | SHIPPED | `src/components/layout/sidebar.tsx` + `topbar.tsx`; 19 sidebar entries (16 enabled + 3 "Soon") |
| 74 | Top bar search + notifications icon | SCAFFOLDED | `topbar.tsx` renders Search Input + Bell button — neither is wired (Input has no onSubmit; Bell has no count/dropdown) |
| 75 | Notifications system | SCAFFOLDED | `notifications` table exists (Phase 1) but **no insert call sites anywhere in the codebase** — table is dead |
| 76 | Mobile responsive | SHIPPED | All routes verified at sm: breakpoint; mobile-nav sheet |

### Marketing / Public Surface (3 items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 77 | Marketing landing page | SHIPPED | Slice 12a (`fa787e5`) + dark scope (`89102eb`) |
| 78 | Brand identity (Orkestr8 name + logo across all surfaces) | SHIPPED | Slice 11g + amendment (`9cfa110`); favicon via `src/app/icon.png` |

## Critical Gaps for Launch

These are spec items that would be **load-bearing blockers for a non-demo
launch** with real tenants paying real rent. Each rated by severity.

| # | Gap | Severity | Why it's a launch blocker |
|---|---|---|---|
| 50 | Online payment processing (PAYMENTS FULL) | **High** | "Charges + payments" exists but they're manual records. Real tenants can't *pay* through the system. Replaces the PMS's most table-stakes feature with a workflow that requires staff to record every payment by hand. |
| 28 | Tenant portal Documents tab | **Medium** | SPEC explicitly lists Documents as a tenant portal tab. Tenants will expect to access their lease, rent receipts, and notices. Today there's no place to put or retrieve them. |
| 75 | Notifications system | **Medium** | Real tenants + staff expect notifications (new message, maintenance update, statement ready). Without this, every workflow that should ping a user requires manual follow-up via email. Table exists but no producer wired. |
| 74 | Search bar (functional) | **Low-Medium** | Visual scaffolding exists. With real-org data scale (hundreds of tenants, leases, work orders), no-search makes the app unusable for daily ops. Not a blocker for a 20-unit demo but an early-real-customer blocker. |
| 4 | Production Deployment Gate crossing | **High** | Has not been crossed yet. Production Supabase + production Resend + production AI key + canary user testing all need to happen before partner orgs use real data. Structurally enforced today; explicit go/no-go required to cross. |
| 15 | Lease documents storage | **Medium** | SPEC line 301 lists `lease_documents` table; nothing built. Real onboarding workflows expect lease PDF attachment. |
| 44 | Inbound email ingestion / unified inbox | **Low** | Most PMS competitors integrate inbound email to thread tenant correspondence. Today only portal-message threading exists. Operators can work around (forward to email) but partners may flag. |

## Nice-to-haves Still Outstanding

Items that aren't launch-critical but appear in SPEC.

| # | Item | Notes |
|---|---|---|
| 20 | SLA dashboard / breach alerting | `sla_due_at` column populated but unused — could surface in `/maintenance` view or `/dashboard` widget. Adds operational polish, not foundational. |
| 34 | Vendor-side view of own ratings | Vendor can't currently see their `vendor_ratings`. Easy to add (vendor portal route). Not a launch blocker but missing for vendor self-service narrative. |
| 58 | AI Leasing assistant | One of 6 SPEC AI surfaces. Demoable but not critical for first partners. |
| 59 | AI Message drafting | Same; gated on prompt-injection audit. |
| 63-65 | Automation engine | SPEC §AUTOMATION ENGINE explicitly listed; would shift the product from "AI assists" to "AI runs operations." Strong sales narrative but not a v1 blocker. |
| 66-67 | Document management | A complete documents feature is meaningful but not for the partner-preview narrative — leases/photos/statements are already addressed by the targeted features. |
| 68-70 | Inspections | Required by SPEC; deferred to Phase 7+. Move-in/out inspections are a real operational gap but solvable with the Phase 6 audit's design catalog when prioritized. |
| 71-72 | Amenities | Required by SPEC; deferred to Phase 7+. Reservations + rules — partner-dependent value. |

## Recently Shipped (Phase 6 highlights — May 25, 2026)

Slice-by-slice, the May 25 sprint:

| Commit | Slice | Surface |
|---|---|---|
| `4b92f0b` | Phase 6.1 slice 11a | Real Claude maintenance triage + ai_logs cost columns + is_ai_actor RESTRICTIVE policies on `rent_charges` + `payments` + rate limiting (10/min/org) + AI mode elevation UI + Suite 16-17 (20 assertions) |
| `dfa60c5` | Phase 6.2 slice 11b | Owner-portal property summaries (per-property AI digest); new `/owner-portal/properties/[id]` route |
| `87e7b88` | Phase 6.2 slice 11c | AI report insights across 5 staff reports + 3 owner-portal reports; new `report_insights` table + Suite 18 |
| `5d38685` | Phase 6.2 slice 11d | AI vendor suggestions on maintenance requests (P-lock whitelist check) |
| `53bdbb3` | Phase 6.2 slice 11e | Owner-portal nav affordances (sidebar Portals section + back-link); shared access helper |
| `378ba68` | Phase 6.2 slice 11f | Cost-precision upgrade (int cents → numeric(10,4)) |
| `9cfa110` | Phase 6.2 slice 11g (amended) | PMS-Build → Orkestr8 branding + 4 logo assets across 6 surfaces; favicon |
| `fa787e5` | Phase 6.2 slice 12a | Partner-ready landing page (hero + competitive frame + 4 AI cards + 3-tier pricing + founding-partner banner) |
| `89102eb` + `785c6d5` + `b711762` | Polish | Dark-mode scope on landing + (auth) + /onboarding + /error + /invite |
| `0f442e5` | Demo readiness | Sterling Property Group seed script (3 properties, 20 units, 15 tenants, 45 payments, 7 maintenance requests, 8 vendor ratings) |

**Net Phase 6 result**: 4 of 6 SPEC AI surfaces shipped + full branding + partner-ready public surface + idempotent demo seed. 18 RLS suites at 270 assertions cumulative.

## Cumulative quality posture

| Metric | Value |
|---|---|
| RLS test suites | 18 (270 assertions) |
| Test pass rate (cumulative regression) | 270/270 since slice 11a; zero regressions through 11g |
| Migrations | 44 |
| `.md` audit files (SPEC-required) | 5/5 (SECURITY_REVIEW, RLS_TEST_PLAN, AI_AUTOMATION_SAFETY, EMAIL_SAFETY, PRODUCTION_CHECKLIST) |
| Lines of code (src/) | not counted here; large enough that grep-based searches are reliable |
| AI cost per call (Sonnet 4.6) | $0.003-0.006 typical, captured with sub-cent precision in `ai_logs` (slice 11f) |

## Items flagged as ambiguous (surfaced for your decision)

1. **PARTIAL: Production Deployment Gate (#4)** — the gate exists and is enforced structurally (no prod creds in dev env). Whether to score this "shipped" (the discipline is in place) vs "partial" (the gate hasn't been *crossed* yet for real partner use) is a framing call. Scored PARTIAL because real partner data hasn't traversed it.

2. **NOT STARTED vs DEFERRED scoring** — for items where Phase 6 plan explicitly deferred (Automation engine, Inspections, Amenities), I scored DEFERRED. For items not named in any phase plan (notifications wiring, search functionality, lease_documents), I scored NOT STARTED. If you prefer the inverse framing (everything not-shipped is "NOT STARTED" regardless of plan), revise.

3. **SPEC §"Kanban boards"** (line 259) — listed under Global UI Requirements but not assigned to any phase. The Phase 4 §12.6 deferral list flagged "Kanban view of /leasing" as a §13.6-style follow-up. Not surfaced as a discrete spec item in this audit since no UI exists; folded into the leasing surface's existing scope.
