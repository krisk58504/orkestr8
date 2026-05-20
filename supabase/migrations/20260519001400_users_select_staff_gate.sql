-- ===========================================================================
-- 20260519001400_users_select_staff_gate.sql
--
-- Closes SECURITY_REVIEW.md §7: the Phase 1 users_select policy's
-- organization_id-branch had no role gate, so any authenticated user
-- holding a non-null users.organization_id could read every users row
-- in that organization — staff full_names, emails, phones.
--
-- That was tolerable while only staff held an organization_id, but a
-- non-staff portal user (TENANT today; future tenant/owner portals)
-- with org_id set would inherit the read. The Phase 2 vendor portal
-- ships now; later phases will widen the population of non-staff
-- authenticated org members.
--
-- Fix: add `AND is_org_staff()` to the org_id branch. Self-read and
-- super-admin branches are unchanged — every user must always be able
-- to read their OWN users row (the SessionContext / handle_new_user
-- onboarding flow depends on it), and platform super-admins keep their
-- cross-org reach.
--
-- Verified by supabase/tests/users_select_staff_gate.sql.
-- ===========================================================================

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    -- self-read: every authenticated user can read their own row.
    id = auth.uid()
    -- org members may read EACH OTHER only if they hold a staff role.
    or (
      organization_id = public.current_user_org_id()
      and public.is_org_staff()
    )
    -- platform admins keep cross-org reach.
    or public.is_super_admin()
  );
