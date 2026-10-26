-- Step 16: a tiny "has the schedule changed?" check for the public page.
-- Run once in the Supabase SQL editor. Spectators then download the full page only when it was republished.

create or replace function public.get_schedule_version(p_slug text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select s.updated_at from public.published_schedules s where s.slug = p_slug;
$$;
grant execute on function public.get_schedule_version(text) to anon, authenticated;
