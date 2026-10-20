-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 9  (automatic online backups)
-- Keeps automatic snapshots of each Draw & Schedule tournament so you can restore an earlier
-- version (or a deleted tournament) with one tap, without copying any text.
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once.
-- =====================================================================

create table if not exists public.draw_backups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draw_id    uuid,                                   -- no foreign key on purpose: backups survive when a tournament is deleted
  name       text not null default '',
  info       text not null default '',
  state      jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists draw_backups_user_idx on public.draw_backups (user_id, created_at desc);
alter table public.draw_backups enable row level security;

drop policy if exists "see my backups" on public.draw_backups;
create policy "see my backups" on public.draw_backups for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "add my backups" on public.draw_backups;
create policy "add my backups" on public.draw_backups for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "remove my backups" on public.draw_backups;
create policy "remove my backups" on public.draw_backups for delete to authenticated
  using (user_id = (select auth.uid()));
