-- Move the SECURITY DEFINER media functions out of the exposed API schema.
-- public.* keeps thin SECURITY INVOKER wrappers; only these three private functions are executable by signed-in users.
alter function public.josy_media_reserve(text, text, bigint) set schema private;
alter function public.josy_media_confirm(uuid, int, int) set schema private;
alter function public.josy_media_usage() set schema private;
grant usage on schema private to authenticated;
revoke all on function private.josy_media_reserve(text, text, bigint) from public, anon;
revoke all on function private.josy_media_confirm(uuid, int, int) from public, anon;
revoke all on function private.josy_media_usage() from public, anon;
grant execute on function private.josy_media_reserve(text, text, bigint) to authenticated;
grant execute on function private.josy_media_confirm(uuid, int, int) to authenticated;
grant execute on function private.josy_media_usage() to authenticated;

create or replace function public.josy_media_reserve(p_file_name text, p_mime text, p_size bigint)
returns jsonb language sql security invoker set search_path = '' as $$ select private.josy_media_reserve(p_file_name, p_mime, p_size) $$;
create or replace function public.josy_media_confirm(p_id uuid, p_width int default null, p_height int default null)
returns jsonb language sql security invoker set search_path = '' as $$ select private.josy_media_confirm(p_id, p_width, p_height) $$;
create or replace function public.josy_media_usage()
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.josy_media_usage() $$;
revoke all on function public.josy_media_reserve(text, text, bigint) from public, anon;
revoke all on function public.josy_media_confirm(uuid, int, int) from public, anon;
revoke all on function public.josy_media_usage() from public, anon;
grant execute on function public.josy_media_reserve(text, text, bigint) to authenticated;
grant execute on function public.josy_media_confirm(uuid, int, int) to authenticated;
grant execute on function public.josy_media_usage() to authenticated;
