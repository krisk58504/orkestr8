-- ===========================================================================
-- 20260519000600_email_log.sql  —  outbound email attempt log (SPEC Gate 3)
--
-- Every outbound email attempt is recorded here, including attempts BLOCKED
-- by test-mode allowlisting. The actual send path is intentionally not yet
-- wired (see EMAIL_SAFETY.md) — this table backs the email structure.
-- ===========================================================================

create table if not exists public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations(id) on delete cascade,
  to_address          text not null,
  subject             text not null,
  template            text not null,
  -- queued | sent | blocked | failed | suppressed
  status              text not null default 'queued',
  mode                public.email_mode not null,
  reason              text,
  related_entity_type text,
  related_entity_id   uuid,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists email_log_organization_id_idx on public.email_log(organization_id);
create index if not exists email_log_created_at_idx on public.email_log(created_at desc);
