# SECURITY_REVIEW.md — Row Level Security review record

> **Status: AWAITING HUMAN REVIEW.**
> This document is the audit record required by SPEC.md Gate 1. The RLS
> policies below have been **generated and enabled** in the migration files,
> but they are **not certified production-safe** until a human has reviewed and
> signed off at the bottom of this file. A completed checklist here does not by
> itself authorize production use — see SPEC.md section 6.
>
> As of 2026-05-18 the migrations are applied to the **dev** database and the
> automated cross-org tests pass (13/13 — see RLS_TEST_PLAN.md). Human review
> of the policy design is still outstanding.

## 1. Scope

Phase 1 tables covered: `organizations`, `users`, `user_roles`, `settings`,
`properties`, `buildings`, `units`, `tenants`, `audit_logs`, `notifications`,
`ai_logs`, `automation_logs`, plus the internal `schema_migrations`.

Policy source of truth: `supabase/migrations/20260518000700_rls.sql`.

## 2. Tenancy model

- Every tenant-scoped table carries `organization_id`.
- A user belongs to exactly one organization (`users.organization_id`).
- Roles are held in `user_roles (user_id, organization_id, role)`.
- Cross-organization access is denied for all roles except a platform
  `is_super_admin` user (a column on `users`, lockable only by a direct
  operator DB action — see the `protect_user_columns` trigger).

## 3. Helper functions (all `SECURITY DEFINER`, `STABLE`)

| Function | Returns | Purpose |
|---|---|---|
| `current_user_org_id()` | uuid | The caller's organization. |
| `is_super_admin()` | boolean | Platform-level cross-org access. |
| `has_role(role[])` | boolean | Caller holds any of the given roles in their org. |
| `is_org_staff()` | boolean | Caller is internal staff. |
| `is_org_manager()` | boolean | Caller may write portfolio data. |
| `can_write_tenants()` | boolean | Management + leasing roles. |

`SECURITY DEFINER` is required so these read `users` / `user_roles` as the
table owner, bypassing RLS, and therefore do not recurse into the policies that
call them.

## 4. Policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| organizations | own org / super admin | rpc only (`create_organization`) | OWNER of org / super admin | none |
| users | self / same org / super admin | trigger only (`handle_new_user`) | self, or manager in org | none |
| user_roles | self / same org / super admin | manager in org | manager in org | manager in org |
| settings | staff in org | manager in org | manager in org | manager in org |
| properties | staff in org | manager in org | manager in org | manager in org |
| buildings | staff in org | manager in org | manager in org | manager in org |
| units | staff in org | manager in org | manager in org | manager in org |
| tenants | staff in org, or linked portal user | mgmt + leasing | mgmt + leasing | mgmt + leasing |
| audit_logs | manager in org | service role only | none | none |
| ai_logs | manager in org | service role only | none | none |
| automation_logs | manager in org | service role only | none | none |
| notifications | own (`user_id`) | service role only | own | own |
| schema_migrations | none (RLS on, no policy) | n/a | n/a | n/a |

All cross-org access additionally requires `is_super_admin()`.

## 5. Privilege-escalation protections

- `protect_user_columns` (BEFORE UPDATE on `users`): `is_super_admin` is reset
  to its old value on every update — the application can never grant it.
  `organization_id` may transition `null → value` once (onboarding) and may
  never be reassigned thereafter.
- `organizations` has **no INSERT policy**; orgs are created only by the
  `SECURITY DEFINER` rpc `create_organization`, which also assigns the caller
  as `OWNER`.
- `audit_logs` / `ai_logs` / `automation_logs` have **no INSERT policy** for
  `authenticated`; only server code using the service-role key may append.

## 6. Known limitations (intended for later phases)

- Tenant-portal read scoping (a `TENANT` user seeing only their own unit /
  lease / documents) is only partially present in Phase 1 (`tenants` allows a
  linked portal user to read their own row). Full tenant/vendor/owner portal
  RLS arrives in Phases 3–5 and must be reviewed again then.
- `users` UPDATE is row-level, not column-level: a manager editing a teammate
  could change profile fields. `is_super_admin` is still protected by trigger.
- No automated cross-org test has been **executed** yet — the dev database was
  unreachable during the build (IPv6-only direct connection). Test cases are
  written in `RLS_TEST_PLAN.md` and `supabase/tests/rls_cross_org.sql` and must
  be run before sign-off.

## 7. Reviewer checklist

- [x] Migrations applied to the dev database without error. _(2026-05-18)_
- [x] `RLS_TEST_PLAN.md` executed; every cross-org case denies access.
      _(13/13 automated assertions passed)_
- [x] Every table reports `rowsecurity = true`. _(verified via
      scripts/schema-dump.ts — all 13 public tables)_
- [x] `protect_user_columns` confirmed to block `is_super_admin` escalation.
      _(automated test #11 / #12)_
- [ ] No table is missing `organization_id` where applicable. _(human check —
      note: `audit_logs.organization_id` is intentionally nullable)_
- [ ] Helper functions confirmed `SECURITY DEFINER` — human read of migration.
- [ ] Service-role usage in app code reviewed (`src/lib/supabase/admin.ts`,
      `src/lib/data/audit.ts`) — confirmed only for trusted server paths.
- [ ] Role-isolation cases R1–R5 (RLS_TEST_PLAN.md §4) automated and run.

## 8. Sign-off

| Reviewer | Date | Outcome |
|---|---|---|
| _pending_ | _pending_ | _pending_ |
