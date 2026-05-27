-- ===========================================================================
-- 20260611000000_phase7_slice2_notifications_wiring.sql — Phase 7 slice 2.
--
-- Extends the Phase 1 `notifications` staging table with the columns the
-- slice 2 producer needs to write structured rows + a CHECK constraint
-- enforcing the slice 2 kind vocabulary at the DB layer (per §G.2 of
-- docs/PHASE_7_SLICE_2_AUDIT.md).
--
-- Three coupled deltas:
--
--   1. `kind text` — semantic event identifier (e.g., 'maintenance.created').
--      Separate from existing `type` (visual: info|success|warning|error).
--      Default 'info' so the column can be NOT NULL without a backfill
--      (notifications table is empty in production as of slice 2 authoring).
--
--   2. `metadata jsonb` — structured payload identifying the source entity
--      (e.g., { maintenance_request_id, property_id }). Shape is per-kind;
--      the producer writes it; the UI consumes it for click-through.
--      Default '{}'::jsonb.
--
--   3. CHECK constraint listing the 6 valid kinds for slice 2:
--        - 'info'                    (legacy default; pre-slice-2 rows)
--        - 'maintenance.created'
--        - 'work_order.assigned'
--        - 'message.received'
--        - 'application.submitted'
--        - 'automation_run.failed'
--      Future slices that add producers extend this list via a follow-up
--      ALTER TABLE migration.
--
-- Plus one new index supporting the dropdown's "most recent N" query:
--   notifications_user_created_idx on (user_id, created_at desc)
--
-- The existing index notifications_user_idx (user_id, is_read) stays —
-- unread-count queries use it.
--
-- Discipline references:
--   * docs/PHASE_7_SLICE_2_AUDIT.md — full slice audit (§1-§11 + §G).
--   * §G.2 — CHECK constraint resolution (overrides audit's §2.2 lean of
--     "free text" in favor of DB-layer enforcement).
--   * §G.4 — N-rows-per-recipient confirmed; no `notification_reads` join
--     table introduced.
--
-- RLS posture: UNCHANGED. The Phase 1 per-user policies on `notifications`
-- (migration 20260518000700_rls.sql:309-321) cover the new columns. No
-- new policies or RESTRICTIVE clauses needed in slice 2 (per audit §6.1).
-- ===========================================================================

-- ---- 1 + 2. New columns -------------------------------------------------
alter table public.notifications
  add column if not exists kind text not null default 'info',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ---- 3. CHECK constraint on kind ----------------------------------------
-- Drop-and-recreate so the migration is idempotent.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'info',
    'maintenance.created',
    'work_order.assigned',
    'message.received',
    'application.submitted',
    'automation_run.failed'
  )
);

-- ---- 4. New index -------------------------------------------------------
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
