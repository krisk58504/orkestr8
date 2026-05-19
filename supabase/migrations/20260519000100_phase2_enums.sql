-- ===========================================================================
-- 20260519000100_phase2_enums.sql  —  Phase 2 enumerated types
-- Maintenance, work orders, and vendor management.
-- ===========================================================================

do $$ begin
  create type public.maintenance_status as enum (
    'submitted','triaged','scheduled','in_progress','on_hold','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.maintenance_priority as enum (
    'low','medium','high','emergency'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.maintenance_category as enum (
    'plumbing','electrical','hvac','appliance','structural','pest',
    'landscaping','locks','general','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_status as enum (
    'open','assigned','accepted','in_progress','on_hold','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.work_order_assignee as enum (
    'unassigned','internal','vendor'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_status as enum (
    'pending','active','inactive','suspended'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_document_type as enum (
    'insurance','license','w9','contract','certification','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_invoice_status as enum (
    'draft','submitted','approved','rejected','paid'
  );
exception when duplicate_object then null; end $$;
