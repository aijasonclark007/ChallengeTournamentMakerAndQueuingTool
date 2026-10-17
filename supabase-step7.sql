-- =====================================================================
-- Challenge - Tournament Management : Supabase setup, step 7  (Umpire can cancel a live match)
-- Lets an umpire take a match off LIVE (for example after tapping the wrong match).
-- Run in: SQL Editor > New query > paste > Run.  (Run steps 1-6 first.)
-- Safe to run more than once.
-- =====================================================================

create or replace function public.umpire_reset(p_slug text, p_key text, p_match text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then
    raise exception 'This umpire link is not valid.';
  end if;
  -- only a live match can be cancelled here; a finished match is changed by the organizer
  delete from public.live_scores where slug = p_slug and match_id = p_match and status = 'live';
end;
$$;
grant execute on function public.umpire_reset(text, text, text) to anon, authenticated;

-- One-time cleanup: take every match that is LIVE at 0 - 0 off LIVE (accidental opens)
delete from public.live_scores where status = 'live' and s1 = 0 and s2 = 0;
