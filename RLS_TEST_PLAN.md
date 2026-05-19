# RLS_TEST_PLAN.md — Row Level Security test plan

> **Status: EXECUTED — cross-org 13/13 (2026-05-18) and within-org role
> isolation R1–R5 5/5 (2026-05-19); all passed, 0 errored.**
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

## 5. How to run

```bash
# psql is not installed locally — use the project runner (pg client):
npx tsx scripts/run-sql.ts supabase/tests/rls_cross_org.sql
npx tsx scripts/run-sql.ts supabase/tests/rls_within_org.sql
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
