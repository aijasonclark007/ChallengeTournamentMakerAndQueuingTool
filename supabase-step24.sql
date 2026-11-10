-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 24  (results history across events)
-- Draw & Schedule gets a "Save to history" button; history.html lists past events and a player's record across them.
-- Private to the organizer who saved them. Run in: SQL Editor > New query > paste > Run. Safe to run more than once.
-- =====================================================================

create table if not exists public.event_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null default '',
  event_date date,
  data       jsonb not null,                         -- { standings: [...], games: [...], knockout: [...] }
  created_at timestamptz not null default now()
);
create index if not exists event_results_user_idx on public.event_results (user_id, event_date desc nulls last, created_at desc);
alter table public.event_results enable row level security;

drop policy if exists "see my event results" on public.event_results;
create policy "see my event results" on public.event_results for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "add my event results" on public.event_results;
create policy "add my event results" on public.event_results for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "remove my event results" on public.event_results;
create policy "remove my event results" on public.event_results for delete to authenticated
  using (user_id = (select auth.uid()));
