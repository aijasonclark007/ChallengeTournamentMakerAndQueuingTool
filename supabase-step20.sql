-- Step 20: the public page asks for everything in ONE request (changed scores, announcement, moved courts).
-- Run once in the Supabase SQL editor. Safe to run again. Requires steps 11, 13 and 17 to have been run.

create or replace function public.get_public_live(p_slug text, p_since timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'scores', coalesce((select jsonb_agg(jsonb_build_object('match_id', l.match_id, 's1', l.s1, 's2', l.s2, 'status', l.status,
                                                          'updated_at', l.updated_at, 'server', l.server, 'receiver', l.receiver))
                          from public.live_scores l where l.slug = p_slug and (p_since is null or l.updated_at >= p_since)), '[]'::jsonb),
    'n', (select count(*) from public.live_scores l where l.slug = p_slug),
    'ann', (select jsonb_build_object('body', a.body, 'updated_at', a.updated_at) from public.announcements a where a.slug = p_slug),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('mid', o.mid, 'court', o.court))
                         from public.match_overrides o where o.slug = p_slug and not o.extra), '[]'::jsonb));
$$;
grant execute on function public.get_public_live(text, timestamptz) to anon, authenticated;
