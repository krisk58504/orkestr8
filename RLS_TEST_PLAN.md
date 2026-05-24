# RLS_TEST_PLAN.md — Row Level Security test plan

> **Status: EXECUTED — cross-org 13/13 (2026-05-18), within-org role
> isolation R1–R5 5/5 (2026-05-19), Phase 2 (vendors / maintenance /
> work orders) 23/23 (2026-05-19), user-columns pin (SECURITY_REVIEW.md
> §8.4 fix) 10/10 (2026-05-19), Phase 2 §8.1/§8.2/§8.3 closure 25/25
> (2026-05-19), and users_select staff gate (SECURITY_REVIEW.md §7 fix)
> 8/8 (2026-05-19). Phase 3 partial: accept_tenant_invite RPC (Suite 8)
> 15/15 (2026-05-23), messages immutability (Suite 12) 14/14 (2026-05-23),
> leases tenant-self (Suite 7) 7/7 (2026-05-23), maintenance tenant-self
> (Suite 11) 10/10 (2026-05-23). All 130 executed assertions pass;
> 0 errored.**
>
> **Phase 3 coverage gap:** two additional suites (9, 10) covering
> tenant_invites lifecycle and units/properties tenant-self +
> lease-mediated branches are listed below but **not yet authored**.
> Each mirrors patterns covered by existing suites — see
> SECURITY_REVIEW.md §11.6 for per-suite justification and the order in
> which they should be authored before Phase 4 ships any new portal RLS
> surface.
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

## 4h. Phase 3 Suite 9 — tenant_invites lifecycle  *(DEFERRED — not yet authored)*

Would verify the `tenant_invites_select` / `tenant_invites_write` policies
from migration `20260522000100` (`can_write_tenants()` gate on both
branches), the mutual-exclusion check constraint
(`accepted_at IS NULL OR revoked_at IS NULL`), and the FK cascade on
`organizations`/`tenants` delete. Pattern mirrors Suite 3 RW1–RW6 (staff
INSERT gated on role) and the existing tenants_write tests. Deferred —
the policy bodies are structurally identical to `tenants_write` (Suite 2
R2/R3) with the table name swapped.

## 4i. Phase 3 Suite 10 — tenant-self units / properties + lease-mediated  *(DEFERRED — not yet authored)*

Would verify the `units_select` / `properties_select` tenant-self
branches from migrations `20260524000100` (direct via `tenants.unit_id`)
and `20260525000100` (lease-mediated via `tenants.lease_id →
leases.unit_id`). Four scenarios per table: tenant with direct unit_id
populated; tenant with lease_id populated but unit_id null; tenant with
both populated (both branches admit); tenant with neither (zero rows).
Pattern matches Suite 1 #1/#2 cross-org test against a different
predicate. Deferred — direct branches are structurally identical to
`tenants_select` and the lease-mediated branch is structurally identical
to `leases_select` (both already covered for their own table).

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
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_accept_tenant_invite.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_maintenance_tenant_self.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase3_messages_immutable.sql
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
