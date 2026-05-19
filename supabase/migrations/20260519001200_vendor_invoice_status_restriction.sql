-- ===========================================================================
-- 20260519001200_vendor_invoice_status_restriction.sql
--
-- SECURITY_REVIEW.md §8.2: a vendor user must not be able to RLS-write
-- vendor_invoices.status to 'approved', 'rejected', or 'paid' — those are
-- staff-only transitions. The vendor branch is constrained to
-- 'draft' / 'submitted'. Staff (`is_org_manager`) and `is_super_admin`
-- retain full control over status.
--
-- Chosen mechanism: RESTRICTIVE policies (one for INSERT, one for UPDATE)
-- rather than a BEFORE INSERT/UPDATE trigger. Rationale:
--
--   * Gate 1 declares RLS the authoritative enforcement layer; co-locating
--     this constraint with the rest of vendor_invoices' policies keeps the
--     full posture visible to pg_policies and to scripts/dump-policies.ts.
--   * A silent trigger clamp masks intent (vendor sets 'paid', sees
--     'submitted' stored — debugging surprise). A raising trigger is a
--     hidden enforcement object future reviewers must remember to inspect.
--   * RESTRICTIVE policies AND with permissive policies — the standard
--     Postgres pattern for "this branch can do X, but only if Y."
--
-- The RESTRICTIVE clauses say: either the caller is NOT a vendor user
-- (staff, super_admin — unaffected) OR the status is in the allowed set.
-- ===========================================================================

drop policy if exists vendor_invoices_vendor_status_insert on public.vendor_invoices;
create policy vendor_invoices_vendor_status_insert on public.vendor_invoices
  as restrictive
  for insert to authenticated
  with check (
    not public.is_vendor_user()
    or status in ('draft','submitted')
  );

drop policy if exists vendor_invoices_vendor_status_update on public.vendor_invoices;
create policy vendor_invoices_vendor_status_update on public.vendor_invoices
  as restrictive
  for update to authenticated
  using (true)
  with check (
    not public.is_vendor_user()
    or status in ('draft','submitted')
  );
