-- ===========================================================================
-- 20260612000000_phase7_slice4_rent_charges_parent_charge_id.sql
--
-- Phase 7 slice 4 — Late Fee Handler.
--
-- Adds a self-referencing FK from rent_charges to rent_charges so the
-- late-fee handler can link each generated 'fee'-type charge back to
-- the rent charge it was applied to. Also adds a partial index that
-- the detection anti-join (LEFT JOIN ... WHERE lf.id IS NULL) plans
-- against.
--
-- Two coupled deltas:
--
--   1. rent_charges.parent_charge_id uuid — self-FK to rent_charges(id).
--      Nullable by design — most rows have no parent (they ARE the
--      parent). Only 'fee'-type rows from the late-fee handler carry
--      a non-null parent_charge_id.
--
--   2. Partial index on (parent_charge_id) WHERE parent_charge_id IS
--      NOT NULL — skips every parent row (the vast majority) and
--      indexes only the fee rows that point at parents. Sized for the
--      detection anti-join plan.
--
-- ON DELETE SET NULL rationale (per docs/PHASE_7_SLICE_4_AUDIT.md §2.3):
--   - rent_charges has NO hard-delete path in application code today
--     (grep -rn "delete.*rent_charges" src/ returns zero).
--   - CASCADE would orphan-or-delete fee rows AND any payments
--     against them — wrong for a financial table.
--   - RESTRICT would block parent deletion structurally even when a
--     fee exists — more rigid than needed for a path no app code
--     exercises today.
--   - SET NULL is defensive for the rare manual-SQL or future-feature
--     hard-delete case: fee row survives (operationally important —
--     may have payments against it) but the back-pointer is null,
--     signaling "orphaned fee, parent gone."
--
-- RLS posture: unchanged. The new column is covered by existing
-- rent_charges per-row policies (Phase 5 slice 10a + slice 10e + the
-- Phase 6 slice 11a RESTRICTIVE no-AI-writes). No new policies
-- needed per audit §6.
-- ===========================================================================

alter table public.rent_charges
  add column if not exists parent_charge_id uuid
    references public.rent_charges(id) on delete set null;

create index if not exists rent_charges_parent_charge_id_idx
  on public.rent_charges (parent_charge_id)
  where parent_charge_id is not null;
