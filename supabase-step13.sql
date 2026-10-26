-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 13  (Match Control: edit scores, announcements, activity log)
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- =====================================================================

-- 1) Fix a wrong score on a finished (or live) match from Match Control
create or replace function public.edit_score(p_slug text, p_key text, p_match text, p_s1 integer, p_s2 integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if p_s1 is null or p_s2 is null or p_s1 < 0 or p_s2 < 0 or p_s1 > 99 or p_s2 > 99 then raise exception 'Bad score.'; end if;
  if p_s1 = p_s2 then raise exception 'A game cannot end in a tie.'; end if;
  insert into public.live_scores (slug, match_id, s1, s2, status) values (p_slug, p_match, p_s1, p_s2, 'done')
  on conflict (slug, match_id) do update set s1 = excluded.s1, s2 = excluded.s2, status = 'done', updated_at = now();
end;
$$;
grant execute on function public.edit_score(text, text, text, integer, integer) to anon, authenticated;

-- 2) One announcement at a time, shown on court TVs, umpire phones and the shareable schedule
create table if not exists public.announcements (
  slug       text primary key,
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table public.announcements enable row level security;       -- no policies on purpose: only the functions below can touch it

create or replace function public.set_announcement(p_slug text, p_key text, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if coalesce(trim(p_text), '') = '' then
    delete from public.announcements where slug = p_slug;
  else
    insert into public.announcements (slug, body) values (p_slug, left(trim(p_text), 200))
    on conflict (slug) do update set body = excluded.body, updated_at = now();
  end if;
end;
$$;
grant execute on function public.set_announcement(text, text, text) to anon, authenticated;

create or replace function public.get_announcement(p_slug text)
returns table (body text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.body, a.updated_at from public.announcements a where a.slug = p_slug;
$$;
grant execute on function public.get_announcement(text) to anon, authenticated;

-- 3) Activity log of what the organizer did on match day (moves, defaults, score fixes...)
create table if not exists public.match_log (
  id   bigserial primary key,
  slug text not null,
  at   timestamptz not null default now(),
  body text not null
);
create index if not exists match_log_slug_idx on public.match_log (slug, id desc);
alter table public.match_log enable row level security;

create or replace function public.add_log(p_slug text, p_key text, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  insert into public.match_log (slug, body) values (p_slug, left(coalesce(p_text, ''), 300));
end;
$$;
grant execute on function public.add_log(text, text, text) to anon, authenticated;

create or replace function public.get_log(p_slug text, p_key text)
returns table (at timestamptz, body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  return query select l.at, l.body from public.match_log l where l.slug = p_slug order by l.id desc limit 80;
end;
$$;
grant execute on function public.get_log(text, text) to anon, authenticated;
