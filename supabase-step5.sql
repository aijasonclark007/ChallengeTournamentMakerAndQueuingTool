-- =====================================================================
-- Challenge - Tournament Management : Supabase setup, step 5  (Schedule links)
-- Publish a Draw & Schedule game schedule as a link anyone can open.
-- Run in: SQL Editor > New query > paste > Run.  (Run steps 1-4 first.)
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.published_schedules (
  slug       text primary key default substr(md5(gen_random_uuid()::text), 1, 10),
  draw_id    uuid not null unique references public.draw_tournaments (id) on delete cascade,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  html       text not null check (char_length(html) < 3000000),
  updated_at timestamptz not null default now()
);
alter table public.published_schedules enable row level security;

-- owners can see and remove their own published links (publishing itself goes through the function below)
drop policy if exists "see my published schedules" on public.published_schedules;
create policy "see my published schedules" on public.published_schedules for select to authenticated
  using (owner = (select auth.uid()));
drop policy if exists "remove my published schedules" on public.published_schedules;
create policy "remove my published schedules" on public.published_schedules for delete to authenticated
  using (owner = (select auth.uid()));

-- Publish (or update) the link for one saved draw. The link stays the same every time.
create or replace function public.publish_schedule(p_draw uuid, p_name text, p_html text)
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
  insert into public.published_schedules (draw_id, owner, name, html)
  values (p_draw, (select auth.uid()), left(coalesce(nullif(trim(p_name), ''), 'Tournament'), 200), p_html)
  on conflict (draw_id) do update set name = excluded.name, html = excluded.html, updated_at = now()
  returning slug into s;
  return s;
end;
$$;
revoke all on function public.publish_schedule(uuid, text, text) from public, anon;
grant execute on function public.publish_schedule(uuid, text, text) to authenticated;

-- Anyone with the link can read the page (no login)
create or replace function public.get_public_schedule(p_slug text)
returns table (name text, html text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.html, s.updated_at from public.published_schedules s where s.slug = p_slug;
$$;
grant execute on function public.get_public_schedule(text) to anon, authenticated;
