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
- Cumulative RLS test coverage: **113 assertions across 8 suites** (84 prior
  + 15 Suite 8 + 14 Suite 12), all passing as of 2026-05-23.

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
| 7 — leases tenant-self | `leases_select` tenant branch via `tenants.lease_id` | **deferred** — pattern mirrors `tenants_select` (Suite 1 #7) with the predicate substituted |
| 8 — accept_tenant_invite RPC | atomic 4-step transition; 4 classified error codes; SECURITY DEFINER + EXECUTE grant posture; exact `token_hash` matching | **authored 2026-05-23** — `supabase/tests/rls_phase3_accept_tenant_invite.sql`, 15/15 passing |
| 9 — tenant_invites lifecycle | `can_write_tenants` gate on both branches; mutual-exclusion CHECK | **deferred** — pattern mirrors `tenants_write` (Suite 2 R2/R3) with table name swapped |
| 10 — tenant-self units / properties + lease-mediated | direct (M3T) and lease-mediated (M3LU) tenant-self branches | **deferred** — direct branches mirror `tenants_select`; lease-mediated branches mirror `leases_select` (both already tested for their own table) |
| 11 — tenant-self maintenance | M3M select + insert; defense-in-depth on insert | **deferred** — INSERT defense-in-depth pattern mirrors §8.1 fixes (Suite 5 C3-C8) with predicate adjusted |
| 12 — messages immutability + sender_role | RLS no-UPDATE / no-DELETE; sender_role gating; sender_id forgery guard; defense-in-depth on tenant insert | **authored 2026-05-23** — `supabase/tests/rls_phase3_messages_immutable.sql`, 14/14 passing |

Suites 8 and 12 were authored inline with §11 because they cover the
**novel** patterns introduced in Phase 3 (SECURITY DEFINER with anonymous
grant; RLS-enforced immutability). Suites 7/9/10/11 cover structurally
identical patterns to already-tested ones and are deferred as listed.

**Required before Phase 4 ships any new portal RLS surface:** Suites
7/9/10/11 should be authored before adding any new tenant-self or
vendor-self branches to additional tables, so the test set keeps up
with the policy surface. They are NOT Gate 1 blockers for the current
posture.

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
5. The RLS test-plan delta in 11.6 is acknowledged: Suites 8 and 12 cover
   the novel Phase 3 patterns; Suites 7/9/10/11 are deferred work
   required before Phase 4 ships additional portal-user RLS surface,
   but do not block Gate 1 certification of the current policy posture.
6. The email-safety delta in 11.7 and EMAIL_SAFETY.md §7 are
   gate-tightening improvements, not gate relaxations.

| Reviewer | Date | Outcome |
|---|---|---|
| _pending_ | _pending_ | _pending_ |
