-- ===========================================================================
-- 20260528000200_phase4_leads_cross_org_pin.sql — Phase 4 slice 9a follow-up:
-- close cross-org FK gaps on leads.
--
-- VULNERABILITY (closed by this migration):
-- The slice 9a leads_insert / leads_update policies (migration
-- 20260528000100) pinned the new row's own `organization_id` to
-- `current_user_org_id()` but did NOT verify that `desired_property_id`
-- and `assigned_to` (when non-null) reference rows in the SAME
-- organization. A manager in Org A could craft an insert with
-- `organization_id = A` while supplying `desired_property_id` pointing
-- at an Org B property, or `assigned_to` pointing at an Org B user.
-- The FK constraint accepts it (the parent row exists); the row-level
-- check accepts it (the row's own org matches the caller's); the
-- attacker now has a lead in Org A linked to Org B's resources.
--
-- This is the same vulnerability shape as Phase 2 §8.1, which closed
-- equivalent gaps on vendor writes (migration 20260519001100:
-- `organization_id = (SELECT v.organization_id FROM vendors v WHERE v.id
-- = vendor_invoices.vendor_id)` etc.). Slice 9a authoring missed the
-- analogous gap on leads cross-FK references — found and closed here
-- during slice 9b audit.
--
-- FIX: extend leads_insert and leads_update with EXISTS checks against
-- properties and users, both keyed on the target row's organization_id
-- matching the lead's organization_id. leads_select and leads_delete
-- are unchanged — they don't have the same write-time-trusted-input
-- surface; reads are already org-scoped, deletes don't add new cross-FK
-- linkages.
--
-- GATE 1 IMPLICATION: this migration tightens an already-shipped Gate 1
-- surface. §11 sign-off (signed 2026-05-23 by Kris Kelley as commit
-- 93a4842) certified Phase 1-3 RLS; slice 9a's leads policies were
-- shipped after that sign-off and not yet re-certified. The §12 Phase 4
-- sign-off must reference this migration as "found and closed during
-- slice 9b authoring" — a self-caught gap rather than a fresh
-- vulnerability requiring escalation.
--
-- NOT certified production-safe until documented human review (SPEC
-- Gate 1) — §12 sign-off pending.
-- ===========================================================================

-- ---- leads_insert (was: simple org_id + can_write_tenants pin) ------------
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and (
        desired_property_id is null
        or exists (
          select 1 from public.properties p
          where p.id = leads.desired_property_id
            and p.organization_id = leads.organization_id
        )
      )
      and (
        assigned_to is null
        or exists (
          select 1 from public.users u
          where u.id = leads.assigned_to
            and u.organization_id = leads.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

-- ---- leads_update (USING + WITH CHECK both get the FK pins) --------------
-- USING controls which rows the policy admits for update;
-- WITH CHECK controls the post-update row shape. The cross-org gap
-- exists on the post-update row (the attacker could swap desired_property_id
-- or assigned_to to a cross-org value on an existing row), so the
-- predicate must appear in WITH CHECK. We mirror it in USING for
-- defense-in-depth and symmetry — a manager who somehow ended up with a
-- lead row already containing cross-org FKs shouldn't be able to take
-- further action on it.
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and (
        desired_property_id is null
        or exists (
          select 1 from public.properties p
          where p.id = leads.desired_property_id
            and p.organization_id = leads.organization_id
        )
      )
      and (
        assigned_to is null
        or exists (
          select 1 from public.users u
          where u.id = leads.assigned_to
            and u.organization_id = leads.organization_id
        )
      )
    )
    or public.is_super_admin()
  )
  with check (
    (
      organization_id = public.current_user_org_id()
      and public.can_write_tenants()
      and (
        desired_property_id is null
        or exists (
          select 1 from public.properties p
          where p.id = leads.desired_property_id
            and p.organization_id = leads.organization_id
        )
      )
      and (
        assigned_to is null
        or exists (
          select 1 from public.users u
          where u.id = leads.assigned_to
            and u.organization_id = leads.organization_id
        )
      )
    )
    or public.is_super_admin()
  );

-- leads_select and leads_delete are intentionally NOT touched:
--   - leads_select: read-only, no input-trust surface.
--   - leads_delete: removes the row; no new cross-FK linkage created.
-- The original policies from 20260528000100 remain in force.
