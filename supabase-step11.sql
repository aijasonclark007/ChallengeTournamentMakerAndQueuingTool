-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 11  (court changes on match day)
-- Lets Match Control move a match to another court, add a walk-up / extra match to a court, and take it back.
-- Umpire phones, court TVs and the shareable schedule all follow the change.
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- =====================================================================

create table if not exists public.match_overrides (
  slug       text not null,
  mid        text not null,
  court      text not null,
  extra      boolean not null default false,       -- true = a match added on the day (not in the published schedule)
  t1         text not null default '',
  t2         text not null default '',
  sport      text not null default 'badminton',
  time_label text not null default '',
  created_at timestamptz not null default now(),
  primary key (slug, mid)
);
alter table public.match_overrides enable row level security;     -- no policies on purpose: only the functions below can touch it

-- 1) What umpire phones, Match Control and the TVs load: the published matches with moves applied, plus any extra matches
create or replace function public.umpire_get(p_slug text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.published_schedules; ms jsonb;
begin
  select * into r from public.published_schedules where slug = p_slug and umpire_key = p_key;
  if not found then raise exception 'This umpire link is not valid. Ask the organizer for a new one.'; end if;
  select coalesce(jsonb_agg(
           case when o.mid is not null then m.v || jsonb_build_object('court', o.court, 'from', m.v->>'court', 'moved', true) else m.v end
           order by m.n), '[]'::jsonb)
    into ms
    from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) with ordinality as m(v, n)
    left join public.match_overrides o on o.slug = p_slug and o.mid = m.v->>'mid' and not o.extra;
  ms := ms || coalesce((select jsonb_agg(jsonb_build_object('mid', o.mid, 'court', o.court, 'slot', 900, 'time', o.time_label, 'bracket', 'Extra match',
                                                             't1', o.t1, 't2', o.t2, 'sport', o.sport, 'extra', true) order by o.created_at)
                        from public.match_overrides o where o.slug = p_slug and o.extra), '[]'::jsonb);
  return jsonb_build_object(
    'name', r.name,
    'matches', ms,
    'scores', coalesce((select jsonb_agg(jsonb_build_object('id', l.match_id, 's1', l.s1, 's2', l.s2, 'status', l.status)) from public.live_scores l where l.slug = p_slug), '[]'::jsonb));
end;
$$;
grant execute on function public.umpire_get(text, text) to anon, authenticated;

-- 2) Move a match to another court. An empty court puts it back where the schedule had it.
create or replace function public.move_match(p_slug text, p_key text, p_mid text, p_court text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if p_court is null or trim(p_court) = '' then
    delete from public.match_overrides where slug = p_slug and mid = p_mid and not extra;
  elsif exists (select 1 from public.match_overrides where slug = p_slug and mid = p_mid and extra) then
    update public.match_overrides set court = left(trim(p_court), 60) where slug = p_slug and mid = p_mid;
  else
    insert into public.match_overrides (slug, mid, court) values (p_slug, p_mid, left(trim(p_court), 60))
    on conflict (slug, mid) do update set court = excluded.court;
  end if;
end;
$$;
grant execute on function public.move_match(text, text, text, text) to anon, authenticated;

-- 3) Add a walk-up / extra match to a court
create or replace function public.add_extra_match(p_slug text, p_key text, p_court text, p_t1 text, p_t2 text, p_sport text, p_time text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare id text;
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if coalesce(trim(p_t1), '') = '' or coalesce(trim(p_t2), '') = '' or coalesce(trim(p_court), '') = '' then raise exception 'Add both teams and a court.'; end if;
  id := 'x:' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into public.match_overrides (slug, mid, court, extra, t1, t2, sport, time_label)
  values (p_slug, id, left(trim(p_court), 60), true, left(trim(p_t1), 80), left(trim(p_t2), 80), case when p_sport = 'pickleball' then 'pickleball' else 'badminton' end, left(coalesce(p_time, ''), 40));
  return id;
end;
$$;
grant execute on function public.add_extra_match(text, text, text, text, text, text, text) to anon, authenticated;

-- 4) Remove an extra match again (also clears its score)
create or replace function public.remove_extra_match(p_slug text, p_key text, p_mid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  delete from public.match_overrides where slug = p_slug and mid = p_mid and extra;
  delete from public.live_scores where slug = p_slug and match_id = p_mid;
end;
$$;
grant execute on function public.remove_extra_match(text, text, text) to anon, authenticated;

-- 5) Public: which scheduled matches moved court (the shareable schedule shows the new court)
create or replace function public.get_court_moves(p_slug text)
returns table (mid text, court text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.mid, o.court from public.match_overrides o where o.slug = p_slug and not o.extra;
$$;
grant execute on function public.get_court_moves(text) to anon, authenticated;
