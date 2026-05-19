-- ===========================================================================
-- 20260518000200_core_tenancy.sql  —  organizations, users, user_roles, settings
-- Multi-tenant core. organization_id is the isolation key for the whole app.
-- ===========================================================================

create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  slug          text not null unique,
  status        public.organization_status not null default 'trial',
  -- SPEC Gate 2: AI defaults OFF for every new organization.
  ai_mode       public.ai_mode not null default 'disabled',
  -- SPEC Gate 3: outbound email defaults to test/sandbox for every new org.
  email_mode    public.email_mode not null default 'test',
  logo_url      text,
  primary_color text,
  billing_email text,
  phone         text,
  website       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Application profile mirror of auth.users. id === auth.users.id.
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email           text not null,
  full_name       text,
  phone           text,
  title           text,
  avatar_url      text,
  is_active       boolean not null default true,
  -- Platform-level flag. Locked by trigger: never settable via the app.
  is_super_admin  boolean not null default false,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists users_organization_id_idx on public.users(organization_id);
create index if not exists users_email_idx on public.users(lower(email));

-- A user may hold multiple roles within their organization.
create table if not exists public.user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            public.user_role not null,
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id, role)
);
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists user_roles_organization_id_idx on public.user_roles(organization_id);

-- Org/module scoped key-value settings (general, ai, email, etc.).
create table if not exists public.settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module          text not null default 'general',
  key             text not null,
  value           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, module, key)
);
create index if not exists settings_organization_id_idx on public.settings(organization_id);
