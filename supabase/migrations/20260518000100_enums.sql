-- ===========================================================================
-- 20260518000100_enums.sql  —  Phase 1 enumerated types
-- PMS-Build (dev). Idempotent: guarded against duplicate_object.
-- ===========================================================================

do $$ begin
  create type public.user_role as enum (
    'SUPER_ADMIN','OWNER','REGIONAL_MANAGER','PROPERTY_MANAGER','LEASING_AGENT',
    'MAINTENANCE_MANAGER','MAINTENANCE_TECH','VENDOR_ADMIN','VENDOR_TECH',
    'TENANT','INVESTOR','ACCOUNTING'
  );
exception when duplicate_object then null; end $$;

-- SPEC Gate 2 — AI/automation safety modes. Org default is 'disabled'.
do $$ begin
  create type public.ai_mode as enum (
    'disabled','draft_only','suggest_only','auto_with_approval','fully_automated'
  );
exception when duplicate_object then null; end $$;

-- SPEC Gate 3 — outbound email mode. Org default is 'test'.
do $$ begin
  create type public.email_mode as enum ('test','production');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.organization_status as enum ('trial','active','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.property_type as enum (
    'apartment','condo','townhome','single_family','duplex','mixed_use','commercial','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.building_status as enum ('active','inactive','under_construction');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.unit_status as enum (
    'vacant','occupied','notice','make_ready','off_market','model','down'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_status as enum (
    'prospect','applicant','current','notice','past','evicted'
  );
exception when duplicate_object then null; end $$;
