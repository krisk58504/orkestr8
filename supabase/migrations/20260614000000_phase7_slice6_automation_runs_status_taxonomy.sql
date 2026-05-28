-- ===========================================================================
-- 20260614000000_phase7_slice6_automation_runs_status_taxonomy.sql
--
-- Phase 7 slice 6 — Slice 1 hardening (run-status taxonomy).
--
-- Extends the automation_runs.status CHECK domain from
--   ('running','ok','failed','skipped')
-- to
--   ('running','ok','failed','skipped','suppressed','blocked').
--
-- WHY: the two email handlers (vendor_doc_expiry, vendor_insurance_renewal)
-- collapse every non-delivered sendEmail() outcome to status='failed'
-- (slice 5 audit §F.2 #1). sendEmail() distinguishes 'suppressed' (dedup)
-- and 'blocked' (safety/allowlist/mode gate) from a genuine 'failed'
-- (provider error). Those benign non-deliveries currently surface as
-- false-alarm 'failed' runs AND fire false 'automation_run.failed'
-- OWNER notifications (runner.ts:135). This migration adds the two
-- distinct values so the handlers can record the true outcome.
--
-- MECHANISM: Postgres cannot extend a CHECK constraint in place, so this
-- is DROP CONSTRAINT + ADD CONSTRAINT. The ADD re-validates every
-- existing row; this is SAFE because the old 4-value domain is a strict
-- subset of the new 6-value domain (every pre-existing value remains
-- valid), so validation cannot fail. Walk-test Step 0 asserts both
-- (a) the new values insert and (b) pre-existing rows survive the ADD.
--
-- CONSTRAINT NAME (schema-inspection-first, audit §F.4): the dropped
-- constraint was created INLINE in 20260609000100
-- (status text not null check (...)), so Postgres auto-named it. The
-- real name was confirmed via pg_constraint probe (2026-05-28) to be
-- automation_runs_status_check (the expected auto-name; sole CHECK on
-- the table). The DROP below targets that confirmed name. The ADD pins
-- the same explicit name so future migrations have a deterministic handle.
--
-- NOT CHANGED: automations.last_run_status (free text, no CHECK — the new
-- 'degraded' value needs no migration); automation_logs.status (binary
-- 'blocked'/'executed', unchanged); email_log.status / EmailStatus.
--
-- RLS posture: unchanged. A CHECK domain change is a write-validation
-- artifact, not a row-access surface. No policy changes (audit §6).
-- ===========================================================================

alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add constraint automation_runs_status_check
  check (
    status in ('running', 'ok', 'failed', 'skipped', 'suppressed', 'blocked')
  );
