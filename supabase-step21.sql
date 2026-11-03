-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 21  (sponsor names shown on the court TVs)
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- The sponsor names typed in Match Control > Speaker are copied here so every court TV can show them.
-- =====================================================================
create table if not exists public.sponsor_lists (
  slug       text primary key,
  names      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.sponsor_lists enable row level security;       -- no policies on purpose: only the functions below can touch it

create or replace function public.set_sponsors(p_slug text, p_key text, p_names jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if jsonb_typeof(p_names) <> 'array' or jsonb_array_length(p_names) > 40 then raise exception 'Bad sponsor list.'; end if;
  insert into public.sponsor_lists (slug, names) values (p_slug, p_names)
  on conflict (slug) do update set names = excluded.names, updated_at = now();
end;
$$;
grant execute on function public.set_sponsors(text, text, jsonb) to anon, authenticated;

create or replace function public.get_sponsors(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.names from public.sponsor_lists s where s.slug = p_slug), '[]'::jsonb);
$$;
grant execute on function public.get_sponsors(text) to anon, authenticated;
