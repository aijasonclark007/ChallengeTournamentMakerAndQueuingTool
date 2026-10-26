-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 14  (reason for a default / retirement / withdrawal)
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- =====================================================================

create table if not exists public.match_notes (
  slug       text not null,
  match_id   text not null,
  kind       text not null,          -- default | retired | withdrawn
  reason     text not null default '',
  updated_at timestamptz not null default now(),
  primary key (slug, match_id)
);
alter table public.match_notes enable row level security;

create or replace function public.set_match_note(p_slug text, p_key text, p_match text, p_kind text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if p_kind not in ('default', 'retired', 'withdrawn') then raise exception 'Bad kind.'; end if;
  insert into public.match_notes (slug, match_id, kind, reason) values (p_slug, left(p_match, 80), p_kind, left(coalesce(p_reason, ''), 60))
  on conflict (slug, match_id) do update set kind = excluded.kind, reason = excluded.reason, updated_at = now();
end;
$$;
grant execute on function public.set_match_note(text, text, text, text, text) to anon, authenticated;

create or replace function public.get_match_notes(p_slug text, p_key text)
returns table (match_id text, kind text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  return query select n.match_id, n.kind, n.reason from public.match_notes n where n.slug = p_slug;
end;
$$;
grant execute on function public.get_match_notes(text, text) to anon, authenticated;
