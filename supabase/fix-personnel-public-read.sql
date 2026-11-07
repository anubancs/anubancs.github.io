-- Fix public personnel directory RLS.
-- Anonymous visitors may read published rows only. Permission checks remain
-- restricted to authenticated users, avoiding private.has_permission() calls
-- from the anon role.
drop policy if exists "published personnel readable by everyone" on public.personnel;
drop policy if exists "published personnel readable publicly" on public.personnel;
drop policy if exists "published and permitted personnel readable by authenticated" on public.personnel;

create policy "published personnel readable publicly"
on public.personnel for select to anon
using (is_published = true);

create policy "published and permitted personnel readable by authenticated"
on public.personnel for select to authenticated
using (
  is_published = true
  or (select private.has_permission('personnel'::text, 'view'::text))
);
