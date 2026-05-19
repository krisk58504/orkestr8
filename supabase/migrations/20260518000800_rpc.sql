-- ===========================================================================
-- 20260518000800_rpc.sql  —  application RPCs
--
-- create_organization() is the onboarding entry point. It runs SECURITY
-- DEFINER because a brand-new user has no organization yet and therefore no
-- RLS path to INSERT one. It assigns the caller as OWNER. organization_id is
-- set here for the first (and only, from the app's side) time — the
-- protect_user_columns trigger permits the null -> value transition.
-- ===========================================================================

create or replace function public.create_organization(
  p_name text,
  p_slug text default null
)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_org       public.organizations;
  v_base_slug text;
  v_slug      text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'organization name is required';
  end if;
  if exists (select 1 from public.users where id = v_uid and organization_id is not null) then
    raise exception 'user already belongs to an organization';
  end if;

  v_base_slug := lower(regexp_replace(
    coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := nullif(trim(both '-' from v_base_slug), '');
  v_base_slug := coalesce(v_base_slug, 'org');
  v_slug := v_base_slug;
  if exists (select 1 from public.organizations where slug = v_slug) then
    v_slug := v_base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), v_slug)
  returning * into v_org;

  update public.users
    set organization_id = v_org.id, updated_at = now()
    where id = v_uid;

  insert into public.user_roles (user_id, organization_id, role)
  values (v_uid, v_org.id, 'OWNER')
  on conflict (user_id, organization_id, role) do nothing;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_org.id, v_uid, 'organization.created', 'organization', v_org.id,
          jsonb_build_object('name', v_org.name, 'slug', v_org.slug));

  return v_org;
end; $$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
