-- Allow each signed-in staff member to upload images for their own personnel profile.
-- The Google Apps Script gateway still verifies the Supabase access token.
-- A personnel-linked account gets this permission only for the personnel media category;
-- all other categories continue to require the existing owner/permission grants.

create or replace function public.can_upload_media(p_module text)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    private.is_owner()
    or private.has_permission(p_module, 'create')
    or private.has_permission(p_module, 'update')
    or (
      p_module = 'personnel'
      and auth.uid() is not null
      and exists (
        select 1
        from public.personnel p
        where p.auth_user_id = (select auth.uid())
      )
    ),
    false
  );
$function$;

revoke all on function public.can_upload_media(text) from public, anon;
grant execute on function public.can_upload_media(text) to authenticated;
