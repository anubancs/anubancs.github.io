-- Fix public news read RLS.
-- Anonymous visitors can read published news only. Permission checks remain
-- restricted to authenticated users to avoid calling private.has_permission()
-- from the anon role.
drop policy if exists "published news readable by everyone" on public.news;
drop policy if exists "published news readable publicly" on public.news;
drop policy if exists "published and permitted news readable by authenticated" on public.news;

create policy "published news readable publicly"
on public.news for select to anon
using (status = 'published' and published_at <= now());

create policy "published and permitted news readable by authenticated"
on public.news for select to authenticated
using (
  (status = 'published' and published_at <= now())
  or (select private.has_permission('news'::text, 'view'::text))
);
