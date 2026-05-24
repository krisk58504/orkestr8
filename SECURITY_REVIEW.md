# SECURITY_REVIEW.md — Row Level Security review record

> **Status: AWAITING HUMAN REVIEW.**
> This document is the audit record required by SPEC.md Gate 1. The RLS
> policies below have been **generated and enabled** in the migration files,
> but they are **not certified production-safe** until a human has reviewed and
> signed off at the bottom of this file. A completed checklist here does not by
> itself authorize production use — see SPEC.md section 6.
>
> As of 2026-05-19 the migrations are applied to the **dev** database; the
> automated cross-org tests pass (13/13) and the within-org role-isolation
> tests pass (R1–R5, 5/5) — see RLS_TEST_PLAN.md. Cross-org isolation has been
> accepted by the reviewer. Human sign-off on the full policy design is still
> outstanding.

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

## 6. Security-critical objects — invariants for future migrations

The objects below are **load-bearing for tenant isolation and privilege
containment**. They must not be dropped, disabled, or weakened by any future
migration. Any change to one of them requires a fresh Gate 1 review.

- **`protect_user_columns`** — BEFORE UPDATE trigger on `public.users`. This is
  a **permanent security-critical object.** RLS on `users` deliberately lets a
  user update their own row (`users_update_self`); column-level protection
  lives ONLY in this trigger. It (a) resets `is_super_admin` to its prior value
  on every update, so the application can never grant platform admin, and
  (b) blocks any reassignment of `organization_id` once set, so a user can
  never move themselves into another tenant. If this trigger is dropped or
  altered, `users_update_self` **fails open** to privilege escalation and
  cross-tenant movement. **Future migrations MUST NOT drop, disable, or weaken
  it.** Verified by automated tests #11 and #12.
- **RLS enabled on every `public` table** — `rowsecurity = true` on all 13
  tables. A migration running `DISABLE ROW LEVEL SECURITY` on any tenant-scoped
  table is a Gate 1 regression.
- **Helper functions are `SECURITY DEFINER` with `SET search_path = public`** —
  the pinned `search_path` prevents hijacking. Removing either property is a
  regression.
- **No client INSERT policy on `audit_logs` / `ai_logs` / `automation_logs`** —
  append-only integrity depends on this absence. Adding an INSERT policy for
  `authenticated` would let users forge audit / AI history.

## 7. Blocking prerequisites for later phases

These must be resolved BEFORE the named phase ships — they are not optional
cleanup.

- **[RESOLVED 2026-05-19 — was BLOCKING for Phase 3 portal work]** The
  `users_select` policy previously exposed every user row in an
  organization to any authenticated member of that organization, via the
  `organization_id = current_user_org_id()` branch, with **no role gate**.
  That was tolerable only while exclusively staff held an
  `organization_id`. The Phase 2 vendor portal ships now; later phases
  widen the population of non-staff authenticated org members
  (TENANT-role users, future tenant/owner portals).

  **Fix applied:** migration
  `20260519001400_users_select_staff_gate.sql` adds `AND is_org_staff()`
  to the org-id branch. The final `users_select` USING clause is:

  ```
  ((id = auth.uid())
   OR (organization_id = current_user_org_id() AND is_org_staff())
   OR is_super_admin())
  ```

  Self-read (`id = auth.uid()`) is preserved — every user must always be
  able to read their own row (handle_new_user / SessionContext depend on
  it). Super-admin reach is unchanged.

  **Verified by** `supabase/tests/users_select_staff_gate.sql` cases U1–U4
  (hole closed: TENANT and VENDOR_ADMIN non-staff users with `org_id`
  set see only their own row, not staff teammates) and U5–U8 (regression:
  OWNER + PROPERTY_MANAGER still read every Org A user; cross-org
  isolation still holds; self-read still works for non-staff; anon
  denied). Full re-run of the cross-org, within-org, Phase 2, user-
  columns-pin, and Phase 2 §8 closure suites passed with no regressions.

## 8. Phase 2 RLS gaps — review findings (all four RESOLVED 2026-05-19)

The Phase 2 design review (2026-05-19) identified the four gaps below. None
was exploitable as a confidentiality leak through the current vendor-portal
server actions, but each lived in RLS — the authoritative enforcement layer
per SPEC Gate 1 — and so each had to be closed before production. All four
were classified as production blockers; all four have been resolved by
migrations applied to dev on the same day.

| § | Topic | Migration | Verified by |
|---|---|---|---|
| 8.1 | `organization_id` not pinned on vendor writes | `20260519001100_pin_org_id_on_vendor_writes.sql` | `rls_phase2_blockers_closed.sql` C1–C8 |
| 8.2 | vendor could RLS-write invoice `status` to approved/paid | `20260519001200_vendor_invoice_status_restriction.sql` | `rls_phase2_blockers_closed.sql` S1–S9 |
| 8.3 | SELECT branches lacked `is_vendor_user()` | `20260519001300_vendor_select_role_gate.sql` | `rls_phase2_blockers_closed.sql` R1–R8 |
| 8.4 | `users.vendor_id` / `organization_id` NULL→value self-set | `20260519001000_protect_user_columns_pin.sql` | `user_columns_pin.sql` P1–P10 |

### 8.1 `organization_id` not pinned on the vendor branches of `work_orders`, `work_order_photos`, `vendor_invoices`

The vendor-scoping `WITH CHECK` clauses on these three tables pin the vendor
reference (`assigned_vendor_id` / `vendor_id`, or via
`work_order_assigned_to_current_vendor` for photos) to the caller's own
vendor, but they do **not** also require `organization_id` to match the
row's current org. Compare:

- staff branch: `(organization_id = current_user_org_id() AND is_org_staff())`
- vendor branch: `(assigned_vendor_id = current_user_vendor_id() AND is_vendor_user())` — no org pin

Consequence (write-integrity, not read leak): a vendor user can craft an
`UPDATE` / `INSERT` that carries an arbitrary `organization_id`, as long as
the vendor reference is theirs. They could move a work order or photo into
another organization, or stamp a freshly-inserted photo with an arbitrary
org id. The Phase 2 migration comment on `work_orders` claims a vendor
"cannot move it to another organization" — the policy as written does not
enforce that. Current server actions write only specific columns, so the
app does not expose the path; RLS does. Test V8 (rls_phase2.sql) covered
`assigned_vendor_id` reassignment only — `organization_id` mutation by a
vendor is untested.

**Fix applied (2026-05-19):** migration
`20260519001100_pin_org_id_on_vendor_writes.sql` extends each vendor
`WITH CHECK` branch with an `organization_id` constraint. Pure-RLS
approach (no trigger) keeps the constraint co-located with the rest of
the policy, visible in `pg_policies` for audit.

- UPDATE branches (`work_orders`, `vendor_invoices`):
  `organization_id = (select org from <self> where id = new.id)` —
  WITH CHECK is evaluated before storage, so the subquery returns
  `old.organization_id`. A vendor cannot move a row to another org.
- INSERT branches (`work_order_photos`, `vendor_invoices`):
  `organization_id = (select org from <parent> where id = new.<parent_id>)`
  — pins to the parent's org (the WO's org for photos, the vendor's
  managing org for invoices). The work-orders INSERT branch has no
  vendor path and was not changed.

Verified by `supabase/tests/rls_phase2_blockers_closed.sql` cases
C1–C8 (hole closed + legitimate paths preserved).

### 8.2 Vendor can RLS-write `vendor_invoices.status` to `approved` / `paid`

`vendor_invoices_insert` and `vendor_invoices_update` allow the vendor
branch `(vendor_id = current_user_vendor_id() AND is_vendor_user())` with
no column-level restriction. Nothing in RLS constrains which
`vendor_invoice_status` value a vendor may write. At the RLS layer a vendor
can therefore mark their own invoice `approved` or `paid`. The "vendor
cannot approve / pay its own invoice" property is enforced **only** by the
vendor-portal server action (`createVendorInvoice` /
`updateVendorInvoice` clamp status to `draft`/`submitted`).

Per SPEC Gate 1, RLS is the authoritative enforcement layer; an integrity
property that exists only in the app layer is not defense-in-depth. The
Phase 2 migration is honest about this in a comment ("Status-transition
rules … are enforced in server actions, not RLS") — recorded here as a
production-blocking gap.

**Fix applied (2026-05-19):** migration
`20260519001200_vendor_invoice_status_restriction.sql` adds two
RESTRICTIVE policies (one for INSERT, one for UPDATE) on
`vendor_invoices`:

```
as restrictive ...
with check (not is_vendor_user() or status in ('draft','submitted'))
```

`RESTRICTIVE` was chosen over a BEFORE INSERT/UPDATE trigger because:
(a) Gate 1 declares RLS the authoritative enforcement layer — keeping
the constraint with the rest of the policy keeps the full posture
visible in `pg_policies`; (b) a silent trigger clamp masks intent and
a raising trigger is a hidden enforcement object that future reviewers
must remember to inspect; (c) `RESTRICTIVE … AND permissive` is the
standard Postgres pattern for "this branch can do X but only if Y."
Staff (`is_org_manager`) and `is_super_admin` are unaffected by the
restrictive — they retain full status control.

Verified by `supabase/tests/rls_phase2_blockers_closed.sql` cases
S1–S9: vendor INSERT/UPDATE blocked for `approved` / `paid` /
`rejected`; allowed for `draft` / `submitted`; staff manager retains
full control.

### 8.3 `SELECT`-branch `is_vendor_user()` asymmetry on vendor-scoped tables

The vendor `SELECT` branches on `vendors`, `work_orders`, `vendor_invoices`,
and the `work_order_assigned_to_current_vendor()` function used by
`work_order_photos` key only on row equality with `current_user_vendor_id()`:

- `vendors_select`:           `(id = current_user_vendor_id())`
- `work_orders_select`:       `(assigned_vendor_id = current_user_vendor_id())`
- `vendor_invoices_select`:   `(vendor_id = current_user_vendor_id())`
- `work_order_photos_select`: `work_order_assigned_to_current_vendor(work_order_id)`

None of these additionally requires `is_vendor_user()`. The corresponding
`UPDATE` / `INSERT` branches **do** require it. Consequence: any user whose
`users.vendor_id` is non-null gains vendor-scoped READ access regardless of
role. Today only portal users have a non-null `vendor_id`, so this is
latent — but it composes with any path that lets a non-vendor account end
up with a non-null `users.vendor_id`, turning a stray column write into a
read escalation against that vendor's data.

**Fix applied (2026-05-19):** migration
`20260519001300_vendor_select_role_gate.sql` adds `is_vendor_user()` to
all four vendor SELECT paths so reads are gated symmetrically with
writes. The three non-photo SELECT policies (`vendors_select`,
`work_orders_select`, `vendor_invoices_select`) gain `AND
is_vendor_user()` on their vendor branches. For `work_order_photos`,
`is_vendor_user()` is added inside the helper function
`work_order_assigned_to_current_vendor()` so all three photo policies
(select / insert / delete) inherit the role gate — defence in depth.

This closes the composition with §8.4: even if a stray non-null
`users.vendor_id` ever landed on a non-vendor account, it would no
longer grant read access to that vendor's data.

Verified by `supabase/tests/rls_phase2_blockers_closed.sql` cases
R1–R8: a stray-vendor-id user with no `VENDOR_*` role sees 0 rows on
vendors / work_orders / vendor_invoices / work_order_photos;
legitimate vendor users still see their own data.

### 8.4 `users.vendor_id` / `users.organization_id` admit a one-shot `NULL → value` self-set — the most reachable of the §8 items

**This is the most reachable of the §8 production blockers.** It is
exploitable by any authenticated user against the dev database via a single
direct `UPDATE` statement, and it composes with §8.3 into a confidentiality
escalation against an arbitrary vendor's data.

Mechanism:

- `users_update_self` permits a user to UPDATE their own row with
  `WITH CHECK (id = auth.uid())` — no column-value constraint.
- Column-level `UPDATE` on `vendor_id` and `organization_id` is granted to
  `authenticated`.
- `protect_user_columns` raises only when `old.<col> IS NOT NULL` and the new
  value differs. The `NULL → value` transition is permitted — asymmetric to
  how `id` and `is_super_admin` are handled (both use unconditional silent
  overwrite, `new.x := old.x`).

A freshly-created `public.users` row has both `organization_id` and
`vendor_id` set to `NULL` (the `handle_new_user` trigger does not assign
them). A user can therefore issue one of the following at any time before
the columns are filled by trusted code:

```sql
update public.users set vendor_id      = '<any vendor uuid>' where id = auth.uid();
update public.users set organization_id = '<any org uuid>'    where id = auth.uid();
```

Both succeed. Subsequent attempts raise.

Consequence — read escalation, not full takeover:
- `current_user_vendor_id()` now returns the attacker-chosen vendor uuid.
- Because §8.3 leaves the vendor `SELECT` branches ungated by
  `is_vendor_user()`, the attacker gains scoped READ access to that
  vendor's `vendors` row, work orders, photos, and invoices, without ever
  having held a `VENDOR_ADMIN` or `VENDOR_TECH` role. Write branches stay
  closed (they additionally require `is_vendor_user()`).
- Self-assigning `organization_id` similarly hands the attacker
  `current_user_org_id()` for an arbitrary org — relevant to the §7
  Phase-3 blocker on `users_select`.

**Fix applied (2026-05-19):** migration
`20260519001000_protect_user_columns_pin.sql` extends `protect_user_columns`
to pin `vendor_id` and `organization_id` unconditionally
(`new.x := old.x`) for any caller running as `authenticated` / `anon`.
Trusted roles (`postgres`, `service_role`, `supabase_admin`) retain the
ability to set them — `create_organization` (SECURITY DEFINER, owned by
`postgres`) still functions, and admin-client writes still work. The
pre-existing reassignment guard (raise on non-NULL → other) is retained for
trusted callers as defense in depth. Verified by
`supabase/tests/user_columns_pin.sql`.

## 9. Known limitations (intended for later phases)

- Tenant-portal read scoping (a `TENANT` user seeing only their own unit /
  lease / documents) is only partially present in Phase 1 (`tenants` allows a
  linked portal user to read their own row). Full tenant/vendor/owner portal
  RLS arrives in Phases 3–5 and must be reviewed again then.
- `users` UPDATE is row-level, not column-level: a manager editing a teammate
  could change profile fields. `is_super_admin` is still protected by trigger.
- Automated tests cover cross-organization isolation (13/13) and within-org
  role isolation R1–R5 (5/5). Not yet automated: write-differentiation cases
  beyond R1–R5 (e.g. `MAINTENANCE_TECH` reads tenants but cannot write them),
  and the RLS that will arrive with later-phase tables.

## 10. Reviewer checklist

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
- [x] Role-isolation cases R1–R5 (RLS_TEST_PLAN.md §4) automated and run.
      _(5/5 automated assertions passed — 2026-05-19)_
- [x] Cross-org isolation accepted by the reviewer. _(2026-05-19)_

## 11. Sign-off — Phase 3 close & Gate 1 certification

### 11.0 Scope and snapshot

- Branch: `phase-2-maintenance` at HEAD `79f86cb` (2026-05-23).
- Migrations covered: **31 files**, `20260518000100` through `20260527000100`.
- Application code covered: `src/` at the named commit.
- Source-of-record analytic packet: `SECTION_11_AUDIT_PACKET.md`, compiled
  2026-05-21 at commit `c89885f`. The packet inventories every Phase 1 and
  Phase 2 RLS policy, helper, trigger, service-role bypass, and audit/email/
  AI-log writer; this §11 confirms the packet's findings remain accurate at
  the snapshot above, then inventories the eight **Phase 3** additions the
  packet predates.
- Cumulative RLS test coverage: **150 assertions across 12 suites** (84 prior
  + 15 Suite 8 + 14 Suite 12 + 7 Suite 7 + 10 Suite 11 + 9 Suite 9 + 11 Suite 10),
  all passing as of 2026-05-23. **All six Phase 3 suites (7-12) are now authored.**

### 11.1 Phase 3 RLS additions

One sub-section per migration. USING and WITH CHECK clauses reproduced
verbatim from the migration SQL, matching the depth of Part A.3/A.4 in the
audit packet. Migration short-codes used:

- **M3L** = `20260521000100_phase3_leases.sql`
- **M3LR** = `20260521000200_phase3_create_lease_rpc.sql`
- **M3I** = `20260522000100_phase3_tenant_invites.sql`
- **M3T** = `20260524000100_phase3_tenant_self_rls.sql` (units + properties tenant-self, direct branches)
- **M3A** = `20260524000200_phase3_accept_tenant_invite_rpc.sql`
- **M3LU** = `20260525000100_phase3_tenant_lease_unit_rls.sql` (units + properties lease-mediated branches)
- **M3M** = `20260526000100_phase3_tenant_self_maintenance_rls.sql`
- **M3X** = `20260527000100_phase3_messaging.sql`

#### 11.1.1 leases  *(RLS enabled — M3L)*

New enum `public.lease_status` (`upcoming`, `active`, `ended`). New table
`public.leases (id, organization_id, unit_id, start_date, end_date,
monthly_rent, status, notes, created_at, updated_at)` with FK cascade on
`organizations` and ON DELETE RESTRICT on `units`, plus
`CHECK (end_date IS NULL OR end_date >= start_date)`. `set_updated_at`
trigger attached.

- **leases_select** — SELECT, `authenticated` — M3L
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t where t.lease_id = leases.id and t.user_id = auth.uid()) or public.is_super_admin())`
  - Tenant-self branch reaches `leases` only through the
    `tenants.lease_id` FK linkage established by M3L. Slice 5a/5b's UI
    surface (`/leases`) reads this policy as `is_org_staff`; the tenant
    portal reads it via the tenant-self branch.
- **leases_write** — ALL, `authenticated` — M3L
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_manager()) or public.is_super_admin())`
  - Manager-only write. Application path:
    `src/app/(app)/leases/actions.ts` (`createLease` via the M3LR RPC;
    `updateLease`, `endLease` via direct UPDATE).

#### 11.1.2 tenants.lease_id  *(additive column — M3L)*

`alter table public.tenants add column if not exists lease_id uuid
references public.leases(id) on delete set null;` + index
`tenants_lease_id_idx`. The existing `tenants_select` / `tenants_write`
policies are unchanged — the new column inherits the tenant table's RLS
posture.

#### 11.1.3 create_lease_with_tenants RPC  *(M3LR)*

SECURITY DEFINER function granted to `authenticated` only (REVOKE from
`public`, `anon`). Signature
`(p_organization_id uuid, p_unit_id uuid, p_start_date date, p_end_date date,
p_monthly_rent numeric(10,2), p_status public.lease_status default 'upcoming',
p_notes text default null, p_tenant_ids uuid[] default '{}'::uuid[])
returns uuid`. Caller authority is **verified inside the function body**
(the SECURITY DEFINER context bypasses RLS, so the policy alone cannot gate):

```sql
if v_uid is null then raise exception '...' using errcode = '28000'; end if;
if not (
  (public.is_org_manager() and public.current_user_org_id() = p_organization_id)
  or public.is_super_admin()
) then raise exception '...' using errcode = '42501'; end if;
```

The tenants UPDATE in the body pins `organization_id = p_organization_id`,
so a stray cross-org `p_tenant_ids` value cannot be reassigned even if the
caller is a super-admin reaching across orgs.

#### 11.1.4 tenant_invites  *(RLS enabled — M3I)*

New table `public.tenant_invites (id, organization_id, tenant_id, email,
token_hash, expires_at, accepted_at, accepted_by, revoked_at, revoked_by,
created_at, created_by)`. FK cascade on `organizations`/`tenants`,
`on delete set null` on the auth-user FKs. `CHECK (accepted_at IS NULL
OR revoked_at IS NULL)` enforces mutual exclusion of acceptance and
revocation. Four indexes (org / tenant / email / expires_at). **Token
storage: SHA-256 hash only.** The raw token is never persisted.

- **tenant_invites_select** — SELECT, `authenticated` — M3I
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
  - `can_write_tenants()` gate — only management + leasing roles can read
    invites in their org, matching the staff cohort authorised to issue
    them.
- **tenant_invites_write** — ALL, `authenticated` — M3I
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
  - The anonymous acceptance flow does NOT use this policy — acceptance
    runs via M3A (SECURITY DEFINER), which bypasses RLS for the four
    atomic writes.

#### 11.1.5 units / properties tenant-self direct branches  *(M3T)*

M3T drops and recreates `units_select` and `properties_select` to add a
tenant-self branch keyed on `tenants.unit_id`. Both policies retain their
M0700 staff and super-admin branches.

- **units_select** — SELECT, `authenticated` — **current definition M3LU** (introduced M0700; superseded by M3T; superseded by M3LU)
- **properties_select** — SELECT, `authenticated` — **current definition M3LU** (introduced M0700; superseded by M3T; superseded by M3LU)

(M3T's bodies were intermediate — M3LU re-adds a fourth lease-mediated
branch on each. The current bodies in force are M3LU's, reproduced in
11.1.7 below.)

#### 11.1.6 accept_tenant_invite RPC  *(M3A)*

SECURITY DEFINER function granted to **both `authenticated` and
`service_role`** (REVOKE from `public`, `anon`). Signature
`(p_token_hash text, p_user_id uuid) returns table(ok boolean,
error_code text, tenant_id uuid, organization_id uuid)`.

**Trust-model flag for reviewer attention.** Unlike M3LR, the
`accept_tenant_invite` body does **NOT** include an `auth.uid()` or
`is_org_*` authority check. This is by design: the invite acceptance flow
is **anonymous at call time** — the user is in the middle of registering;
there is no signed-in session whose role we could check. The authority
is the token hash itself, which proves possession of the email link.

The body's safety properties:

- **Lookup is by `token_hash` only.** If the supplied hash does not match
  any row, the function returns `ok=false, error_code='not_found'` and
  does not mutate. Verified by Suite 8 A1, A8.
- **The four classified failure codes return before any UPDATE.** Each
  of `already_accepted`, `revoked`, `expired` short-circuits before
  any of the four state transitions runs. Verified by Suite 8 A2-A4
  state-mutation assertions.
- **The four state transitions are run in a single PL/pgSQL block** —
  Postgres wraps a function body in an implicit transaction at the
  statement boundary, so all four updates commit or none do.
- **`users.organization_id` is set via the NULL → value first-write
  path** admitted by `protect_user_columns` (SECURITY_REVIEW.md §8.4 /
  M1000). Subsequent attempts to change `organization_id` for the same
  user remain blocked. The function does not raise its own privileges
  to bypass that trigger; it relies on a legitimate first-write.
- **`user_roles` insert uses `ON CONFLICT DO NOTHING`.** Re-acceptance
  (if the row already exists from a prior partial flow) is a no-op
  rather than an error.

Verified by Suite 8 (15 assertions, 2026-05-23).

#### 11.1.7 units / properties lease-mediated tenant-self branches  *(M3LU)*

M3LU drops and recreates `units_select` and `properties_select` again to
add a fourth branch (the lease-mediated path) alongside the M3T branches.
Both policies preserve all prior branches.

- **units_select** — SELECT, `authenticated` — current definition M3LU
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t where t.unit_id = units.id and t.user_id = auth.uid()) or exists (select 1 from public.tenants t join public.leases l on l.id = t.lease_id where l.unit_id = units.id and t.user_id = auth.uid()) or public.is_super_admin())`
- **properties_select** — SELECT, `authenticated` — current definition M3LU
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t join public.units u on u.id = t.unit_id where u.property_id = properties.id and t.user_id = auth.uid()) or exists (select 1 from public.tenants t join public.leases l on l.id = t.lease_id join public.units u on u.id = l.unit_id where u.property_id = properties.id and t.user_id = auth.uid()) or public.is_super_admin())`

**Reviewer note on the lease join.** No status filter on the lease
join — a tenant whose only lease is `ended` retains visibility of the
associated unit/property. This matches `leases_select` (11.1.1) which
similarly does not filter on `status`. Consistent posture across the
tenant-self surface.

#### 11.1.8 maintenance_requests tenant-self branches  *(M3M)*

M3M drops and recreates `maintenance_requests_select` to add a fourth
branch (tenant-by-tenant_id, so staff-created requests on a tenant's
behalf are visible to them), and drops and recreates
`maintenance_requests_insert` to add a tenant-self branch.

- **maintenance_requests_select** — SELECT, `authenticated` — current definition M3M (introduced M0800; superseded by M3M)
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or reported_by = auth.uid() or exists (select 1 from public.tenants t where t.id = maintenance_requests.tenant_id and t.user_id = auth.uid()) or public.is_super_admin())`
- **maintenance_requests_insert** — INSERT, `authenticated` — current definition M3M (introduced M0800; superseded by M3M)
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or (reported_by = auth.uid() and exists (select 1 from public.tenants t where t.user_id = auth.uid() and t.organization_id = maintenance_requests.organization_id and (maintenance_requests.tenant_id is null or maintenance_requests.tenant_id = t.id))) or public.is_super_admin())`
  - Defense-in-depth on the tenant branch: `reported_by` must equal the
    inserter's auth uid; the inserter must own a tenant row in the
    target organization; and if `tenant_id` is set, it must equal the
    inserter's own tenant.id. Three independent checks.

UPDATE / DELETE policies on `maintenance_requests` are unchanged from
M0800 — only staff can mutate; tenants cannot cancel their own
requests (see 11.5).

#### 11.1.9 messages  *(RLS enabled — M3X; IMMUTABLE via absence of policies)*

New enum `public.message_sender_role` (`tenant`, `staff`). New table
`public.messages (id, organization_id, tenant_id, sender_id, sender_role,
body, created_at)`. FK cascade on `organizations`/`tenants`,
`on delete set null` on `sender_id`. `CHECK (length(trim(body))
BETWEEN 1 AND 4000)`. No `updated_at` column — by design, messages are
immutable.

- **messages_select** — SELECT, `authenticated` — M3X
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t where t.id = messages.tenant_id and t.user_id = auth.uid()) or public.is_super_admin())`
  - **Read split**: any `is_org_staff` can read (intentionally broader
    than `can_write_tenants`) so e.g. a maintenance tech sees the
    conversation context for a tenant complaint. Tenant-self via
    `tenants.user_id = auth.uid()` for their own conversation.
- **messages_insert** — INSERT, `authenticated` — M3X
  - WITH CHECK: `((sender_role = 'staff' and sender_id = auth.uid() and organization_id = public.current_user_org_id() and public.can_write_tenants()) or (sender_role = 'tenant' and sender_id = auth.uid() and exists (select 1 from public.tenants t where t.id = messages.tenant_id and t.user_id = auth.uid() and t.organization_id = messages.organization_id)) or public.is_super_admin())`
  - **Write split**: only `can_write_tenants` (management + leasing) can
    send as staff; tenants can only send into their own conversation.
    `sender_id = auth.uid()` on both branches is a forgery guard.
    Defense-in-depth on the tenant branch additionally requires
    `organization_id` to match the tenant's own org.
- **NO `messages_update` policy.** No `messages_delete` policy.
  - This is the load-bearing immutability invariant. With RLS enabled
    and no policy for an operation, the `authenticated` role's UPDATE
    or DELETE affects zero rows. The service-role client can still
    mutate (operator interventions), but ordinary code paths cannot.
    **Future migrations MUST NOT add an UPDATE or DELETE policy** to
    this table without a fresh Gate 1 review — doing so would silently
    convert messages from immutable to editable.

Verified by Suite 12 (14 assertions, 2026-05-23 — covers M1-M14 in
RLS_TEST_PLAN.md §4k).

#### 11.1.10 tenant_conversation_state  *(RLS enabled — M3X)*

New table `public.tenant_conversation_state (tenant_id PRIMARY KEY,
organization_id, last_read_by_tenant_at, last_read_by_staff_at,
updated_at)`. One row per tenant conversation; lazy upsert on first
mark-as-read. `set_updated_at` trigger attached.

**Read state is team-level for staff**: `last_read_by_staff_at` records
"the most recent time any staff member viewed this conversation," not
per-staff-user state. Per-user state was considered and deferred — see
11.5.

- **tenant_conversation_state_select** — SELECT, `authenticated` — M3X
  - USING: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()) or public.is_super_admin())`
- **tenant_conversation_state_insert** — INSERT, `authenticated` — M3X
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.is_org_staff()) or exists (select 1 from public.tenants t where t.id = tenant_conversation_state.tenant_id and t.user_id = auth.uid()) or public.is_super_admin())`
- **tenant_conversation_state_update** — UPDATE, `authenticated` — M3X
  - USING: same as INSERT WITH CHECK
  - WITH CHECK: same as INSERT WITH CHECK
- **No DELETE policy** — checkpoints persist. Whoever can read/write
  the state can also upsert their own checkpoint forward.

### 11.2 New service-role bypass paths (Phase 3 delta to Part B)

The audit packet's Part B inventoried 9 service-role callsites
(B.1–B.9). Phase 3 adds **three more**, all in the invite-acceptance
flow:

#### B.10 — `admin.auth.admin.createUser()`
- **`src/app/invite/[token]/actions.ts:70`** (function `acceptInvite`).
- Operation: creates an `auth.users` row with `email_confirm: true` and
  the chosen password.
- Bypass rationale: invite acceptance is anonymous at call time — there
  is no signed-in user, so the cookie-bound client would fail the
  `tenant_invites_select` RLS check. The admin client is the only path
  to read the invite by `token_hash` and to provision the auth user.
- Trust assumption: the invite is looked up FIRST by `token_hash` (the
  read precedes the admin.createUser call). If the invite is not
  found / accepted / revoked / expired, the function returns before
  `createUser` runs. If `createUser` returns "User already
  registered", the function returns a friendly error and does NOT
  attempt to auto-link — see 11.5.

#### B.11 — `admin.auth.admin.deleteUser()` (rollback)
- **`src/app/invite/[token]/actions.ts:99`** (function `acceptInvite`).
- Operation: deletes the just-created `auth.users` row.
- Bypass rationale: cleanup of an orphaned auth user when the
  subsequent RPC call fails.
- Trust assumption: runs ONLY in the error branch immediately after
  B.10's `createUser` succeeded but the M3A RPC failed. Wrapped in its
  own try/catch — failure to delete the orphan is logged but does not
  surface to the user (the original RPC error is the one returned).

#### B.12 — `admin.rpc("accept_tenant_invite")`
- **`src/app/invite/[token]/actions.ts:91`** (function `acceptInvite`).
- Operation: calls the M3A SECURITY DEFINER RPC.
- Bypass rationale: the user is still anonymous at this point — the
  cookie-bound client has no session. The admin client is the only
  path that holds an EXECUTE grant the caller can use.
- Trust assumption: the M3A function body is the trust boundary; it
  classifies failures (see 11.1.6) and performs the four atomic
  transitions. The application action checks the classified return
  value and only proceeds to `signInWithPassword` on `ok=true`.

### 11.3 Acceptance of audit packet findings (Parts A-F)

The packet's findings remain accurate at HEAD with the following
extensions noted in 11.1-11.2:

- **A.1 helper functions**: confirmed live. No Phase 3 migration added
  or modified a helper.
- **A.2 triggers**: confirmed live. **One new trigger**: `set_updated_at`
  attached to `tenant_conversation_state` by M3X (uses the existing
  function from M0518000600 — no new function, just a new attachment).
- **A.3 / A.4 policies**: confirmed live. **Phase 3 additions** — 13
  new policies across 4 tables, plus 4 supersede-recreations of
  pre-existing policies (`units_select` ×2, `properties_select` ×2,
  `maintenance_requests_select` ×1, `maintenance_requests_insert` ×1).
  Cumulative table-by-table breakdown: 6 new tables × 0-3 policies
  each (leases ×2, tenant_invites ×2, messages ×2, tenant_conversation_state ×3,
  plus the tenants.lease_id column addition to an existing table).
  All bodies in 11.1.
- **A.5 storage posture**: unchanged. Phase 3 added no new buckets and
  no new `storage.objects` policies.
- **Part B (service-role bypass)**: extended in 11.2 with B.10-B.12.
  The summary table (B.10 in packet) now has 12 rows.
- **Part C (audit-log writes)**: vocabulary expanded — `entity_type`
  set now includes `tenant_invite`, `message`, `lease`; `action` set
  expanded with `tenant_invite.sent`, `tenant_invite.resent`,
  `tenant_invite.revoked`, `tenant_invite.accepted`,
  `message.sent`, `lease.created`, `lease.updated`, `lease.ended`,
  and the slice-7 source-tagged `maintenance_request.created` with
  `metadata.source = "tenant_portal"`. Trust model unchanged: each
  caller resolves `organizationId` and `actorId` from a session
  guard before calling `logAudit`.
- **Part D (email module)**: gate count unchanged at 4. Vocabulary
  expanded — `EMAIL_TEMPLATE` now includes `tenant.invite` and
  `tenant.message`. The two correctness fixes (`37582a6`, `d5b5e2c`)
  are gate-tightening — see 11.7.
- **Part E (AI logs)**: unchanged — no Phase 3 work touched the AI
  triage path.
- **Part F.1 (closed items vs. migrations)**: all invariants still
  hold; no Phase 3 migration weakens any §5/§6 invariant. The
  `protect_user_columns` trigger remains load-bearing — M3A's
  `users.organization_id` write relies on the NULL → value branch
  the trigger explicitly admits.
- **Part F.2 (84 RLS test assertions)**: still 84 passing, still 0
  assertions targeting a deleted/non-existent policy. The Phase 3
  surface (8 migrations) introduces zero test coverage in Suites 1-6;
  Suites 8 and 12 (this slice) add 29 new assertions covering the
  highest-risk Phase 3 patterns (the SECURITY DEFINER acceptance RPC
  and the messages immutability + sender_role gating). Four further
  suites (7, 9, 10, 11) are listed in RLS_TEST_PLAN.md §4f, §4h, §4i,
  §4j as deferred — see 11.6.

### 11.4 Phase 3 trust-model summaries (consolidated)

For the reviewer's convenience, the two novel patterns in Phase 3:

**Pattern 1 — SECURITY DEFINER RPC granted to authenticated for an
anonymous-context flow** (`accept_tenant_invite`, 11.1.6). This is a
deliberate, narrow exception to the usual "RLS is the authoritative
enforcement layer" posture. The function authorizes via the token hash
rather than `auth.uid()`. Reviewer should validate:
- The function performs no operation that the token hash alone should
  not authorize (the four state transitions are exactly the
  acceptance-of-this-invite semantics).
- Each classified failure short-circuits before any write.
- The `users.organization_id` write uses the NULL → value path; it
  does not bypass the `protect_user_columns` trigger.
- The `user_roles` insert is `ON CONFLICT DO NOTHING` — re-acceptance
  on a partial-prior-flow row is a no-op, not an error.

**Pattern 2 — RLS-enforced table immutability via policy absence**
(`messages`, 11.1.9). With RLS enabled and no UPDATE / DELETE policy,
the `authenticated` role cannot mutate or remove rows. The service-role
client retains that capability. Reviewer should validate:
- The intent is durable — `messages` is a conversation log; edits
  would be confusing to recipients and destructive to audit semantics.
- Adding an UPDATE or DELETE policy in any future migration silently
  ends immutability. Recommend a comment in the migration file (already
  present at M3X's lines documenting "IMMUTABILITY") and a fresh Gate 1
  review for any change.

### 11.5 Known limitations carried into Phase 4

Items deferred during Phase 3 slice authoring, acknowledged as
known scope-bounded gaps rather than Gate 1 blockers:

1. **`buildings_select` has no tenant-self branch.** M3T added tenant-self
   to `units_select` and `properties_select`; the equivalent
   buildings-mediated path was deferred since the welcome page does not
   surface building information. Layer in when a portal slice needs it.
2. **Tenants cannot cancel their own pending maintenance requests.** M3M
   added INSERT for tenants but UPDATE / DELETE remain staff-only. A
   tenant-self UPDATE branch (limited to `status = 'cancelled'`) is the
   minimum future change.
3. **Existing-account invite acceptance returns a friendly error.** When
   `admin.createUser` reports an email collision, `acceptInvite` returns
   a "sign in to your existing account" message rather than auto-linking
   the existing user to the new tenant record. Auto-link requires
   stronger email-ownership guarantees and was deferred.
4. **Invite acceptance URL is derived from `headers().get("origin")`.**
   In production, a Preview deployment would generate links pointing at
   itself rather than at the canonical app URL. Slice 6b's TODO marker
   in `invite-actions.ts` flags this for the production cutover.
5. **Message read tracking is team-level, not per-staff-user.** A single
   `last_read_by_staff_at` column on `tenant_conversation_state` records
   the most recent staff view of the conversation. Per-staff-user state
   would require either a separate table or a UNIQUE (tenant_id, user_id)
   row shape.
6. **Notification dedup keys on `tenant_id`, not `message.id`.** Slice 8
   deliberately bundles rapid-fire staff messages into one email per
   10-minute dedup window (see 11.7 cross-reference). Per-message
   notification was considered and rejected to avoid spam.
7. **`tenants.unit_id` / `tenants.property_id` columns remain alongside
   the lease-derived truth (commit `1d99482`).** Future cleanup will
   deprecate the direct columns once all readers (`listTenants`,
   `getTenantSelf`, the tenant form sheet, the lease form sheet) are
   confirmed to use the lease chain as primary. Reviewer should be
   aware the same fact may be carried in two places; the lease chain
   wins on read.
8. **Staff do not receive an inbound-message email when a tenant
   replies.** Slice 8 fires `notifyTenantMessageReceived` on staff→tenant
   only. A staff-direction notification template + helper is future
   work; staff currently see new tenant messages by visiting `/messages`.

### 11.6 RLS test-plan delta

Six Phase 3 suites are documented in RLS_TEST_PLAN.md §4f-§4k.

| Suite | Coverage | Status |
|---|---|---|
| 7 — leases tenant-self | `leases_select` tenant branch via `tenants.lease_id`; `leases_write` manager-only gating | **authored 2026-05-23** — `supabase/tests/rls_phase3_leases_tenant_self.sql`, 7/7 passing |
| 8 — accept_tenant_invite RPC | atomic 4-step transition; 4 classified error codes; SECURITY DEFINER + EXECUTE grant posture; exact `token_hash` matching | **authored 2026-05-23** — `supabase/tests/rls_phase3_accept_tenant_invite.sql`, 15/15 passing |
| 9 — tenant_invites lifecycle | `can_write_tenants` gate on both branches; mutual-exclusion CHECK; revoke lifecycle path | **authored 2026-05-23** — `supabase/tests/rls_phase3_tenant_invites_lifecycle.sql`, 9/9 passing |
| 10 — tenant-self units / properties + lease-mediated | direct (M3T) and lease-mediated (M3LU) tenant-self branches; ended-lease regression for the no-status-filter design (§11.1.7) | **authored 2026-05-23** — `supabase/tests/rls_phase3_units_properties_tenant_self.sql`, 11/11 passing |
| 11 — tenant-self maintenance | M3M select + insert; defense-in-depth on insert | **authored 2026-05-23** — `supabase/tests/rls_phase3_maintenance_tenant_self.sql`, 10/10 passing |
| 12 — messages immutability + sender_role | RLS no-UPDATE / no-DELETE; sender_role gating; sender_id forgery guard; defense-in-depth on tenant insert | **authored 2026-05-23** — `supabase/tests/rls_phase3_messages_immutable.sql`, 14/14 passing |

Suites 8 and 12 were authored first because they cover the **novel**
patterns introduced in Phase 3 (SECURITY DEFINER with anonymous grant;
RLS-enforced immutability). Suites 7, 11, 9, and 10 were authored as a
follow-up arc in that order — simplest to most permutation-heavy —
and now close the Phase 3 RLS coverage gap. Notable assertions in the
follow-up suites:

- **Suite 7 L7** — tenant INSERT lease rejected by manager-only WITH CHECK.
- **Suite 11 Q3** — T2 sees the staff-created request via the new
  tenant-by-tenant_id branch (not via reporter-self).
- **Suite 11 Q8/Q9/Q10** — each independent defense-in-depth predicate
  on tenant INSERT verified by isolated rejection.
- **Suite 9 I8** — the mutual-exclusion CHECK constraint rejects an
  invite with both `accepted_at` and `revoked_at` set.
- **Suite 10 U6** — design-decision regression: tenant with
  `lease.status = 'ended'` still sees the unit. If a future migration
  accidentally adds `AND status != 'ended'` to the lease join, this
  catches it.

### 11.7 Email-safety delta

Two correctness fixes shipped during Phase 3 walk testing. Both **tighten
existing gates** rather than introduce new ones. Documented in detail in
`EMAIL_SAFETY.md` §7:

- §7.1 — `37582a6` — `normalizeAddress()` is now applied at the Resend
  handoff in `deliverViaResend()`, fixing a sandbox-sender rejection
  when the DB-stored recipient's case differed from the verified
  account email. `email_log.to_address` continues to record the
  user-visible original case for audit fidelity.
- §7.2 — `d5b5e2c` — `isRecipientAllowed()` strips plus-tag aliases
  from both the recipient and each allowlist entry before comparing,
  so plus-aliased test fixtures (e.g., `krisk58504+tenant1@gmail.com`)
  pass the gate when the base address is allowlisted.
  `normalizeAddress()` itself is unchanged — the provider still sees
  the plus-aliased address verbatim so Gmail routes it to the right
  alias.

Neither fix relaxes Gate 1, Gate 2, or Gate 3 — both are
within-gate refinements. EMAIL_SAFETY.md §6 production checklist is
unchanged.

### 11.8 Phase 3 application-layer notes

For completeness, three application-layer items the reviewer may wish
to know:

- **Tenant invite tokens are stored as SHA-256 hex digests; the raw
  token is never persisted** (`src/lib/auth/invite-tokens.ts`). Raw
  token is generated as `crypto.randomBytes(32).toString("base64url")`
  (256 bits of entropy, URL- and email-safe encoding). A DB read
  therefore cannot produce a usable token for replay; acceptance hashes
  the inbound token from the URL and looks up by hash. This is the
  same posture used for password reset tokens in mature systems.
- **`messages` table immutability is RLS-enforced** (11.1.9 and 11.4
  Pattern 2). This is a novel pattern in this codebase — every other
  table that takes mutating writes has explicit UPDATE / DELETE policies.
- **`@base-ui/react@1.5.0` compatibility fix** (`79f86cb`) — wrapped
  `DropdownMenuLabel` in `DropdownMenuGroup` in three user-menu
  components. Application bug, no security implication; noted for
  completeness only.

### 11.9 Sign-off

By signing below, the reviewer attests that:

1. The audit packet's Parts A-F findings remain accurate at the snapshot
   named in 11.0.
2. The Phase 3 RLS additions inventoried in 11.1 have been read and
   accepted, with particular attention to the two novel patterns
   highlighted in 11.4 (SECURITY DEFINER with anonymous grant; RLS-
   enforced immutability).
3. The new service-role bypass paths in 11.2 have been reviewed; each
   trust assumption is judged acceptable.
4. The known limitations in 11.5 are acknowledged as known scope-bounded
   gaps, not Gate 1 blockers.
5. The RLS test-plan delta in 11.6 is acknowledged: all six Phase 3
   suites (7-12) are now authored and passing — 66 new assertions
   covering the Phase 3 RLS surface, on top of the 84 prior assertions.
   No Phase 3 RLS surface remains uncovered by automated test.
6. The email-safety delta in 11.7 and EMAIL_SAFETY.md §7 are
   gate-tightening improvements, not gate relaxations.

| Reviewer | Date | Outcome |
|---|---|---|
| Kris Kelley | 2026-05-23 | Certified — Gate 1 approved |

## 12. Sign-off — Phase 4 close & Gate 1 re-certification

### 12.0 Scope and snapshot

- Branch: `phase-2-maintenance` at HEAD `3010b58` (2026-05-24).
- Phase 4 migrations covered: **5 files**, `20260528000100` through
  `20260531000100`. The full migration set on the branch is now 35
  files; §11 covered files 1-31 (Phases 1-3); §12 covers files 32-35
  plus the slice 9a follow-up at file 32-bis (the cross-org FK pin
  closure, sequenced `20260528000200`).
- Application code covered: `src/` at the named commit, plus
  `PHASE_4_PLAN.md` as the Phase 4 source-of-record (closed Step 0
  decisions in §0.5 are referenced throughout below).
- Reference: §11 (above) is the source-of-record for all surface
  established before Phase 4. §12 confirms that §11 findings remain
  accurate at the snapshot above, then inventories the **five Phase 4
  additions** that post-date §11's sign-off.
- Cumulative RLS test coverage: **181 assertions across 13 suites**
  (150 carried forward from §11.0 + 31 new in Phase 4 Suite 13). All
  181 passing as of 2026-05-24; 0 errored. Phase 4 Suite 13 passed
  **31/31 on first run** — see §12.7.
- §12 closes Phase 4 per `PHASE_4_PLAN.md` §8 Step 6.

### 12.1 Phase 4 RLS additions

One sub-section per migration. USING and WITH CHECK clauses reproduced
verbatim from the migration SQL, matching the depth of §11.1.
Migration short-codes used:

- **M4LD** = `20260528000100_phase4_leads.sql`
- **M4LDP** = `20260528000200_phase4_leads_cross_org_pin.sql` (slice 9a
  follow-up — the §8.1 propagation closure)
- **M4T** = `20260529000100_phase4_tours.sql`
- **M4A** = `20260530000100_phase4_applications.sql`
- **M4C** = `20260531000100_phase4_lease_conversion.sql` (Conversion)

#### 12.1.1 leads  *(RLS enabled — M4LD)*

New enums `public.lead_status` (`new`, `contacted`, `qualified`,
`tour_scheduled`, `applied`, `converted`, `disqualified`, `lost`) and
`public.lead_source` (`website`, `referral`, `walkin`, `partner`,
`other`). New table `public.leads (id, organization_id, status, source,
first_name, last_name, email, phone, assigned_to, desired_property_id,
desired_move_in, desired_bedrooms, desired_budget, notes, created_at,
updated_at)` with FK cascade on `organizations`, `on delete set null`
on `assigned_to` (→ `users`) and `desired_property_id` (→ `properties`).
Four indexes (org / status / assigned_to / desired_property_id).
`set_updated_at` trigger attached.

**Narrow read+write posture** per `PHASE_4_PLAN.md` §0.5 decision 7.
Both SELECT and WRITE gated on `can_write_tenants()` — `MAINTENANCE_TECH`
is `is_org_staff()` but NOT `can_write_tenants()`, so reads AND writes
deny for that role. This is the tighter posture vs Phase 3 messages
(which split broad-read from narrow-write); chosen because lead /
application records carry PII (monthly income, employment status,
prior address, background-check consent — surfacing on applications in
M4A but the table-wide read scope is locked here).

- **leads_select** — SELECT, `authenticated` — M4LD
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
- **leads_insert** — INSERT, `authenticated` — M4LD *(superseded by M4LDP — see 12.1.2)*
  - WITH CHECK *(original M4LD body)*: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
- **leads_update** — UPDATE, `authenticated` — M4LD *(superseded by M4LDP — see 12.1.2)*
  - USING *(original M4LD body)*: same as `leads_insert` WITH CHECK
  - WITH CHECK *(original M4LD body)*: same as `leads_insert` WITH CHECK
- **leads_delete** — DELETE, `authenticated` — M4LD
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`

#### 12.1.2 leads cross-org FK pin closure  *(M4LDP — slice 9a follow-up)*

**The §8.1 propagation closure.** M4LD's `leads_insert` /
`leads_update` policies pinned the row's own `organization_id` to
`current_user_org_id()` but did NOT verify that `desired_property_id`
and `assigned_to` (when non-null) reference rows in the SAME
organization — the same vulnerability shape Phase 2 §8.1 closed for
`vendor_invoices` / `vendor_assignments`. A manager in Org A could
craft an insert with `organization_id = A` while supplying a
`desired_property_id` pointing at an Org B property, or an
`assigned_to` pointing at an Org B user. **Found and closed during
slice 9b authoring** (commit `dccbf45`); shipped before any Phase 4
sign-off so the gap never reached a certified Gate 1 surface.

M4LDP drops and recreates `leads_insert` + `leads_update` with EXISTS
subqueries against `properties` and `users`, both keyed on the target
row's `organization_id` matching the lead's `organization_id`.
`leads_select` and `leads_delete` are intentionally NOT touched (no
write-time-trusted-input surface on those operations).

- **leads_insert** — INSERT, `authenticated` — **current definition M4LDP**
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.can_write_tenants() and (desired_property_id is null or exists (select 1 from public.properties p where p.id = leads.desired_property_id and p.organization_id = leads.organization_id)) and (assigned_to is null or exists (select 1 from public.users u where u.id = leads.assigned_to and u.organization_id = leads.organization_id))) or public.is_super_admin())`
- **leads_update** — UPDATE, `authenticated` — **current definition M4LDP**
  - USING: same predicate as `leads_insert` WITH CHECK (defense-in-depth:
    a row that somehow already contains cross-org FKs is not admitted
    for further mutation).
  - WITH CHECK: same predicate.

Suite 13 K7 + K8 verify the propagation: a PM inserting a lead with
cross-org `desired_property_id` (K7) or cross-org `assigned_to` (K8) is
rejected. K5 confirms the same-org positive control still admits.

#### 12.1.3 tours  *(RLS enabled — M4T)*

New enum `public.tour_status` (`scheduled`, `completed`, `no_show`,
`cancelled`). New table `public.tours (id, organization_id, lead_id,
unit_id, agent_id, scheduled_at, status, outcome_notes, created_at,
updated_at)` with FK cascade on `organizations`/`leads`,
`on delete set null` on `unit_id` and `agent_id`. Four indexes
(org / lead / agent / scheduled_at). `set_updated_at` trigger attached.

Same narrow read+write posture as leads. **Cross-org FK pins built in
from the start** (§8.1 pattern applied proactively rather than as a
follow-up — slice 9b learned from the slice 9a gap). `tours_insert`
and `tours_update` both verify `lead_id` (required, must match org),
`unit_id` (when non-null), and `agent_id` (when non-null).

- **tours_select** — SELECT, `authenticated` — M4T
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
- **tours_insert** — INSERT, `authenticated` — M4T
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.can_write_tenants() and exists (select 1 from public.leads l where l.id = tours.lead_id and l.organization_id = tours.organization_id) and (unit_id is null or exists (select 1 from public.units u where u.id = tours.unit_id and u.organization_id = tours.organization_id)) and (agent_id is null or exists (select 1 from public.users usr where usr.id = tours.agent_id and usr.organization_id = tours.organization_id))) or public.is_super_admin())`
- **tours_update** — UPDATE, `authenticated` — M4T
  - USING: same predicate as `tours_insert` WITH CHECK.
  - WITH CHECK: same predicate.
- **tours_delete** — DELETE, `authenticated` — M4T
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`

Suite 13 T7 / T8 / T9 verify the three FK pins independently.

#### 12.1.4 applications  *(RLS enabled — M4A)*

New enum `public.application_status` (`draft`, `submitted`,
`under_review`, `approved`, `rejected`, `withdrawn`). New table
`public.applications (id, organization_id, lead_id, unit_id, status,
applicant_first_name, applicant_last_name, applicant_email,
applicant_phone, desired_move_in, monthly_income, employment_status,
prior_address, background_check_consent, submitted_at, decided_at,
decided_by, decision_notes, created_at, updated_at)`. FK cascade on
`organizations`, `on delete set null` on `lead_id` and `decided_by`,
`on delete restrict` on `unit_id` (applications outlive lead rows;
unit deletion is blocked while a referencing application exists).
Four indexes (org / lead / unit / status). `set_updated_at` trigger
attached.

Same narrow read+write posture as leads / tours. Cross-org FK pins
built in from the start on `unit_id` (required), `lead_id` (when
non-null), `decided_by` (when non-null).

**Status transitions are NOT enforced by RLS** per `PHASE_4_PLAN.md`
§7 risk 4. The transition map (`draft → submitted | withdrawn`;
`submitted → under_review | withdrawn | rejected`; etc.) lives in the
`updateApplication` server action only (`isAllowedTransition` helper
in `src/lib/validations/application.ts`). No RESTRICTIVE policy on
this table. Suite 13 A10 verifies this absence — a direct UPDATE that
would violate the transition map (`draft → approved`) succeeds at the
RLS layer.

- **applications_select** — SELECT, `authenticated` — M4A
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`
- **applications_insert** — INSERT, `authenticated` — M4A
  - WITH CHECK: `((organization_id = public.current_user_org_id() and public.can_write_tenants() and exists (select 1 from public.units u where u.id = applications.unit_id and u.organization_id = applications.organization_id) and (lead_id is null or exists (select 1 from public.leads l where l.id = applications.lead_id and l.organization_id = applications.organization_id)) and (decided_by is null or exists (select 1 from public.users usr where usr.id = applications.decided_by and usr.organization_id = applications.organization_id))) or public.is_super_admin())`
- **applications_update** — UPDATE, `authenticated` — M4A
  - USING: same predicate as `applications_insert` WITH CHECK.
  - WITH CHECK: same predicate.
- **applications_delete** — DELETE, `authenticated` — M4A
  - USING: `((organization_id = public.current_user_org_id() and public.can_write_tenants()) or public.is_super_admin())`

Suite 13 A7 / A8 / A9 verify the three FK pins independently.

#### 12.1.5 tenants.source_application_id  *(additive column — M4C)*

The only Phase 4 modification to an **existing** table.

```sql
alter table public.tenants
  add column if not exists source_application_id uuid
    references public.applications(id) on delete set null;
create index if not exists tenants_source_application_id_idx
  on public.tenants(source_application_id);
```

Nullable so existing tenant rows (every row predating Phase 4) keep
`source_application_id` NULL forever. The `convertApplicationToLease`
server action sets it; nothing else writes it. The existing
`tenants_select` / `tenants_write` policies are unchanged — the new
column inherits the tenants table's RLS posture (`can_write_tenants()`
gate, same as the rest of Phase 4's leasing surface).

Provenance only — query `tenants.source_application_id` to find the
tenant created from a given application. The same reverse lookup
drives the `ApplicationRow.converted_tenant_id` enrichment in
`src/lib/data/applications.ts` that powers the "Converted" affordance
on the application detail page.

Suite 13 X4 verifies the column accepts a valid FK insert.

### 12.2 Modified Phase 3 surface — `create_lease_with_tenants` RPC widening

**This subsection is the Phase-4-unique insertion §11 did not need.**

The Phase 3 SECURITY DEFINER RPC `create_lease_with_tenants` (M3LR /
`20260521000200_phase3_create_lease_rpc.sql`), inventoried in §11.1.3
and certified under §11.9 with the narrower `is_org_manager()`
authority cohort, is **modified in M4C**. The change is a one-line swap
inside the function body's authority guard; every other property of
the function — signature, return type, SECURITY DEFINER attribute,
lease INSERT + tenants UPDATE body, REVOKE/GRANT block — is preserved
byte-for-byte.

**Diff (the only behavior change):**

```sql
-- Before (M3LR — Phase 3, certified under §11.9):
if not (
  (public.is_org_manager() and public.current_user_org_id() = p_organization_id)
  or public.is_super_admin()
) then raise exception '...' using errcode = '42501'; end if;

-- After (M4C — Phase 4, certification asked in §12.10):
if not (
  (public.can_write_tenants() and public.current_user_org_id() = p_organization_id)
  or public.is_super_admin()
) then raise exception '...' using errcode = '42501'; end if;
```

Full body in M4C; the diff above is the entirety of the semantic
change. The `auth.uid() IS NULL → 28000` pre-check is retained — the
function still requires an authenticated caller.

**Rationale.** Per `PHASE_4_PLAN.md` §0.5 decision 3 (locked
2026-05-23), `convertApplicationToLease` (slice 9d) must be callable
by a `LEASING_AGENT`. The LA owns the leasing pipeline end-to-end —
forcing them to escalate to a manager every time an approved
application converts would create a real workflow friction without a
matching security benefit. Widening the RPC's internal authority guard
to `can_write_tenants()` admits the LA cohort directly. The
alternative considered (have `convertApplicationToLease` call the RPC
via the admin client to bypass the in-body check) was rejected as
worse — it would bypass an explicit safety check rather than redefine
it.

**Reviewer attestation language.** This RPC was certified under §11
sign-off with the narrower manager-only authority. §12 re-certifies it
under the widened `can_write_tenants()` authority cohort, which
includes management roles (`SUPER_ADMIN`, `OWNER`, `REGIONAL_MANAGER`,
`PROPERTY_MANAGER`) plus `LEASING_AGENT`. The change is driven by
`PHASE_4_PLAN.md` §0.5 decision 3 to enable LEASING_AGENT to call the
RPC from `convertApplicationToLease`. The RPC remains SECURITY
DEFINER; the authentication requirement (`auth.uid()` not null) is
unchanged; the cross-org tenant pin in the tenants UPDATE
(`organization_id = p_organization_id`) is unchanged.

**Test coverage.** Suite 13 X1 / X2 / X3 verify the widening behaves
as documented:

- X1 — `LEASING_AGENT` calls the RPC and it succeeds; the resulting
  lease lands in the caller's org (two-step verification per the audit
  proposal). Pre-Phase-4 this would have raised SQLSTATE 42501.
- X2 — `PROPERTY_MANAGER` calls the RPC and it still succeeds
  (regression — widening did not lock out managers).
- X3 — `MAINTENANCE_TECH` calls the RPC and is rejected with SQLSTATE
  42501 from the explicit guard. The widening was to
  `can_write_tenants()`, NOT to `is_org_staff()`; MT remains outside
  the cohort.

**Pre-existing `/leases` create surface is unaffected.** The Phase 3
`createLease` action in `src/app/(app)/leases/actions.ts:25` gates at
`isManager()` in the **action layer** BEFORE invoking the RPC. The
widening of the RPC's in-body check does NOT silently widen the
`/leases` page surface; that surface keeps its narrower
`isManager()` action-layer gate. The new authority cohort is only
exercised via `convertApplicationToLease`. Reviewer should confirm
during sign-off that no other caller of the RPC has been added that
would benefit from the wider cohort without an action-layer gate of
its own.

### 12.3 New service-role bypass paths

**Phase 4 added zero new service-role bypass paths.** The B.x
inventory from §11.2 stands unchanged at 12 rows (B.1–B.9 from the
audit packet + B.10–B.12 from Phase 3's invite-acceptance flow). No
Phase 4 server action uses the admin client.

In particular, `convertApplicationToLease` (slice 9d, the integration
action that ties applications → tenants + leases) uses the
**cookie-bound client throughout**:

- The pre-flight reads (application by id, existing-conversion check,
  unit lookup) all run through `createClient()` and are governed by
  RLS.
- The tenant INSERT runs through the cookie-bound client and is
  governed by `tenants_write` (which gates on `can_write_tenants()`).
- The `create_lease_with_tenants` RPC call runs through the
  cookie-bound client; the RPC is granted EXECUTE to `authenticated`
  and the in-body guard re-verifies authority (per §12.2).
- The soft-write lead status update runs through the cookie-bound
  client and is governed by `leads_update`.

The only admin-client usage in the action is the existing
`logAudit()` chokepoint (audit-log inserts go through the
service-role client per the established §11 / packet Part B pattern;
this is not a new bypass path — it is the same one inventoried as
B.6 in the audit packet).

### 12.4 Acceptance of audit-packet findings (Parts A-F)

§11.3 walked through Parts A-F at the Phase 3 snapshot. §12.4
confirms each Part is still accurate at the Phase 4 snapshot and notes
the deltas:

- **A.1 helper functions**: confirmed live. **No Phase 4 migration
  added or modified a helper.** `can_write_tenants()`,
  `current_user_org_id()`, `is_org_staff()`, `is_org_manager()`,
  `is_super_admin()` all date to Phase 1 / Phase 2 and continue in
  force. The Phase 4 narrow-read posture (§12.1.1) consumes
  `can_write_tenants()` as-is.
- **A.2 triggers**: confirmed live. **Three new `set_updated_at`
  attachments** — one each on `leads` (M4LD), `tours` (M4T),
  `applications` (M4A). All three attach the existing
  `public.set_updated_at()` function from M0518000600 — no new
  trigger function this phase.
- **A.3 / A.4 policies**: confirmed live. **Phase 4 additions** — 12
  new policies across 3 tables (4 per table × 3 tables: leads, tours,
  applications), plus 2 supersede-recreations from M4LDP
  (`leads_insert`, `leads_update`). No supersede-recreations of any
  pre-Phase-4 table's policies. The `tenants_select` /
  `tenants_write` policies (M0700 / Phase 1) are unchanged — the
  `source_application_id` additive column from M4C inherits the
  existing posture (§12.1.5).
- **A.5 storage posture**: unchanged. Phase 4 added no new storage
  buckets and no new `storage.objects` policies (application document
  uploads are deferred per §12.6 item 3).
- **Part B (service-role bypass)**: extended in §12.3 — **with zero
  new entries**. The summary table stays at 12 rows.
- **Part C (audit-log writes)**: vocabulary expanded substantially.
  New `entity_type` values: `lead`, `tour`, `application`. New
  `action` values:
  - Lead lifecycle: `lead.created`, `lead.updated` (carrying
    `from_status`/`to_status` delta metadata when status changes),
    `lead.deleted`.
  - Tour lifecycle: `tour.scheduled`, `tour.updated` (delta
    metadata), `tour.deleted`.
  - Application lifecycle: `application.created`,
    `application.updated` (delta metadata),
    `application.deleted`, `application.approved`,
    `application.rejected`, `application.converted`.
  - Conversion-specific dual-vocabulary: the slice 9d
    `convertApplicationToLease` action emits **three** audit
    entries on success — `tenant.created` (existing vocabulary,
    with `metadata.source = "application_conversion"` +
    `application_id` + `lead_id`), `lease.created` (existing
    vocabulary, same `metadata.source` tag + `application_id` +
    `tenant_id` + `unit_id` + `monthly_rent` + `start_date`), and
    `application.converted` (new vocabulary; `metadata.tenant_id`
    + `metadata.lease_id`).
  - Trust model unchanged: each caller resolves `organizationId`
    and `actorId` from a session guard before calling `logAudit`.
- **Part D (email module)**: gate count unchanged at 4. **No Phase 4
  email vocabulary additions** — per `PHASE_4_PLAN.md` §0.5
  decision 5 (manual invite on conversion) and decision 6 (no tour
  confirmation emails). EMAIL_SAFETY.md is unchanged this phase
  (see §12.8).
- **Part E (AI logs)**: unchanged — no Phase 4 work touched the AI
  triage path. Lead scoring / application auto-decisioning are
  explicitly out of Phase 4 scope per `PHASE_4_PLAN.md` §1 (Phase 6
  Automation engine).
- **Part F.1 (closed items vs. migrations)**: all invariants still
  hold; no Phase 4 migration weakens any §5/§6 invariant. The
  `protect_user_columns` trigger remains load-bearing — Phase 4 did
  not touch any user-linkage column.
- **Part F.2 (RLS test assertions)**: now **181 passing** (was 150 at
  §11 close). Phase 4 Suite 13 added 31 new assertions covering the
  Phase 4 RLS surface end-to-end. Still 0 assertions targeting a
  deleted/non-existent policy. See §12.7 for the test-plan delta.

### 12.5 Phase 4 trust-model summary

**Phase 4 introduced no novel security patterns.** Unlike Phase 3
(which carried two novel patterns flagged in §11.4 — SECURITY DEFINER
with anonymous grant; RLS-enforced immutability via policy absence),
Phase 4 reuses only established patterns:

- **Narrow read+write gated on `can_write_tenants()`** — established
  by Phase 3 `tenant_invites` (§11.1.4); propagated to three new
  tables (leads, tours, applications) per §0.5 decision 7.
- **One-policy-per-operation shape** (separate select / insert /
  update / delete) — established by Phase 3 M3X / M3I; continued in
  Phase 4 for clearer `pg_policies` introspection vs. a single
  `for all` policy.
- **§8.1 cross-org FK pin pattern** — established by Phase 2 §8.1
  closure (`vendor_invoices`, `vendor_assignments`); propagated to
  all three new Phase 4 entity tables on all relevant FK columns:
  - leads: `desired_property_id`, `assigned_to` (M4LDP — closed as a
    follow-up after the slice 9a gap was caught)
  - tours: `lead_id` (required), `unit_id`, `agent_id` (M4T — built
    in from the start)
  - applications: `unit_id` (required), `lead_id`, `decided_by`
    (M4A — built in from the start)
- **SECURITY DEFINER RPC with explicit in-body authority check** —
  established by Phase 3 M3LR (`create_lease_with_tenants`);
  modified in Phase 4 M4C (one-line authority widening per §12.2).
  No new SECURITY DEFINER functions added.

**Reviewer attention** for §12 is on **propagation correctness** of
the §8.1 pattern (not pattern novelty). Suite 13 K7 / K8 / T7 / T8 /
T9 / A7 / A8 / A9 — eight assertions, each isolating a single
cross-org FK rejection — verify the propagation. The follow-up
M4LDP migration (commit `dccbf45`) is the cautionary tale: a Phase 4
table shipped without the §8.1 pins and the gap was caught during
the next slice's audit. The pattern is now treated as a Phase 4
default.

### 12.6 Known limitations carried into Phase 5+

Items deferred during Phase 4 slice authoring, acknowledged as
known scope-bounded gaps rather than Gate 1 blockers:

1. **`convertApplicationToLease` is not atomic across the
   (tenant INSERT, RPC call) boundary.** If the RPC fails after the
   tenant row is inserted, the tenant row remains as an orphan
   (no `lease_id`, `source_application_id` set). Recovery is manual:
   the LA deletes the orphan tenant via `/tenants` and retries the
   conversion. Future hardening: wrap both writes in a single
   SECURITY DEFINER RPC `create_tenant_and_lease_from_application()`
   so they share one PL/pgSQL transaction. Documented inline in
   M4C's header block and in the action's doc comment. Was an
   explicit accepted-trade decision during slice 9d audit.
2. **Manual invite on conversion.** `convertApplicationToLease`
   creates the tenant + lease and stops. The LA fires `sendInvite`
   as a separate manual step from the new tenant's row in
   `/tenants`. No auto-invite checkbox in the convert dialog. Per
   `PHASE_4_PLAN.md` §0.5 decision 5 — fewer side-effects per
   action; LA can confirm everything looks right before sending the
   email.
3. **Application document uploads deferred.** Proof of income, ID,
   prior-residence verification, etc. The
   `background_check_consent` column is a consent capture only — no
   integrated workflow. Couples to the document-management module
   (phase-untagged, likely Phase 6).
4. **Credit-check / background-check integration deferred.** No
   third-party API integration. The consent checkbox is captured;
   the actual check is an out-of-band process owned by the LA.
   Phase 5+.
5. **Tour confirmation / reminder emails deferred** per
   `PHASE_4_PLAN.md` §0.5 decision 6. No new Gate 3 template, no
   `notifyTourScheduled` helper. Tour notifications wait for the
   Phase 6 Automation engine to model them as triggered automations
   rather than per-action sends.
6. **Kanban view of `/leasing` deferred** per `PHASE_4_PLAN.md`
   §0.5 decision 4. List view shipped as the slice 9a baseline;
   Kanban remains an explicit follow-up slice (call it 9a.2 if it
   materializes). Status is a sortable/filterable column in the
   list view, not a visual swim-lane.
7. **Lease renewals workflow.** Adjacent shape to conversion
   (creates a successor lease from an existing tenant + unit
   relationship) but materially different. Not in
   `PHASE_4_PLAN.md` §1 scope.
8. **No top-level `/tours` calendar route.** Per slice 9b, tours
   render only as a sub-section on the lead detail page
   (`/leasing/[leadId]`). A standalone tour calendar /
   iCal export was explicitly deferred per `PHASE_4_PLAN.md` §1
   exclusions table.
9. **`/applications` list-row "Converted" affordance.** Slice 9d
   ships the conversion-state UI on the application **detail** page
   only (the green "Converted to tenant + lease" panel with links
   to `/tenants` and `/leases`). The list view continues to show
   the status badge with no extra "this app converted" surfacing.
   Deferred as a follow-up UI slice if walk-test reveals the need.

### 12.7 RLS test-plan delta

One Phase 4 suite is documented in `RLS_TEST_PLAN.md` §4l.

| Suite | Coverage | Status |
|---|---|---|
| 13 — leasing CRM | Phase 4 entity tables (leads / tours / applications) cohort gating + cross-org FK pin rejections; A10 confirms RLS does NOT enforce `application_status` transitions; X1-X4 verify the `create_lease_with_tenants` RPC widening + the `tenants.source_application_id` additive column | **authored 2026-05-24** — `supabase/tests/rls_phase4_leasing.sql`, 31/31 passing **on first run** |

**First-run pass.** All 31 assertions were green on initial execution
against the dev database. This is real signal that the Phase 4
patterns are stable extensions of established precedents (the §8.1
FK pin pattern from Phase 2, the narrow-read posture from Phase 3
`tenant_invites`, the SECURITY DEFINER in-body authority check from
M3LR) — no surprises during test authoring. Compare to Phase 3 Suite
8 (`accept_tenant_invite`), where the SECURITY DEFINER + anonymous
grant + classified-error pattern was novel and the first authoring
pass surfaced the "no state mutation on classified failure" property
explicitly.

Cumulative RLS coverage at §12 close: **181 assertions across 13
suites** (84 prior + 66 Phase 3 + 31 Phase 4). Zero deferred suites.
Zero assertions targeting a deleted/non-existent policy.

Notable assertions in Suite 13:

- **K3 / T3 / A3** — the load-bearing narrow-read assertions
  (`MAINTENANCE_TECH` sees 0 rows on all three Phase 4 tables). The
  property that distinguishes Phase 4 from Phase 3 `messages` (which
  uses the broader `is_org_staff()` read scope).
- **K7 / K8** — leads cross-org FK pin rejections (§8.1 closure from
  M4LDP).
- **T7 / T8 / T9** — tours cross-org FK pin rejections on all three
  pinnable columns.
- **A7 / A8 / A9** — applications cross-org FK pin rejections on all
  three pinnable columns.
- **A10** — direct UPDATE `applications.status` from `draft` to
  `approved` as PM succeeds at the RLS layer (verifies the absence
  of an RLS RESTRICTIVE policy — transition rules live ONLY in the
  `updateApplication` server action).
- **X1** — `LEASING_AGENT` can now call `create_lease_with_tenants`
  (pre-Phase-4 this would have raised SQLSTATE 42501); the resulting
  lease lands in the caller's org (two-step verification).
- **X3** — `MAINTENANCE_TECH` still cannot call the RPC. Widening
  was to `can_write_tenants()`, not to `is_org_staff()`.

### 12.8 Email-safety delta

**Phase 4 did not touch email infrastructure.** Gate 3 posture
unchanged from §11.7's posture (which references EMAIL_SAFETY.md §7).
No Phase 4 amendments to EMAIL_SAFETY.md, no new templates, no new
template registrations, no new `sendEmail()` chokepoint callers.

Per `PHASE_4_PLAN.md` §0.5:
- **Decision 5** locked manual invite on conversion (no
  `convertApplicationAndSendInvite` combined action).
- **Decision 6** locked no tour confirmation emails (no
  `tour.confirmation` template, no Gate 3 surface extension).

The existing Phase 3 invite-send infrastructure (slice 6b — used by
the LA as the manual follow-up after `convertApplicationToLease`) is
the only email path Phase 4 touches functionally, and it is consumed
unchanged from §11's certification.

### 12.9 Phase 4 application-layer notes

For completeness, four application-layer items the reviewer may wish
to know:

- **`application_status` transition map is enforced at the app
  layer, NOT in RLS.** The `isAllowedTransition` helper in
  `src/lib/validations/application.ts` defines the allowed-set map
  (`draft → submitted | withdrawn`; `submitted → under_review |
  withdrawn | rejected`; `under_review → approved | rejected |
  withdrawn`; `approved → withdrawn`; `rejected → ∅`;
  `withdrawn → ∅`). The `updateApplication` server action calls it
  before any UPDATE; disallowed transitions return a friendly field
  error. Suite 13 A10 verifies the **absence** of a corresponding
  RLS RESTRICTIVE policy — a direct UPDATE bypassing the action
  succeeds at the RLS layer. Per `PHASE_4_PLAN.md` §7 risk 4 and
  §3c.§8.2: app-layer enforcement is the only layer.
- **`convertApplicationToLease` three-audit pattern.** On success,
  the action emits three `logAudit` entries with a shared
  `metadata.source = "application_conversion"` tag where
  applicable: `tenant.created` (with `application_id` + `lead_id`),
  `lease.created` (with `application_id` + `tenant_id` + `unit_id`
  + `monthly_rent` + `start_date`), and `application.converted`
  (with `tenant_id` + `lease_id`). The dual-source tagging supports
  both "list all entities created via conversion" (filter on
  `metadata.source`) and "find the conversion event for this
  application" (filter on `action = 'application.converted'`).
- **`lead.status = 'converted'` soft-write on conversion.** If the
  converted application has a non-null `lead_id`,
  `convertApplicationToLease` updates the originating lead's status
  to `'converted'` (lead_status enum value from M4LD). The update
  is wrapped in a try/catch that swallows failures — lead status is
  a CRM hint, not a contract. A failed lead-status write does NOT
  roll back the conversion. The audit log does NOT record a
  separate `lead.updated` for the soft-write (the conversion is
  represented by the three entries above).
- **`TENANT_WRITE_ROLES` constant consolidation** (slice 9c
  cleanup). Prior to slice 9c, both `src/lib/data/leads.ts` and
  `src/lib/data/tours.ts` defined a local `ASSIGNEE_ROLES` constant
  duplicating the existing `TENANT_WRITE_ROLES` from
  `src/lib/constants.ts` (the constant has existed since Phase 1).
  Slice 9c removed the duplications and imported the constant
  centrally. **No behavior change** — the role set is identical
  (`SUPER_ADMIN`, `OWNER`, `REGIONAL_MANAGER`, `PROPERTY_MANAGER`,
  `LEASING_AGENT`). Worth registering for future reviewers who
  notice the cleanup.

### 12.10 Sign-off

By signing below, the reviewer attests that:

1. The §11 findings remain accurate at the §12.0 snapshot. No
   Phase 4 work regressed any Phase 1 / Phase 2 / Phase 3 RLS,
   service-role, audit, email, or AI surface — every Phase 4
   migration is purely additive except for the explicit §12.2
   modification.
2. The Phase 4 RLS additions inventoried in §12.1 have been read
   and accepted: three new entity tables (leads, tours,
   applications) with 12 new policies in the narrow read+write
   posture; the §8.1 cross-org FK pin propagation across all three
   tables (closed retroactively on leads via M4LDP / commit
   `dccbf45`, built in from the start on tours and applications);
   the additive `tenants.source_application_id` column inheriting
   the existing tenants policies.
3. The modified Phase 3 surface in §12.2
   (`create_lease_with_tenants` RPC widening from
   `is_org_manager()` to `can_write_tenants()`) is **re-certified
   under the widened authority cohort**. The widening is a
   deliberate trade per `PHASE_4_PLAN.md` §0.5 decision 3; the RPC
   remains SECURITY DEFINER; the authentication requirement
   (`auth.uid()` not null) is unchanged; the cross-org tenant pin
   in the body is unchanged; the pre-existing `/leases` create
   surface (`leases/actions.ts`) keeps its narrower `isManager()`
   action-layer gate.
4. The nine known limitations in §12.6 are acknowledged as known
   scope-bounded gaps, not Gate 1 blockers. The orphan-tenant
   trade-off in `convertApplicationToLease` (item 1) is the most
   notable; recovery is manual delete + retry and future hardening
   is a single-RPC atomic wrapper.
5. The RLS test-plan delta in §12.7 is acknowledged: Suite 13
   (`rls_phase4_leasing.sql`) is authored and passing 31/31 on
   first run — covering all three Phase 4 entity tables, all eight
   §8.1 cross-org FK pin rejections, the RLS-does-not-enforce-
   status-transitions verification (A10), the RPC widening
   end-to-end (X1-X3), and the `source_application_id` column FK
   (X4). Phase 4 RLS coverage is closed. Cumulative coverage now
   181 / 13 suites.
6. Phase 4 added **no novel security patterns** and **no new gates**.
   Gate 1 was extended (three new tables, 12 new policies, one
   Phase 3 RPC modification); Gates 2-4 were untouched. No new
   SECURITY DEFINER functions, no new admin-client callsites, no
   new external user identities, no new helpers, no new triggers
   beyond three `set_updated_at` attachments.

| Reviewer | Date | Outcome |
|---|---|---|
| Kris Kelley | 2026-05-24 | Certified — Gate 1 re-certification approved |
