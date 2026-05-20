# RLS_TEST_PLAN.md — Row Level Security test plan

> **Status: EXECUTED — cross-org 13/13 (2026-05-18), within-org role
> isolation R1–R5 5/5 (2026-05-19), Phase 2 (vendors / maintenance /
> work orders) 23/23 (2026-05-19), user-columns pin (SECURITY_REVIEW.md
> §8.4 fix) 10/10 (2026-05-19), Phase 2 §8.1/§8.2/§8.3 closure 25/25
> (2026-05-19), and users_select staff gate (SECURITY_REVIEW.md §7 fix)
> 8/8 (2026-05-19); all passed, 0 errored. Total 84 assertions across 6 suites.**
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

## 5. How to run

```bash
# psql is not installed locally — use the project runner (pg client):
npx tsx scripts/run-sql.ts supabase/tests/rls_cross_org.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_within_org.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase2.sql
npx tsx scripts/run-sql.ts supabase/tests/user_columns_pin.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_phase2_blockers_closed.sql
npx tsx scripts/run-sql.ts supabase/tests/users_select_staff_gate.sql
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
