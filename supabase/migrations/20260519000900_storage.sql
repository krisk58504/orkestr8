-- ===========================================================================
-- 20260519000900_storage.sql  —  private Storage bucket for work-order photos
--
-- Photo access is server-mediated: server actions check work-order access via
-- RLS, then use the service-role client to create signed upload/download URLs.
-- The bucket is therefore private with NO storage.objects policies for the
-- authenticated role (default-deny); only the service role reaches storage.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-order-photos',
  'work-order-photos',
  false,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
