-- ===========================================================================
-- 20260531000100_phase4_lease_conversion.sql — Phase 4 slice 9d: lease conversion
--
-- TWO CHANGES, both load-bearing for the slice 9d conversion flow:
--
--   1. public.tenants gets an additive column source_application_id (uuid,
--      nullable, REFERENCES public.applications(id) ON DELETE SET NULL) plus
--      an index. Provenance only — set by convertApplicationToLease, never
--      written elsewhere. Existing tenant rows keep source_application_id
--      NULL forever. See PHASE_4_PLAN.md §2d.
--
--   2. public.create_lease_with_tenants RPC body is MODIFIED to widen the
--      authority check from is_org_manager() to can_write_tenants(). The
--      signature, the return type, the SECURITY DEFINER semantics, the body
--      structure (lease INSERT + tenants UPDATE), the REVOKE/GRANT block —
--      all stay byte-for-byte identical to migration 20260521000200
--      (Phase 3). Only the boolean inside the `if not (...)` guard changes.
--      See PHASE_4_PLAN.md §0.5 decision 3 and §7 risk 7 for rationale.
--
-- ===========================================================================
-- !! PHASE 3 SURFACE MODIFICATION — re-certification required !!
-- ===========================================================================
-- create_lease_with_tenants was created in Phase 3 (migration M3LR /
-- 20260521000200_phase3_create_lease_rpc.sql) and certified under SECURITY_
-- REVIEW.md §11.9 Gate 1 sign-off (commit 93a4842) with the narrower
-- is_org_manager() authority guard. This migration widens that guard to
-- can_write_tenants() (= management + LEASING_AGENT).
--
-- §12 Phase 4 sign-off MUST explicitly re-certify the RPC under the widened
-- authority cohort. The body is otherwise unchanged. The expected blast
-- radius is that a LEASING_AGENT can now call the RPC directly (which is
-- exactly what slice 9d's convertApplicationToLease relies on). The
-- pre-existing /leases create flow (leases/actions.ts) gates with isManager()
-- at the action layer BEFORE invoking the RPC, so widening the RPC's
-- internal check does NOT silently widen the /leases page surface.
--
-- Regression to re-verify after this migration applies:
--   * rls_phase3_leases_tenant_self.sql Suite 7 (7 assertions) — tests the
--     leases_write surface, not the RPC body, so should be unaffected. Run
--     it post-apply to confirm.
--
-- ===========================================================================
-- KNOWN LIMITATION — accepted for slice 9d baseline
-- ===========================================================================
-- The convertApplicationToLease server action that consumes this RPC is NOT
-- atomic across the (tenant INSERT, RPC call) boundary — they are two
-- sequential client calls. If the RPC fails after the tenant row is
-- inserted, the tenant exists with no lease (orphan). Recovery is manual:
-- LA deletes the orphan tenant, then retries the conversion. Future
-- hardening: wrap both inserts in a single SECURITY DEFINER RPC
-- create_tenant_and_lease_from_application() so they share one transaction.
-- Deferred — see §12 known-limitations.
-- ===========================================================================

-- ---- column: tenants.source_application_id (additive) --------------------
alter table public.tenants
  add column if not exists source_application_id uuid
    references public.applications(id) on delete set null;

create index if not exists tenants_source_application_id_idx
  on public.tenants(source_application_id);

-- ===========================================================================
-- create_lease_with_tenants — authority widened (the ONE change in the body)
-- ===========================================================================
create or replace function public.create_lease_with_tenants(
  p_organization_id uuid,
  p_unit_id         uuid,
  p_start_date      date,
  p_end_date        date,
  p_monthly_rent    numeric(10, 2),
  p_status          public.lease_status default 'upcoming',
  p_notes           text default null,
  p_tenant_ids      uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_lease_id uuid;
begin
  -- --- authorization: DEFINER bypasses RLS, so verify the caller here ------
  -- PHASE 4 SLICE 9D: authority widened from is_org_manager() to
  -- can_write_tenants(). All else byte-for-byte identical to M3LR.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not (
    (public.can_write_tenants() and public.current_user_org_id() = p_organization_id)
    or public.is_super_admin()
  ) then
    raise exception 'insufficient privileges to create a lease for this organization'
      using errcode = '42501';
  end if;

  -- --- insert the lease ----------------------------------------------------
  insert into public.leases (
    organization_id, unit_id, start_date, end_date, monthly_rent, status, notes
  )
  values (
    p_organization_id, p_unit_id, p_start_date, p_end_date, p_monthly_rent,
    p_status, p_notes
  )
  returning id into v_lease_id;

  -- --- assign tenants (org pin = belt-and-suspenders vs cross-org ids) ------
  if array_length(p_tenant_ids, 1) is not null then
    update public.tenants
       set lease_id = v_lease_id
     where id = any(p_tenant_ids)
       and organization_id = p_organization_id;
  end if;

  return v_lease_id;
end; $$;

-- Defensive re-apply of grants. CREATE OR REPLACE preserves existing grants,
-- but matching the M3LR pattern keeps the migration self-contained — anyone
-- restoring from this file alone gets the correct grant posture.
revoke all on function public.create_lease_with_tenants(
  uuid, uuid, date, date, numeric, public.lease_status, text, uuid[]
) from public, anon;
grant execute on function public.create_lease_with_tenants(
  uuid, uuid, date, date, numeric, public.lease_status, text, uuid[]
) to authenticated;
