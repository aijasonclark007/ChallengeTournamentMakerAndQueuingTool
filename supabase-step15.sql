-- Step 15: let the organizer cut off every shared Match Control / umpire link at once.
-- Run once in the Supabase SQL editor. It makes a new secret key for the published schedule.
-- Only the person who published the schedule can run it.

create or replace function public.reset_umpire_key(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare k text := substr(md5(gen_random_uuid()::text), 1, 16);
begin
  update public.published_schedules set umpire_key = k
   where slug = p_slug and owner = (select auth.uid());
  if not found then raise exception 'You can only reset links for your own schedule.'; end if;
  return k;
end $$;

revoke all on function public.reset_umpire_key(text) from public, anon;
grant execute on function public.reset_umpire_key(text) to authenticated;
