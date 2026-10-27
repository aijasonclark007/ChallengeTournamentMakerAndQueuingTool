-- Step 19: TV screens, Match Control and umpire phones stop re-downloading the whole game list.
-- Run once in the Supabase SQL editor. Safe to run again. Requires steps 11-12 and 17 to have been run.
-- umpire_sync sends the game list only when it changed, and only the scores that changed since the last call.

create or replace function public.umpire_sync(p_slug text, p_key text, p_ver text default null, p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare d jsonb; v text; sc jsonb; n integer;
begin
  d := public.umpire_get(p_slug, p_key);                  -- also checks that the link is valid
  v := md5((d->'matches')::text);
  select coalesce(jsonb_agg(jsonb_build_object('id', l.match_id, 's1', l.s1, 's2', l.s2, 'status', l.status,
                                               't', floor(extract(epoch from l.updated_at) * 1000))), '[]'::jsonb)
    into sc from public.live_scores l where l.slug = p_slug and (p_since is null or l.updated_at >= p_since);
  select count(*) into n from public.live_scores where slug = p_slug;
  return jsonb_build_object('name', d->'name', 'ver', v,
                            'matches', case when p_ver is not null and p_ver = v then null else d->'matches' end,
                            'scores', sc, 'n', n);
end;
$$;
grant execute on function public.umpire_sync(text, text, text, timestamptz) to anon, authenticated;
