-- Step 18: send only the scores that changed (cuts the public page's data use a lot).
-- Run once in the Supabase SQL editor. Safe to run again. Requires step 17 to have been run first.

create or replace function public.get_live_scores_since(p_slug text, p_since timestamptz default null)
returns table (match_id text, s1 integer, s2 integer, status text, updated_at timestamptz, server text, receiver text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.match_id, l.s1, l.s2, l.status, l.updated_at, l.server, l.receiver
    from public.live_scores l
   where l.slug = p_slug and (p_since is null or l.updated_at >= p_since);
$$;
grant execute on function public.get_live_scores_since(text, timestamptz) to anon, authenticated;
