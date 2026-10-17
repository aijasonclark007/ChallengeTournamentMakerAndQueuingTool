-- =====================================================================
-- Challenge - Tournament Management : Supabase setup, step 6  (Live scoring for umpires)
-- Umpires score on their phones from a per-court link; finished scores flow into the schedule.
-- Run in: SQL Editor > New query > paste > Run.  (Run steps 1-5 first.)
-- Safe to run more than once.
-- =====================================================================

-- 1) The published schedule also keeps the match list and a secret key that is part of the umpire links
alter table public.published_schedules add column if not exists matches jsonb not null default '[]'::jsonb;
alter table public.published_schedules add column if not exists umpire_key text not null default substr(md5(gen_random_uuid()::text), 1, 16);

-- 2) Live scores, one row per match
create table if not exists public.live_scores (
  slug       text not null references public.published_schedules (slug) on delete cascade,
  match_id   text not null check (char_length(match_id) <= 80),
  s1         integer not null default 0 check (s1 between 0 and 99),
  s2         integer not null default 0 check (s2 between 0 and 99),
  status     text not null default 'live' check (status in ('live', 'done')),
  updated_at timestamptz not null default now(),
  primary key (slug, match_id)
);
alter table public.live_scores enable row level security;   -- no direct access; everything goes through the functions below

-- 3) Publish now also stores the match list (replaces the step 5 version)
drop function if exists public.publish_schedule(uuid, text, text);
create or replace function public.publish_schedule(p_draw uuid, p_name text, p_html text, p_matches jsonb default '[]'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare s text;
begin
  if (select auth.uid()) is null then raise exception 'Please sign in first.'; end if;
  if not exists (select 1 from public.draw_tournaments where id = p_draw and user_id = (select auth.uid())) then
    raise exception 'Save this tournament to your account first.';
  end if;
  if jsonb_typeof(p_matches) <> 'array' or length(p_matches::text) > 1500000 then raise exception 'Match list is invalid or too large.'; end if;
  insert into public.published_schedules (draw_id, owner, name, html, matches)
  values (p_draw, (select auth.uid()), left(coalesce(nullif(trim(p_name), ''), 'Tournament'), 200), p_html, p_matches)
  on conflict (draw_id) do update set name = excluded.name, html = excluded.html, matches = excluded.matches, updated_at = now()
  returning slug into s;
  return s;
end;
$$;
revoke all on function public.publish_schedule(uuid, text, text, jsonb) from public, anon;
grant execute on function public.publish_schedule(uuid, text, text, jsonb) to authenticated;

-- 4) What an umpire's phone loads: the match list plus current scores (needs the secret key from their link)
create or replace function public.umpire_get(p_slug text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.published_schedules;
begin
  select * into r from public.published_schedules where slug = p_slug and umpire_key = p_key;
  if not found then raise exception 'This umpire link is not valid. Ask the organizer for a new one.'; end if;
  return jsonb_build_object(
    'name', r.name,
    'matches', r.matches,
    'scores', coalesce((select jsonb_agg(jsonb_build_object('id', l.match_id, 's1', l.s1, 's2', l.s2, 'status', l.status)) from public.live_scores l where l.slug = p_slug), '[]'::jsonb));
end;
$$;
grant execute on function public.umpire_get(text, text) to anon, authenticated;

-- 5) Umpire enters or updates a score. status 'done' = Finish match (final).
create or replace function public.umpire_score(p_slug text, p_key text, p_match text, p_s1 integer, p_s2 integer, p_status text)
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
  insert into public.live_scores (slug, match_id, s1, s2, status) values (p_slug, p_match, p_s1, p_s2, p_status)
  on conflict (slug, match_id) do update set s1 = excluded.s1, s2 = excluded.s2, status = excluded.status, updated_at = now();
end;
$$;
grant execute on function public.umpire_score(text, text, text, integer, integer, text) to anon, authenticated;

-- 6) Public: live and final scores for the shareable schedule (no key needed)
create or replace function public.get_live_scores(p_slug text)
returns table (match_id text, s1 integer, s2 integer, status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.match_id, l.s1, l.s2, l.status, l.updated_at from public.live_scores l where l.slug = p_slug;
$$;
grant execute on function public.get_live_scores(text) to anon, authenticated;

-- 7) The organizer can clear live scores for their own schedule (used by "Clear all scores")
create or replace function public.clear_live_scores(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and owner = (select auth.uid())) then
    raise exception 'Not allowed.';
  end if;
  delete from public.live_scores where slug = p_slug;
end;
$$;
revoke all on function public.clear_live_scores(text) from public, anon;
grant execute on function public.clear_live_scores(text) to authenticated;
