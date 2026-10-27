-- Step 17: show who is serving and who is receiving on the public page.
-- Run in the Supabase SQL editor. It is safe to run again (if you ran an older copy, run this one now).
-- The umpire phone sends the server's and receiver's names with each live score.

alter table public.live_scores add column if not exists server text;
alter table public.live_scores add column if not exists receiver text;

-- the score entry function now takes an optional server name (cleared when the match finishes)
drop function if exists public.umpire_score(text, text, text, integer, integer, text);
drop function if exists public.umpire_score(text, text, text, integer, integer, text, text);
create or replace function public.umpire_score(p_slug text, p_key text, p_match text, p_s1 integer, p_s2 integer, p_status text, p_server text default null, p_receiver text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then
    raise exception 'This umpire link is not valid.';
  end if;
  if p_status not in ('live', 'done') then raise exception 'Bad status.'; end if;
  if p_s1 is null or p_s2 is null or p_s1 < 0 or p_s2 < 0 or p_s1 > 99 or p_s2 > 99 then raise exception 'Bad score.'; end if;
  if p_status = 'done' and p_s1 = p_s2 then raise exception 'A game cannot end in a tie.'; end if;
  if exists (select 1 from public.live_scores where slug = p_slug and match_id = p_match and status = 'done') then
    raise exception 'This match is already finished. The organizer can edit it.';
  end if;
  insert into public.live_scores (slug, match_id, s1, s2, status, server, receiver)
  values (p_slug, p_match, p_s1, p_s2, p_status, case when p_status = 'live' then left(p_server, 80) end, case when p_status = 'live' then left(p_receiver, 80) end)
  on conflict (slug, match_id) do update set s1 = excluded.s1, s2 = excluded.s2, status = excluded.status, server = excluded.server, receiver = excluded.receiver, updated_at = now();
end;
$$;
grant execute on function public.umpire_score(text, text, text, integer, integer, text, text, text) to anon, authenticated;

-- the public page reads the server back with the scores
drop function if exists public.get_live_scores(text);
create or replace function public.get_live_scores(p_slug text)
returns table (match_id text, s1 integer, s2 integer, status text, updated_at timestamptz, server text, receiver text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.match_id, l.s1, l.s2, l.status, l.updated_at, l.server, l.receiver from public.live_scores l where l.slug = p_slug;
$$;
grant execute on function public.get_live_scores(text) to anon, authenticated;
