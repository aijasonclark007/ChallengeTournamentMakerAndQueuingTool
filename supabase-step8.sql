-- Step 8: only the site owner can create tournaments.
-- Run this once in the Supabase SQL Editor. It is a "restrictive" policy, so it is applied on top of
-- whatever insert rules already exist: an insert must pass BOTH. Everyone else keeps reading and
-- registering as before; only creating a new tournament is limited to this email.

drop policy if exists "only the owner creates tournaments" on public.tournaments;
create policy "only the owner creates tournaments"
  on public.tournaments
  as restrictive
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'aijasonclark@gmail.com');

-- To open creation up again later, run:
--   drop policy "only the owner creates tournaments" on public.tournaments;
