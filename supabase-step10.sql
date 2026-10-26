-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 10  (short TV codes)
-- Gives each court TV a short link such as  challengematchday.vercel.app/t/K7M2Q
-- instead of the long link, so it is easy to type with a TV remote.
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- The long TV links keep working as a backup.
-- =====================================================================

create table if not exists public.tv_codes (
  code       text primary key,
  slug       text not null,
  court      text not null,
  layout     text not null default 'panels',
  created_at timestamptz not null default now(),
  unique (slug, court, layout)
);
alter table public.tv_codes enable row level security;     -- no policies on purpose: only the two functions below can touch it

-- Make (or fetch) the short code for one court. Needs the tournament's umpire key, so only the organizer's link can create codes.
create or replace function public.make_tv_code(p_slug text, p_key text, p_court text, p_layout text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  lay text := case when p_layout = 'rows' then 'rows' else 'panels' end;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- no 0/O/1/I, so nothing is confused on a TV screen
  c text; i int; tries int := 0;
begin
  perform 1 from public.published_schedules where slug = p_slug and umpire_key = p_key;
  if not found then raise exception 'This umpire link is not valid. Ask the organizer for a new one.'; end if;
  select code into c from public.tv_codes where slug = p_slug and court = p_court and layout = lay;
  if found then return c; end if;
  loop
    c := '';
    for i in 1..5 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    begin
      insert into public.tv_codes (code, slug, court, layout) values (c, p_slug, p_court, lay);
      return c;
    exception when unique_violation then
      select code into c from public.tv_codes where slug = p_slug and court = p_court and layout = lay;
      if found then return c; end if;
      tries := tries + 1; if tries > 20 then raise exception 'Could not make a code. Try again.'; end if;
    end;
  end loop;
end;
$$;
grant execute on function public.make_tv_code(text, text, text, text) to anon, authenticated;

-- What a TV loads when it opens the short link.
create or replace function public.get_tv_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('slug', t.slug, 'key', s.umpire_key, 'court', t.court, 'layout', t.layout)
  from public.tv_codes t join public.published_schedules s on s.slug = t.slug
  where t.code = upper(trim(p_code));
$$;
grant execute on function public.get_tv_code(text) to anon, authenticated;
