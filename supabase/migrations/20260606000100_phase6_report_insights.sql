-- ===========================================================================
-- 20260606000100_phase6_report_insights.sql — Phase 6 slice 11c.
--
-- AI-generated report insights persistence. Mirrors the persistence UX of
-- slice 11b (property summaries) but uses a NEW table rather than columns
-- on the host entity because reports are computed-on-read (no single row
-- to attach to).
--
-- Posture per slice 11c audit decision D1 + D1b sub-decision:
--   * D1: new report_insights table (over D2 session-only or D3 generic
--     ai_outputs)
--   * D1b: NO uniqueness constraint on (org_id, report_type, scope_filter)
--     — regeneration writes a new row; ORDER BY generated_at DESC LIMIT 1
--     fetches "latest". Old rows accumulate as implicit history.
--
-- RLS per J3 sub-decision (generator-restricted INVESTOR access):
--   * SELECT: staff org-self sees all; INVESTOR sees only own generations
--   * INSERT: same scope as SELECT; the server action additionally
--     verifies the caller can see all propertyIds in scope_filter
--     (RLS doesn't enforce the subset check — defense at the action layer
--     mirrors the maintenance-triage precedent of "RLS allows; server
--     action narrows further when needed")
--   * UPDATE/DELETE: no policies — table is immutable from the client.
--     A future cleanup mechanism can prune via service-role admin client.
-- ===========================================================================

create table public.report_insights (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_type     text not null check (report_type in
    ('rent_roll','occupancy','maintenance','leasing_funnel','vendor_performance')),
  scope_filter    jsonb not null default '{}'::jsonb,
  insight         jsonb not null,
  model_name      text,
  cost_cents      int,
  tokens_input    int,
  tokens_output   int,
  generated_by    uuid references public.users(id) on delete set null,
  generated_at    timestamptz not null default now()
);

create index report_insights_org_type_generated_idx on public.report_insights
  (organization_id, report_type, generated_at desc);

alter table public.report_insights enable row level security;

-- SELECT: staff sees all org rows; INVESTOR sees only own generations.
drop policy if exists report_insights_select on public.report_insights;
create policy report_insights_select on public.report_insights
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and (
      public.is_org_staff()
      or generated_by = auth.uid()
    )
  );

-- INSERT: same scope as SELECT; generated_by must be the calling user.
-- Server action enforces that scope_filter.propertyIds (if any) is a
-- subset of the caller's visible property set.
drop policy if exists report_insights_insert on public.report_insights;
create policy report_insights_insert on public.report_insights
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and generated_by = auth.uid()
    and (
      public.is_org_staff()
      or exists (
        select 1 from public.property_owners po
        where po.user_id = auth.uid()
          and po.organization_id = report_insights.organization_id
      )
    )
  );

-- No UPDATE/DELETE policies → immutable from client.
