# RLS_TEST_PLAN.md — Row Level Security test plan

> **Status: EXECUTED — cross-org 13/13 (2026-05-18), within-org role
> isolation R1–R5 5/5 (2026-05-19), Phase 2 (vendors / maintenance /
> work orders) 23/23 (2026-05-19), user-columns pin (SECURITY_REVIEW.md
> §8.4 fix) 10/10 (2026-05-19), Phase 2 §8.1/§8.2/§8.3 closure 25/25
> (2026-05-19), and users_select staff gate (SECURITY_REVIEW.md §7 fix)
> 8/8 (2026-05-19). Phase 3 complete: accept_tenant_invite RPC (Suite 8)
> 15/15 (2026-05-23), messages immutability (Suite 12) 14/14 (2026-05-23),
> leases tenant-self (Suite 7) 7/7 (2026-05-23), maintenance tenant-self
> (Suite 11) 10/10 (2026-05-23), tenant_invites lifecycle (Suite 9)
> 9/9 (2026-05-23), units/properties tenant-self + lease-mediated
> (Suite 10) 11/11 (2026-05-23). Phase 4 complete: leasing CRM
> (Suite 13) 31/31 (2026-05-24). Phase 5 complete: entities (Suite 14)
> 25/25 (2026-05-24), owner portal + recursion safety (Suite 15)
> 32/32 (2026-05-24). Phase 6 in progress: is_ai_actor RESTRICTIVE
> (Suite 16) 12/12 (2026-05-25), AI rate-limit semantics (Suite 17)
> 8/8 (2026-05-25), report_insights RLS (Suite 18) 12/12 (2026-05-25).
> All 270 executed assertions pass; 0 errored.**
>
> **Phase 3 RLS coverage gap CLOSED.** All six Phase 3 suites (7-12) are
> now authored and passing.
>
> **Phase 4 RLS coverage CLOSED.** All three Phase 4 entity tables
> (leads / tours / applications) plus the slice-9d cross-cutting changes
> (tenants.source_application_id additive column +
> create_lease_with_tenants RPC authority widening) are now verified by
> automated test.
>
> **Phase 5 RLS coverage CLOSED.** Three new entity tables (rent_charges,
> payments, property_owners) verified by Suite 14. Owner-self read
> branches across six drop-and-recreated _select policies + the six
> SECURITY DEFINER recursion-fix helpers + the dedicated R1-R7
> recursion-safety assertion class verified by Suite 15. Cumulative
> regression run 2026-05-24 confirmed zero pre-existing-suite
> regressions. Gate 1 §13 sign-off can reference these suites as
> Phase 5's policy-test surface. Human RLS sign-off remains outstanding —
> see SECURITY_REVIEW.md.
>
> Run against the dev database over the Session pooler connection. Human RLS
> sign-off remains outstanding — see SECURITY_REVIEW.md.

## 1. Approach

RLS policies depend on `auth.uid()`, which resolves from the JWT claim `sub`.
Tests simulate a signed-in user in plain SQL with:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>"}';
```

A runnable script is provided at `supabase/tests/rls_cross_org.sql`. It seeds
two organizations and rolls everything back at the end.

## 2. Fixtures

- **Org A** with user **A-owner** (role `OWNER`) and **A-mgr** (`PROPERTY_MANAGER`).
- **Org B** with user **B-owner** (role `OWNER`).
- One property, building, unit, and tenant created in each org.

## 3. Test matrix

| # | Acting as | Action | Expected |
|---|---|---|---|
| 1 | A-owner | `select` Org A properties | ✅ rows returned |
| 2 | A-owner | `select` Org B properties | ✅ **0 rows** |
| 3 | A-owner | `select` Org B units / buildings / tenants | ✅ **0 rows** |
| 4 | A-owner | `update` an Org B property | ✅ **0 rows affected** |
| 5 | A-owner | `delete` an Org B property | ✅ **0 rows affected** |
| 6 | A-owner | `insert` a property with `organization_id` = Org B | ✅ **rejected** by WITH CHECK |
| 7 | B-owner | `select` Org A tenants (PII) | ✅ **0 rows** |
| 8 | A-mgr | `select` own org properties | ✅ rows returned |
| 9 | A-owner | `select` own `users` row | ✅ returned |
| 10 | A-owner | `select` Org B `users` rows | ✅ **0 rows** |
| 11 | A-owner | `update` own `users` row, set `is_super_admin = true` | ✅ flag stays `false` (trigger) |
| 12 | A-owner | `update` own `users` row, change `organization_id` | ✅ **rejected** (trigger) |
| 13 | anon (no JWT) | `select` any table | ✅ **0 rows** / denied |
| 14 | A-owner | `select` Org B `audit_logs` | ✅ **0 rows** |
| 15 | A-owner | `insert` into `audit_logs` directly | ✅ **rejected** (no INSERT policy) |

## 4. Role-isolation checks (same org)

| # | Acting as | Action | Expected |
|---|---|---|---|
| R1 | role `TENANT` only | `select` `properties` | ✅ **0 rows** (not staff) |
| R2 | role `LEASING_AGENT` | `insert` a `tenant` | ✅ allowed |
| R3 | role `LEASING_AGENT` | `insert` a `property` | ✅ **rejected** (not a manager) |
| R4 | role `MAINTENANCE_TECH` | `select` `properties` | ✅ allowed (staff) |
| R5 | role `MAINTENANCE_TECH` | `update` a `property` | ✅ **rejected** (not a manager) |

## 4b. Phase 2 test matrix (vendors / maintenance / work orders)

Fixtures: two orgs; Org A has an owner, a `MAINTENANCE_TECH`, and a
`VENDOR_ADMIN` portal user linked to vendor V1; two vendors (V1, V2) in Org A
and one (V3) in Org B; work orders WO1→V1 and WO2→V2 in Org A, WO3 in Org B.
Implemented in `supabase/tests/rls_phase2.sql`.

| # | Acting as | Action | Expected |
|---|---|---|---|
| P1 | A-owner | `select` `vendors` | ✅ 2 rows (Org A only) |
| P2 | A-owner | `select` `work_orders` | ✅ 2 rows (Org A only) |
| P3 | A-owner | `select` Org B `maintenance_requests` | ✅ **0 rows** |
| P4 | A-owner | `insert` `work_order` with `organization_id` = Org B | ✅ **rejected** by WITH CHECK |
| P5 | A-owner | `update` an Org B `work_order` | ✅ **0 rows affected** |
| V1 | V1 portal user | `select` `vendors` | ✅ 1 row — only its own vendor |
| V2 | V1 portal user | `select` `work_orders` | ✅ 1 row — only WO1 (assigned to V1) |
| V3 | V1 portal user | `select` `maintenance_requests` | ✅ **0 rows** (vendors never see requests) |
| V4 | V1 portal user | `select` `work_order_photos` | ✅ 1 row — only WO1's photo |
| V5 | V1 portal user | `select` `vendor_invoices` | ✅ 1 row — only its own |
| V6 | V1 portal user | `select` `properties` | ✅ **0 rows** (not org staff) |
| V7 | V1 portal user | `update` WO1 status | ✅ allowed (own work order) |
| V8 | V1 portal user | `update` WO1 `assigned_vendor_id` → V2 | ✅ **rejected** by WITH CHECK |
| V9 | V1 portal user | `update` WO2 (assigned to V2) | ✅ **0 rows affected** |
| V10 | V1 portal user | `delete` WO1 | ✅ **0 rows** (delete is manager-only) |
| V11 | V1 portal user | `insert` a `work_order` | ✅ **rejected** (insert is staff-only) |
| RW1 | A-tech (`MAINTENANCE_TECH`) | `select` `work_orders` | ✅ allowed (staff) |
| RW2 | A-tech | `select` `maintenance_requests` | ✅ allowed (staff) |
| RW3 | A-tech | `update` a `work_order` | ✅ allowed (update is staff) |
| RW4 | A-tech | `delete` a `work_order` | ✅ **0 rows** (not a manager) |
| RW5 | A-tech | `delete` a `maintenance_request` | ✅ **0 rows** (not a manager) |
| RW6 | A-tech | `insert` a `vendor` | ✅ **rejected** (not a manager) |
| AN1 | anon (no JWT) | `select` `work_orders` | ✅ **0 rows** / denied |

## 4c. User-columns pin test (SECURITY_REVIEW.md §8.4 fix)

Implemented in `supabase/tests/user_columns_pin.sql`. Verifies that
migration `20260519001000_protect_user_columns_pin.sql` closes the
`NULL → value` self-set window on `users.vendor_id` and
`users.organization_id` for `authenticated`/`anon` callers, while
preserving the legitimate provisioning paths.

| # | Acting as | Action | Expected |
|---|---|---|---|
| P1 | (privileged) | `insert auth.users` row | ✅ `public.users` created with both columns NULL via `handle_new_user` |
| P2 | `authenticated` (self) | `update users set vendor_id = …` | ✅ trigger silently pins; `vendor_id` stays NULL |
| P3 | `authenticated` (self) | `update users set organization_id = …` | ✅ trigger silently pins; `organization_id` stays NULL |
| P4 | `authenticated` (self) | `update users set full_name = …` | ✅ allowed — non-protected column unaffected |
| P5 | `authenticated` (self) | `select create_organization(…)` | ✅ SECURITY DEFINER path sets `organization_id` |
| P6 | `authenticated` (self) | `update users set organization_id = null` | ✅ cleared attempt rejected; stays set |
| P7 | `authenticated` (self) | `update users set organization_id = '<other>'` | ✅ reassignment attempt rejected; stays as own org |
| P8 | trusted role (`postgres`) | `update users set vendor_id = …` | ✅ allowed (NULL → value) |
| P9 | trusted role (`postgres`) | `update users set vendor_id = '<other>'` | ✅ **raises** — defense-in-depth reassignment guard |
| P10 | trusted role (`postgres`) | `update users set organization_id = '<other>'` | ✅ **raises** — defense-in-depth reassignment guard |

## 4d. Phase 2 §8.1 / §8.2 / §8.3 closure test

Implemented in `supabase/tests/rls_phase2_blockers_closed.sql`. Verifies
the fixes from migrations `20260519001100` (org_id pin on vendor writes),
`20260519001200` (vendor invoice status restriction), and `20260519001300`
(SELECT role gate). Each fix is exercised in BOTH directions — hole
closed AND legitimate vendor-portal behaviour preserved.

| Block | Cases | What's proved |
|---|---|---|
| §8.3 | R1–R4 | a stray-vendor-id user with no `VENDOR_*` role sees 0 rows on vendors / work_orders / vendor_invoices / work_order_photos |
| §8.3 regression | R5–R8 | a legitimate vendor user still sees own vendor row, assigned work orders, own invoices, photos on assigned WOs |
| §8.1 | C2, C3, C5, C7 | vendor cannot move work_order / invoice between orgs; vendor cannot INSERT photo or invoice with mismatched `organization_id` |
| §8.1 regression | C1, C4, C6, C8 | vendor still updates own WO status; still inserts photo with matching org; still inserts invoice (`draft`); still updates non-protected invoice fields |
| §8.2 | S1, S2, S3, S6 | vendor cannot INSERT invoice with status `approved` / `paid` / `rejected`; cannot UPDATE existing invoice to `paid` |
| §8.2 regression | S4, S5, S7 | vendor CAN INSERT with `draft` / `submitted`; can UPDATE to `draft` |
| §8.2 staff | S8, S9 | staff manager retains full status control (INSERT `approved`, UPDATE to `paid`) |

## 4e. users_select staff gate (SECURITY_REVIEW.md §7 fix)

Implemented in `supabase/tests/users_select_staff_gate.sql`. Verifies the
fix from migration `20260519001400_users_select_staff_gate.sql`: the
`users_select` policy's org-id branch is now gated by `is_org_staff()`,
closing the Phase-3 portal cross-tenant directory disclosure.

Fixtures: Org A with 2 staff (OWNER, PROPERTY_MANAGER) and 2 non-staff
with `organization_id` set (TENANT, VENDOR_ADMIN — the attack vectors);
Org B with 1 staff (OWNER) for cross-org regression.

| # | Acting as | Action | Expected |
|---|---|---|---|
| U1 | TENANT (non-staff, org_id set) | `select * from users` | ✅ 1 row — own only |
| U2 | TENANT | `select … where id = auth.uid()` | ✅ self-read works |
| U3 | TENANT | `select … where id in (<staff ids>)` | ✅ 0 rows |
| U4 | VENDOR_ADMIN (vendor-portal, non-staff) | `select * from users` | ✅ 1 row — own only |
| U5 | OWNER (staff) | `select … where organization_id = own org` | ✅ 4 rows |
| U6 | PROPERTY_MANAGER (staff) | `select … where organization_id = own org` | ✅ 4 rows |
| U7 | OWNER@A | `select … where organization_id = Org B` | ✅ 0 rows (cross-org) |
| U8 | anon | `select * from users` | ✅ 0 rows / denied |

## 4f. Phase 3 Suite 7 — leases tenant-self

Implemented in `supabase/tests/rls_phase3_leases_tenant_self.sql`.
Verifies the `leases_select` tenant-self branch and `leases_write`
manager-only gating from migration `20260521000100`. A tenant linked
via `tenants.lease_id` sees that lease only; tenants without a
`lease_id` (T-orphan) see 0 leases; cross-org leases are invisible;
no tenant can UPDATE / DELETE / INSERT.

| # | Acting as | Action | Expected |
|---|---|---|---|
| L1 | Org A PROPERTY_MANAGER | `select` `leases` | ✅ 1 row (Org A only) |
| L2 | tenant T1 (lease_id = L1) | `select` `leases` (filter id = L1) | ✅ 1 row via tenant-self branch |
| L3 | tenant T1 | `select` `leases` (filter id = L2, Org B) | ✅ **0 rows** |
| L4 | T-orphan (TENANT role, lease_id null) | `select` `leases` | ✅ **0 rows** |
| L5 | tenant T1 | `update` L1 monthly_rent | ✅ **0 rows**; value unchanged |
| L6 | tenant T1 | `delete` L1 | ✅ **0 rows**; row remains |
| L7 | tenant T1 | `insert` a new lease | ✅ **rejected** (manager-only WITH CHECK) |

## 4g. Phase 3 Suite 8 — accept_tenant_invite RPC

Implemented in `supabase/tests/rls_phase3_accept_tenant_invite.sql`.
Verifies the SECURITY DEFINER RPC from migration `20260524000200`: the
four classified error codes (`not_found` / `already_accepted` /
`revoked` / `expired`) return without state mutation; successful
acceptance atomically updates all four target tables
(`tenants.user_id`, `tenant_invites.accepted_at/by`,
`users.organization_id`, `user_roles` insert); the function is
SECURITY DEFINER (`pg_proc.prosecdef`); EXECUTE is granted to
`authenticated` + `service_role` and revoked from `public`/`anon`;
`token_hash` matching is exact (off-by-one returns `not_found`).

| # | Acting as | Action | Expected |
|---|---|---|---|
| A1 | acceptor (auth) | call with bogus token_hash | ✅ ok=false, code=not_found |
| A2 | acceptor (auth) | call against already-accepted invite | ✅ ok=false, code=already_accepted (no state mutation) |
| A3 | acceptor (auth) | call against revoked invite | ✅ ok=false, code=revoked (no state mutation) |
| A4 | acceptor (auth) | call against expired invite | ✅ ok=false, code=expired (no state mutation) |
| A5 | acceptor (auth) | call against pending invite | ✅ ok=true; tenants.user_id / tenant_invites.accepted_at / users.organization_id / user_roles all updated |
| A6 | (privileged) | `pg_proc.prosecdef` for accept_tenant_invite | ✅ true |
| A7 | (privileged) | `routine_privileges` for accept_tenant_invite | ✅ no PUBLIC/anon; EXECUTE to authenticated + service_role |
| A8 | acceptor (auth) | call with token_hash off-by-one from real | ✅ ok=false, code=not_found; INV1 unchanged |

## 4h. Phase 3 Suite 9 — tenant_invites lifecycle

Implemented in `supabase/tests/rls_phase3_tenant_invites_lifecycle.sql`.
Verifies the `tenant_invites_select` / `tenant_invites_write` policies
from migration `20260522000100` (both gated on `can_write_tenants()`)
plus the mutual-exclusion CHECK constraint
(`accepted_at IS NULL OR revoked_at IS NULL`). PROPERTY_MANAGER and
LEASING_AGENT can read+write; MAINTENANCE_TECH is `is_org_staff` but
NOT `can_write_tenants` so reads AND writes deny for them. The CHECK
constraint rejects any insert with both `accepted_at` and `revoked_at`
non-null.

| # | Acting as | Action | Expected |
|---|---|---|---|
| I1 | Org A PROPERTY_MANAGER | `select` `tenant_invites` | ✅ 1 row (seed) |
| I2 | Org A LEASING_AGENT | `select` `tenant_invites` | ✅ 1 row (can_write_tenants parity with PM) |
| I3 | Org A MAINTENANCE_TECH | `select` `tenant_invites` | ✅ **0 rows** (no can_write_tenants) |
| I4 | Org A PROPERTY_MANAGER | `insert` invite | ✅ allowed; row count + 1 |
| I5 | Org A LEASING_AGENT | `insert` invite | ✅ allowed |
| I6 | Org A MAINTENANCE_TECH | `insert` invite | ✅ **rejected** (can_write_tenants gate) |
| I7 | Org B PROPERTY_MANAGER | `select` (Org A invites) | ✅ **0 rows** (cross-org pin) |
| I8 | Org A PROPERTY_MANAGER | `insert` with both `accepted_at` and `revoked_at` set | ✅ **rejected** by CHECK constraint |
| I9 | Org A PROPERTY_MANAGER | `update` seed invite — set `revoked_at` + `revoked_by` | ✅ allowed; fields actually set |

## 4i. Phase 3 Suite 10 — tenant-self units / properties + lease-mediated

Implemented in `supabase/tests/rls_phase3_units_properties_tenant_self.sql`.
Verifies the `units_select` / `properties_select` tenant-self branches
from migrations `20260524000100` (direct via `tenants.unit_id`) and
`20260525000100` (lease-mediated via `tenants.lease_id → leases.unit_id`).
Four tenant scenarios per table + a regression for the §11.1.7 design
decision that the lease join has no status filter (TE with a lease where
`status = 'ended'` still sees the unit/property).

| # | Acting as | Action | Expected |
|---|---|---|---|
| U1 | TA (`unit_id`=UA1, no lease) | `select` `units` | ✅ 1 row — UA1 (direct branch) |
| U2 | TB (`unit_id` null, lease→UA2) | `select` `units` | ✅ 1 row — UA2 (lease-mediated branch) |
| U3 | TC (`unit_id`=UA1 + lease→UA2) | `select` `units` | ✅ 2 rows — UA1 + UA2 (both branches) |
| U4 | TD (`unit_id` null, no lease) | `select` `units` | ✅ **0 rows** (neither branch) |
| U5 | TB | `select` `units` filtered to UB1 (Org B) | ✅ **0 rows** (cross-org) |
| U6 | TE (lease.status = 'ended', unit_id=UA1) | `select` `units` | ✅ 1 row — UA1; lease join has **no status filter** (§11.1.7 regression) |
| P1 | TA | `select` `properties` | ✅ 1 row — PA1 (direct chain to property) |
| P2 | TB | `select` `properties` | ✅ 1 row — PA2 (lease-mediated chain to property) |
| P3 | TC | `select` `properties` | ✅ 2 rows — PA1 + PA2 |
| P4 | TD | `select` `properties` | ✅ **0 rows** |
| P5 | TB | `select` `properties` filtered to PB1 (Org B) | ✅ **0 rows** (cross-org) |

## 4j. Phase 3 Suite 11 — tenant-self maintenance INSERT/SELECT

Implemented in `supabase/tests/rls_phase3_maintenance_tenant_self.sql`.
Verifies the `maintenance_requests_select` / `_insert` tenant-self
branches from migration `20260526000100`. SELECT: a tenant sees
requests where `tenant_id` points at their row (even when staff
created the request on their behalf), plus requests they reported via
`reported_by = auth.uid()`. INSERT: a tenant can insert with their
own auth.uid() as `reported_by`, their own org, and their tenant_id
(or NULL) — and is blocked when any of those three conditions fails.

| # | Acting as | Action | Expected |
|---|---|---|---|
| Q1 | Org A PROPERTY_MANAGER | `select` `maintenance_requests` | ✅ 2 rows (R1 + R2; not R3) |
| Q2 | tenant T1 (reporter of R1) | `select` `maintenance_requests` | ✅ 1 row (R1 via reported_by branch) |
| Q3 | tenant T2 (R2 staff-created on their behalf) | `select` `maintenance_requests` | ✅ 1 row (R2 via tenant-by-tenant_id branch) |
| Q4 | tenant T1 | `select` request R2 (T2's) | ✅ **0 rows** |
| Q5 | Org B PROPERTY_MANAGER | `select` `maintenance_requests` | ✅ 1 row (R3 only) |
| Q6 | tenant T1 | `select` request R3 (Org B) | ✅ **0 rows** |
| Q7 | tenant T1 | `insert` with own org + tenant_id + reported_by | ✅ allowed; row count + 1 |
| Q8 | tenant T1 | `insert` with `reported_by` = T2's uid | ✅ **rejected** (forgery guard) |
| Q9 | tenant T1 | `insert` with cross-org `organization_id` | ✅ **rejected** (defense-in-depth) |
| Q10 | tenant T1 | `insert` with `tenant_id` = T2.id | ✅ **rejected** (defense-in-depth) |

## 4k. Phase 3 Suite 12 — messages immutability + sender_role gating

Implemented in `supabase/tests/rls_phase3_messages_immutable.sql`.
Verifies the `messages_select` / `messages_insert` policies from
migration `20260527000100` plus the table's IMMUTABILITY (no UPDATE,
no DELETE policy ⇒ RLS denies all rows for those operations).

| # | Acting as | Action | Expected |
|---|---|---|---|
| M1 | Org A staff PM | `select` Org A messages | ✅ 1 row (seed message) |
| M2 | Org A MAINTENANCE_TECH | `select` Org A messages | ✅ 1 row — any is_org_staff reads |
| M3 | tenant T1 (Org A) | `select` own conversation | ✅ 1 row |
| M4 | tenant T2 (Org A, diff conv) | `select` T1's conv | ✅ **0 rows** |
| M5 | Org B PM (cross-org) | `select` Org A messages | ✅ **0 rows** |
| M6 | Org A staff PM | `insert` sender_role=staff into T1 conv | ✅ allowed |
| M7 | MAINTENANCE_TECH | `insert` sender_role=staff | ✅ **rejected** (no can_write_tenants) |
| M8 | tenant T1 | `insert` sender_role=tenant into own conv | ✅ allowed |
| M9 | tenant T1 | `insert` sender_role=tenant into T2 conv | ✅ **rejected** (defense-in-depth) |
| M10 | tenant T1 | `insert` sender_role=staff (impersonate) | ✅ **rejected** |
| M11 | staff PM | `insert` with sender_id ≠ auth.uid() | ✅ **rejected** (sender_id pin) |
| M12 | tenant T1 | `insert` with mismatched organization_id | ✅ **rejected** (defense-in-depth) |
| M13 | staff PM | `update` messages | ✅ **0 rows** (no policy); body unchanged |
| M14 | staff PM | `delete` messages | ✅ **0 rows** (no policy); row remains |

## 4l. Phase 4 Suite 13 — leasing CRM (leads / tours / applications + RPC widening)

Implemented in `supabase/tests/rls_phase4_leasing.sql`. Single suite
covers all three Phase 4 entity tables plus the slice-9d cross-cutting
changes — matches the §6 "one suite for Phase 4" plan (mirrors Phase 3
Suite 9 single-file shape).

Covered migrations:
- `20260528000100_phase4_leads.sql` — leads + 4 policies
- `20260528000200_phase4_leads_cross_org_pin.sql` — leads §8.1 FK pin
  closure (slice 9a follow-up `dccbf45`)
- `20260529000100_phase4_tours.sql` — tours + 4 policies with cross-org
  FK pins built in (lead_id / unit_id / agent_id)
- `20260530000100_phase4_applications.sql` — applications + 4 policies
  with cross-org FK pins built in (unit_id / lead_id / decided_by)
- `20260531000100_phase4_lease_conversion.sql` —
  `tenants.source_application_id` additive column +
  `create_lease_with_tenants` RPC authority widened from
  `is_org_manager()` to `can_write_tenants()` per §0.5 decision 3

Narrow-read posture (per §0.5 decision 7): all three tables gate SELECT
on `can_write_tenants()`, so `MAINTENANCE_TECH` (is_org_staff but NOT
can_write_tenants) sees 0 rows on each. K3 / T3 / A3 are the load-bearing
narrow-read assertions distinguishing Phase 4 from Phase 3 messages.

A10 verifies RLS does NOT enforce the application_status transition map
(per §7 risk 4 + §3c.§8.2) — enforcement lives in the
`updateApplication` server action only. A pass here certifies the
absence of an RLS rule, not the presence of an app-layer rule.

| # | Acting as | Action | Expected |
|---|---|---|---|
| K1 | Org A PROPERTY_MANAGER | `select` `leads` | ✅ 1 row (seed Lead-A) |
| K2 | Org A LEASING_AGENT | `select` `leads` | ✅ 1 row (can_write_tenants parity) |
| K3 | Org A MAINTENANCE_TECH | `select` `leads` | ✅ **0 rows** (narrow read per §0.5 decision 7) |
| K4 | Org B PROPERTY_MANAGER | `select` Org A leads | ✅ **0 rows** (cross-org pin) |
| K5 | Org A PROPERTY_MANAGER | `insert` lead with same-org `desired_property_id` + `assigned_to` | ✅ allowed |
| K6 | Org A MAINTENANCE_TECH | `insert` lead | ✅ **rejected** (can_write_tenants gate) |
| K7 | Org A PROPERTY_MANAGER | `insert` lead with cross-org `desired_property_id` | ✅ **rejected** (§8.1 FK pin) |
| K8 | Org A PROPERTY_MANAGER | `insert` lead with cross-org `assigned_to` | ✅ **rejected** (§8.1 FK pin) |
| T1 | Org A PROPERTY_MANAGER | `select` `tours` | ✅ 1 row |
| T2 | Org A LEASING_AGENT | `select` `tours` | ✅ 1 row |
| T3 | Org A MAINTENANCE_TECH | `select` `tours` | ✅ **0 rows** (narrow read) |
| T4 | Org B PROPERTY_MANAGER | `select` Org A tours | ✅ **0 rows** |
| T5 | Org A PROPERTY_MANAGER | `insert` tour with same-org lead/unit/agent | ✅ allowed |
| T6 | Org A MAINTENANCE_TECH | `insert` tour | ✅ **rejected** |
| T7 | Org A PROPERTY_MANAGER | `insert` tour with cross-org `lead_id` | ✅ **rejected** (FK pin) |
| T8 | Org A PROPERTY_MANAGER | `insert` tour with cross-org `unit_id` | ✅ **rejected** (FK pin) |
| T9 | Org A PROPERTY_MANAGER | `insert` tour with cross-org `agent_id` | ✅ **rejected** (FK pin) |
| A1 | Org A PROPERTY_MANAGER | `select` `applications` | ✅ 1 row |
| A2 | Org A LEASING_AGENT | `select` `applications` | ✅ 1 row |
| A3 | Org A MAINTENANCE_TECH | `select` `applications` | ✅ **0 rows** (narrow read) |
| A4 | Org B PROPERTY_MANAGER | `select` Org A applications | ✅ **0 rows** |
| A5 | Org A PROPERTY_MANAGER | `insert` application with same-org `unit_id` | ✅ allowed |
| A6 | Org A MAINTENANCE_TECH | `insert` application | ✅ **rejected** |
| A7 | Org A PROPERTY_MANAGER | `insert` application with cross-org `unit_id` | ✅ **rejected** (FK pin) |
| A8 | Org A PROPERTY_MANAGER | `insert` application with cross-org `lead_id` | ✅ **rejected** (FK pin) |
| A9 | Org A PROPERTY_MANAGER | `insert` application with cross-org `decided_by` | ✅ **rejected** (FK pin) |
| A10 | Org A PROPERTY_MANAGER | `update applications set status='approved'` from `draft` directly | ✅ **succeeds** (RLS does **not** enforce the transition map; enforcement is app-layer only — §7 risk 4 + §3c.§8.2) |
| X1 | Org A LEASING_AGENT | `create_lease_with_tenants(Org A, …, p_tenant_ids := [Ten-A])` | ✅ succeeds; lease lands in Org A (widened authority per §0.5 decision 3) |
| X2 | Org A PROPERTY_MANAGER | `create_lease_with_tenants(Org A, …)` | ✅ succeeds; lease lands in Org A (manager regression — widening didn't lock out PM) |
| X3 | Org A MAINTENANCE_TECH | `create_lease_with_tenants(Org A, …)` | ✅ **rejected** SQLSTATE 42501 (widening was to can_write_tenants, not is_org_staff) |
| X4 | Org A PROPERTY_MANAGER | `insert tenants(..., source_application_id := App-A)` | ✅ allowed; column populated (additive column landed correctly) |

## 4m. Phase 5 Suite 14 — entities (rent_charges / payments / property_owners)

Implemented in `supabase/tests/rls_phase5_entities.sql`. Covers the three
new Phase 5 entity tables introduced by slices 10a (rent_charges), 10b
(payments), and 10e (property_owners junction). Same density as Suite 13
(read cohort + write gating + §8.1 cross-org FK pins per FK).

Covered migrations:
- `20260601000100_phase5_rent_charges.sql` — table + 4 policies with
  §8.1 pins on `lease_id` / `tenant_id` / `unit_id`
- `20260602000100_phase5_payments.sql` — table + 4 policies with §8.1
  pins on `charge_id` / `tenant_id` / `recorded_by` / conditional
  `refunded_by`
- `20260603000100_phase5_owner_portal.sql` — `property_owners`
  junction + 4 policies. **Writes manager-only (`is_org_manager`) —
  NOT `can_write_tenants`** — granting ownership has financial-data
  implications, LEASING_AGENT excluded.

| # | Acting as | Action | Expected |
|---|---|---|---|
| C1 | Org A PM | `select` `rent_charges` | ✅ 1 row (staff branch) |
| C2 | Org A tenant T1 | `select` `rent_charges` | ✅ 1 row (tenant-self branch) |
| C3 | Org A MT | `select` `rent_charges` | ✅ **0 rows** (narrow read — MT NOT can_write_tenants) |
| C4 | Org B PM | `select` Org A `rent_charges` | ✅ **0 rows** (cross-org isolation) |
| C5 | Org A PM | `insert` with same-org FKs | ✅ allowed |
| C6 | Org A MT | `insert` rent_charge | ✅ **rejected** (can_write_tenants gate) |
| C7 | Org A PM | `insert` with cross-org `lease_id` | ✅ **rejected** (§8.1 FK pin) |
| C8 | Org A PM | `insert` with cross-org `tenant_id` | ✅ **rejected** (§8.1 FK pin) |
| Y1 | Org A PM | `select` `payments` | ✅ 1 row |
| Y2 | Org A tenant T1 | `select` `payments` | ✅ 1 row (tenant-self) |
| Y3 | Org A MT | `select` `payments` | ✅ **0 rows** (narrow read) |
| Y4 | Org B PM | `select` Org A `payments` | ✅ **0 rows** |
| Y5 | Org A PM | `insert` with same-org FKs | ✅ allowed |
| Y6 | Org A MT | `insert` payment | ✅ **rejected** |
| Y7 | Org A PM | `insert` with cross-org `charge_id` | ✅ **rejected** (§8.1 FK pin) |
| Y8 | Org A PM | `insert` with cross-org `tenant_id` | ✅ **rejected** (§8.1 FK pin) |
| J1 | Org A PM | `select` `property_owners` | ✅ 1 row (staff branch) |
| J2 | Org A INVESTOR | `select` `property_owners` | ✅ 1 row (self-read; `user_id = auth.uid()`) |
| J3 | Org B PM | `select` Org A `property_owners` | ✅ **0 rows** |
| J4 | Org A PM | `insert` ownership grant | ✅ allowed (is_org_manager) |
| J5 | Org A LA | `insert` ownership grant | ✅ **rejected** (manager-only — LA admitted by can_write_tenants but NOT is_org_manager) |
| J6 | Org A MT | `insert` ownership grant | ✅ **rejected** |
| J7 | Org A INVESTOR | self-grant ownership | ✅ **rejected** (INVESTOR cannot self-grant — manager-only write) |
| J8 | Org A PM | `insert` with cross-org `user_id` | ✅ **rejected** (§8.1 FK pin) |
| J9 | Org A PM | `insert` with cross-org `property_id` | ✅ **rejected** (§8.1 FK pin) |

## 4n. Phase 5 Suite 15 — owner portal + recursion safety

Implemented in `supabase/tests/rls_phase5_owner_portal.sql`. Covers the
owner-self read branches across six drop-and-recreated `_select`
policies (slice 10e), drop-and-recreate preservation of staff +
tenant-self branches, dual-mode access (OWNER + property_owners), and
the **RECURSION-SAFETY assertion class (R1-R7)** — the codified slice
10e incident lesson.

Pre-recursion-fix (commit `9685840`), the slice 10e owner-self branches
used inline EXISTS subqueries that joined other RLS-protected tables in
chains. The chain formed a cycle across `units ⇄ leases ⇄ rent_charges
⇄ payments`. Postgres aborted with SQLSTATE 42P17 "infinite recursion
detected in policy for relation X". The recursion fix
(`20260603000200_phase5_owner_portal_recursion_fix.sql`) introduced six
SECURITY DEFINER helpers (`user_can_see_property` / `_unit` / `_building`
/ `_lease` / `_rent_charge` / `_payment`) that bypass RLS on the chain
walk inside the function body, breaking the cycle.

R1-R7 codifies the lesson: any RLS-gated table whose policy uses a
junction-table-mediated portal isolation pattern must include an
authenticated-role `count(*)` smoke that completes without 42P17.
R1-R7 runs as INVESTOR I1 — the role context that exercises the
helper-wrapped owner-self branches.

| # | Acting as | Action | Expected | Helper exercised |
|---|---|---|---|---|
| O1 | INVESTOR I1 (owns Prop-A) | `select properties where id=Prop-A` | ✅ 1 row | `user_can_see_property` |
| O2 | INVESTOR I1 | `select units where id=Unit-A1` | ✅ 1 row | `user_can_see_unit` |
| O3 | INVESTOR I1 | `select buildings where id=Bldg-A1` | ✅ 1 row | `user_can_see_building` |
| O4 | INVESTOR I1 | `select leases where id=Lease-A1` | ✅ 1 row | `user_can_see_lease` |
| O5 | INVESTOR I1 | `select rent_charges where id=Charge-A1` | ✅ 1 row | `user_can_see_rent_charge` |
| O6 | INVESTOR I1 | `select payments where id=Pay-A1` | ✅ 1 row | `user_can_see_payment` (deepest chain) |
| O7 | INVESTOR I2 (owns Prop-C) | `select properties where id=Prop-A` | ✅ **0 rows** (cross-owner) | |
| O8 | INVESTOR I2 | `select units where id=Unit-A1` | ✅ **0 rows** | |
| O9 | INVESTOR I2 | `select buildings where id=Bldg-A1` | ✅ **0 rows** | |
| O10 | INVESTOR I2 | `select leases where id=Lease-A1` | ✅ **0 rows** | |
| O11 | INVESTOR I2 | `select rent_charges` | ✅ **0 rows** | |
| O12 | INVESTOR I2 | `select payments` | ✅ **0 rows** | |
| O13 | tenant T1 | `select leases` | ✅ 1 row (tenant-self preserved via tenants.lease_id) | |
| O14 | tenant T1 | `select rent_charges` | ✅ 1 row (tenant-self preserved) | |
| O15 | tenant T1 | `select payments` | ✅ 1 row (tenant-self preserved) | |
| O16 | tenant T1 | `select units` | ✅ 1 row (M3LU lease-mediated preserved) | |
| O17 | tenant T1 | `select properties` | ✅ 1 row (M3LU lease-mediated preserved) | |
| O18 | PM-A | `select properties` | ✅ 2 rows (staff branch preserved) | |
| O19 | PM-A | `select buildings` | ✅ 1 row (staff preserved) | |
| O20 | PM-A | `select units` | ✅ 2 rows (staff preserved) | |
| O21 | PM-A | `select leases` | ✅ 1 row (staff preserved) | |
| O22 | PM-A | `select rent_charges` | ✅ 1 row (staff preserved) | |
| O23 | PM-A | `select payments` | ✅ 1 row (staff preserved) | |
| D1 | DUAL user (OWNER + property_owners(Prop-A)) | `select properties` | ✅ 2 rows (staff branch admits all org properties; owner branch redundant for this user — dual-mode reads OR cleanly) | |
| D2 | INVESTOR I1 (no tenant row) | `select rent_charges` | ✅ 1 row (owner-self only; no tenant-self leakage) | |
| R1 | INVESTOR I1 | `select count(*) from properties` | ✅ completes (no SQLSTATE 42P17) | recursion-safety smoke |
| R2 | INVESTOR I1 | `select count(*) from units` | ✅ completes | recursion-safety smoke |
| R3 | INVESTOR I1 | `select count(*) from buildings` | ✅ completes | recursion-safety smoke |
| R4 | INVESTOR I1 | `select count(*) from leases` | ✅ completes (pre-fix this triggered 42P17) | recursion-safety smoke |
| R5 | INVESTOR I1 | `select count(*) from rent_charges` | ✅ completes | recursion-safety smoke |
| R6 | INVESTOR I1 | `select count(*) from payments` | ✅ completes (deepest chain) | recursion-safety smoke |
| R7 | INVESTOR I1 | `select count(*) from property_owners` | ✅ completes | recursion-safety smoke |

## 4o. Phase 6 Suite 16 — is_ai_actor RESTRICTIVE policy

Implemented in `supabase/tests/rls_phase6_ai_restrictive.sql`. Covers the
`is_ai_actor()` helper + RESTRICTIVE policies on `rent_charges` +
`payments` introduced in migration `20260604000100_phase6_ai_foundation.sql`.

Posture per PHASE_6_PLAN.md §3a: the RESTRICTIVE policies AND with the
four PERMISSIVE policies on rent_charges + payments. Phase 6.1 ships no
code that flips `app.is_ai_actor`, so the policies are a no-op for real
code paths — deferred-activation defense-in-depth scaffolding.

| # | Acting as | Setting | Action | Expected |
|---|---|---|---|---|
| AI1 | privileged | no setting | `is_ai_actor()` | ✅ returns false |
| AI2 | privileged | `app.is_ai_actor=true` | `is_ai_actor()` | ✅ returns true |
| AI3 | privileged | `app.is_ai_actor=false` | `is_ai_actor()` | ✅ returns false |
| AI4 | PM-A | no flag | `insert rent_charges` | ✅ succeeds |
| AI5 | PM-A | flag set | `insert rent_charges` | ✅ **denied** (RESTRICTIVE) |
| AI6 | PM-A | flag set | `update rent_charges` | ✅ **denied** |
| AI7 | PM-A | flag set | `delete rent_charges` | ✅ **denied** |
| AI8 | PM-A | flag set | `insert payments` | ✅ **denied** |
| AI9 | PM-A | flag set | `update payments` | ✅ **denied** |
| AI10 | PM-A | flag set | `delete payments` | ✅ **denied** |
| AI11 | PM-A | no flag | `select rent_charges` | ✅ rows visible (PERMISSIVE intact) |
| AI12 | PM-A | no flag | `select payments` | ✅ rows visible (PERMISSIVE intact) |

## 4p. Phase 6 Suite 17 — AI rate-limit query semantics

Implemented in `supabase/tests/rls_phase6_rate_limit.sql`. Proves the
SQL-level properties the `checkAiRateLimit` helper depends on (PHASE_6_PLAN.md
§0.5 decision 15: 10 calls / minute / org, no SUPER_ADMIN bypass).

The helper's count query is:
`SELECT count(*) FROM ai_logs WHERE organization_id = $1 AND created_at > now() - interval '60s'`.

| # | Acting as | Action | Expected |
|---|---|---|---|
| RL1 | PM-A | window count for Org A (9 recent rows) | ✅ count = 9 |
| RL2 | PM-A | helper boolean (count < 10) | ✅ allowed (true) |
| RL3 | PM-A | window count after 10th insert | ✅ count = 10, allowed=false |
| RL4 | PM-A | window count for Org B (independent) | ✅ count = 3 (no leak from Org A) |
| RL5 | PM-A | total vs windowed (ancient row excluded) | ✅ total=11, windowed=10 |
| RL6 | PM-A | count after `blocked`-status insert | ✅ count = 11 (blocked counts) |
| RL7 | PM-A | sum(suggested) + sum(blocked) = total | ✅ all statuses counted |
| RL8 | SUPER_ADMIN ↔ PM-A | same query, same count | ✅ no SUPER_ADMIN bypass |

## 4q. Phase 6 Suite 18 — report_insights RLS

Implemented in `supabase/tests/rls_phase6_report_insights.sql`. Covers the
new `report_insights` table introduced in slice 11c migration
`20260606000100_phase6_report_insights.sql`.

Posture per PHASE_6_PLAN.md slice 11c audit decision J + J3 sub-decision:
generator-restricted INVESTOR access (sees own rows only); staff org-self
all rows; immutable from client (no UPDATE/DELETE policies). Server
action layer enforces "scope_filter.propertyIds ⊆ caller's visible
property set" — RLS does not enforce that subset.

| # | Acting as | Action | Expected |
|---|---|---|---|
| RI1 | Org A PM | `select … where organization_id = orgB` | ✅ 0 rows (cross-org isolated) |
| RI2 | Org A PM | `insert into orgB` | ✅ **denied** |
| RI3 | Org A PM | `select … where organization_id = orgA` | ✅ 3 rows (staff sees all org rows) |
| RI4 | INVESTOR 1 | `select … where organization_id = orgA` | ✅ 1 row (own generation only) |
| RI5 | INVESTOR 1 | `select` for INVESTOR 2's row | ✅ 0 rows (J3 enforcement) |
| RI6 | INVESTOR 1 | `select` for staff-generated row | ✅ 0 rows (J3 strict) |
| RI7 | Staff | `insert` with empty scope_filter (org-wide) | ✅ succeeds |
| RI8 | Staff | `insert` with scope_filter | ✅ succeeds |
| RI9 | INVESTOR 1 | `insert` for owned property | ✅ succeeds |
| RI10 | INVESTOR 1 | `insert` with spoofed `generated_by` | ✅ **denied** (WITH CHECK enforces `generated_by = auth.uid()`) |
| RI11 | privileged | `insert` with invalid `report_type` | ✅ **denied** (CHECK constraint) |
| RI12 | Staff | `update` + `delete` | ✅ both denied (no UPDATE/DELETE policies) |

## 5. How to run

```bash
# psql is not installed locally — use the project runner (pg client):
npx tsx scripts/run-sql.ts supabase/tests/rls_cross_org.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_within_org.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase2.sql
npx tsx scripts/run-sql.ts supabase/tests/user_columns_pin.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase2_blockers_closed.sql
npx tsx scripts/run-sql.ts supabase/tests/users_select_staff_gate.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_leases_tenant_self.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_tenant_invites_lifecycle.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_accept_tenant_invite.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_units_properties_tenant_self.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_maintenance_tenant_self.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_messages_immutable.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase4_leasing.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase5_entities.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase5_owner_portal.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_ai_restrictive.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_rate_limit.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase6_report_insights.sql
# equivalent, if psql is available:
#   psql "$DATABASE_URL" -f supabase/tests/rls_cross_org.sql
```

Every check is a plpgsql `ASSERT`. A failed assert aborts the transaction with
SQLSTATE `P0004` and a `FAIL #n` message (a clean test failure); any other
SQLSTATE means the test could not complete (an infrastructure error).

## 6. Result log

| Date | Runner | Cases passed | Notes |
|---|---|---|---|
| 2026-05-18 | `scripts/run-sql.ts` (pg) | 13 / 13, 0 errored | `rls_cross_org.sql` — #1,#2,#2b,#4,#5,#6,#7,#7b,#10,#11,#12,#13,#14 |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 5 / 5, 0 errored | `rls_within_org.sql` — R1,R2,R3,R4,R5 |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 23 / 23, 0 errored | `rls_phase2.sql` — P1-P5, V1-V11, RW1-RW6, AN1 |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 10 / 10, 0 errored | `user_columns_pin.sql` — P1-P10 (§8.4 fix) |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 13 / 13, 5 / 5, 23 / 23, 0 errored | full re-run after §8.4 migration — no regressions in prior suites |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 25 / 25, 0 errored | `rls_phase2_blockers_closed.sql` — R1-R8, C1-C8, S1-S9 (§8.1/§8.2/§8.3 fixes) |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 13 / 13, 5 / 5, 23 / 23, 10 / 10, 0 errored | full re-run after §8.1/§8.2/§8.3 migrations — no regressions in prior suites |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 8 / 8, 0 errored | `users_select_staff_gate.sql` — U1-U8 (§7 fix) |
| 2026-05-19 | `scripts/run-sql.ts` (pg) | 13 / 13, 5 / 5, 23 / 23, 10 / 10, 25 / 25, 0 errored | full re-run after §7 migration — no regressions in prior suites |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 15 / 15, 0 errored | `rls_phase3_accept_tenant_invite.sql` — Suite 8 — A1-A8 (acceptance RPC) |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 14 / 14, 0 errored | `rls_phase3_messages_immutable.sql` — Suite 12 — M1-M14 (immutability + sender_role gating) |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 7 / 7, 0 errored | `rls_phase3_leases_tenant_self.sql` — Suite 7 — L1-L7 (leases tenant-self + manager-only write) |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 10 / 10, 0 errored | `rls_phase3_maintenance_tenant_self.sql` — Suite 11 — Q1-Q10 (maintenance tenant-self SELECT + INSERT defense-in-depth) |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 9 / 9, 0 errored | `rls_phase3_tenant_invites_lifecycle.sql` — Suite 9 — I1-I9 (tenant_invites can_write_tenants gating + mutual-exclusion CHECK + revoke lifecycle) |
| 2026-05-23 | `scripts/run-sql.ts` (pg) | 11 / 11, 0 errored | `rls_phase3_units_properties_tenant_self.sql` — Suite 10 — U1-U6 + P1-P5 (units/properties tenant-self direct + lease-mediated, ended-lease regression) |
| 2026-05-24 | `scripts/run-sql.ts` (pg) | 31 / 31, 0 errored | `rls_phase4_leasing.sql` — Suite 13 — K1-K8 (leads cohort + §8.1 FK pins), T1-T9 (tours cohort + 3 FK pins), A1-A10 (applications cohort + 3 FK pins + A10 RLS-does-not-enforce-status-transitions), X1-X4 (create_lease_with_tenants widened authority + source_application_id additive column) — closes Phase 4 RLS coverage gap |
| 2026-05-24 | `scripts/run-sql.ts` (pg) | 25 / 25, 0 errored | `rls_phase5_entities.sql` — Suite 14 — C1-C8 (rent_charges cohort + §8.1 FK pins), Y1-Y8 (payments cohort + §8.1 FK pins), J1-J9 (property_owners junction — staff/self read + manager-only write + INVESTOR self-grant rejection + §8.1 FK pins) |
| 2026-05-24 | `scripts/run-sql.ts` (pg) | 32 / 32, 0 errored | `rls_phase5_owner_portal.sql` — Suite 15 — O1-O6 (owner-self positive admit, exercises 6 SECURITY DEFINER helpers), O7-O12 (cross-owner deny), O13-O17 (tenant-self preservation post drop-and-recreate), O18-O23 (staff branch preservation), D1-D2 (dual-mode + no-leakage), R1-R7 (recursion-safety class — codifies the slice 10e incident lesson) |
| 2026-05-24 | `scripts/run-sql.ts` (pg) | **15 / 15 suites pass — 238 / 238 cumulative** | full regression run across all 15 suites post-Phase 5; zero pre-existing-suite regressions from slice 10e drop-and-recreate operations |
| 2026-05-25 | `scripts/run-sql.ts` (pg) | 12 / 12, 0 errored | `rls_phase6_ai_restrictive.sql` — Suite 16 — AI1-AI3 (is_ai_actor() helper), AI4-AI7 (rent_charges RESTRICTIVE block matrix), AI8-AI10 (payments RESTRICTIVE block matrix), AI11-AI12 (PERMISSIVE policy regression) |
| 2026-05-25 | `scripts/run-sql.ts` (pg) | 8 / 8, 0 errored | `rls_phase6_rate_limit.sql` — Suite 17 — RL1-RL7 (window count semantics — org-scoped, window-scoped, all statuses counted), RL8 (no SUPER_ADMIN bypass) |
| 2026-05-25 | `scripts/run-sql.ts` (pg) | **17 / 17 suites pass — 258 / 258 cumulative** | full regression run across all 17 suites post-Phase 6.1; zero pre-existing-suite regressions from Phase 6.1 migration (ai_logs cost columns + RESTRICTIVE policies). Suite 14 specifically re-verified because RESTRICTIVE ANDs with rent_charges + payments PERMISSIVE policies; all existing assertions pass because `is_ai_actor()` returns false in non-flagged contexts. |
| 2026-05-25 | `scripts/run-sql.ts` (pg) | 12 / 12, 0 errored | `rls_phase6_report_insights.sql` — Suite 18 — RI1-RI3 (cross-org SELECT/INSERT + staff-org-self), RI4-RI6 (INVESTOR generator-restricted J3 — own only, no cross-investor, no staff-generated), RI7-RI10 (INSERT shape — empty scope, scoped, INVESTOR own-property, generated_by spoof rejection), RI11 (report_type CHECK), RI12 (UPDATE+DELETE both blocked — no policies) |
| 2026-05-25 | `scripts/run-sql.ts` (pg) | **18 / 18 suites pass — 270 / 270 cumulative** | full regression run post-Phase 6.2 slice 11c; zero pre-existing-suite regressions from the new report_insights table |
