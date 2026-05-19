-- ===========================================================================
-- 20260518000500_infrastructure.sql
-- Cross-cutting tables: audit_logs, notifications, ai_logs, automation_logs.
-- ai_logs / automation_logs exist from Phase 1 so every later AI/automation
-- action has a destination to log to (SPEC Gate 2 — "log everything").
-- ===========================================================================

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,
  action          text not null,            -- e.g. 'property.created'
  entity_type     text not null,            -- e.g. 'property'
  entity_id       uuid,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_logs_organization_id_idx on public.audit_logs(organization_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  title           text not null,
  body            text,
  type            text not null default 'info',   -- info|success|warning|error
  link            text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, is_read);

-- SPEC Gate 2: every AI action is logged here. mode/status record the safety
-- posture under which it ran. No AI executes in Phase 1 — table is staged.
create table if not exists public.ai_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references public.users(id) on delete set null,
  module          text not null,
  action_type     text not null,
  ai_mode         public.ai_mode not null,
  status          text not null default 'logged',  -- logged|drafted|suggested|executed|blocked
  prompt          jsonb,
  response        jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ai_logs_organization_id_idx on public.ai_logs(organization_id);
create index if not exists ai_logs_created_at_idx on public.ai_logs(created_at desc);

-- SPEC Gate 2: every automation action is logged here.
create table if not exists public.automation_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id   uuid,
  module          text not null,
  action_type     text not null,
  status          text not null default 'logged',  -- logged|blocked|executed|skipped
  result          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists automation_logs_organization_id_idx on public.automation_logs(organization_id);
create index if not exists automation_logs_created_at_idx on public.automation_logs(created_at desc);
