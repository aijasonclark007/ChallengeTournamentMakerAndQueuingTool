-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 23  (play a selected match now, on a court you choose)
-- Match Control gets "Play a match here now": pick any waiting match, it goes to the front of the chosen court's queue.
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once. (Run steps 11 and 12 first.)
-- =====================================================================

-- 1) umpire_get: a moved scheduled match can now carry its own queue position (slot < 900)
create or replace function public.umpire_get(p_slug text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.published_schedules; ms jsonb;
begin
  select * into r from public.published_schedules where slug = p_slug and umpire_key = p_key;
  if not found then raise exception 'This umpire link is not valid. Ask the organizer for a new one.'; end if;
  select coalesce(jsonb_agg(
           case when o.mid is not null
                then m.v || jsonb_build_object('court', o.court, 'from', m.v->>'court', 'moved', true)
                         || (case when o.slot < 900 then jsonb_build_object('slot', o.slot) else '{}'::jsonb end)
                else m.v end
           order by m.n), '[]'::jsonb)
    into ms
    from jsonb_array_elements(coalesce(r.matches, '[]'::jsonb)) with ordinality as m(v, n)
    left join public.match_overrides o on o.slug = p_slug and o.mid = m.v->>'mid' and not o.extra;
  ms := ms || coalesce((select jsonb_agg(jsonb_build_object('mid', o.mid, 'court', o.court, 'slot', o.slot, 'time', o.time_label, 'bracket', 'Extra match',
                                                             't1', o.t1, 't2', o.t2, 'sport', o.sport, 'extra', true) order by o.created_at)
                        from public.match_overrides o where o.slug = p_slug and o.extra), '[]'::jsonb);
  return jsonb_build_object(
    'name', r.name,
    'matches', ms,
    'scores', coalesce((select jsonb_agg(jsonb_build_object('id', l.match_id, 's1', l.s1, 's2', l.s2, 'status', l.status)) from public.live_scores l where l.slug = p_slug), '[]'::jsonb));
end;
$$;
grant execute on function public.umpire_get(text, text) to anon, authenticated;

-- 2) play_match: put a match on a court at a queue position (works for scheduled and extra matches)
create or replace function public.play_match(p_slug text, p_key text, p_mid text, p_court text, p_slot numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  if coalesce(trim(p_court), '') = '' then raise exception 'Pick a court.'; end if;
  if exists (select 1 from public.match_overrides where slug = p_slug and mid = p_mid and extra) then
    update public.match_overrides set court = left(trim(p_court), 60), slot = least(greatest(coalesce(p_slot, 900), -100), 900)
     where slug = p_slug and mid = p_mid;
  else
    insert into public.match_overrides (slug, mid, court, slot)
    values (p_slug, p_mid, left(trim(p_court), 60), least(greatest(coalesce(p_slot, 900), -100), 899))
    on conflict (slug, mid) do update set court = excluded.court, slot = excluded.slot;
  end if;
end;
$$;
grant execute on function public.play_match(text, text, text, text, numeric) to anon, authenticated;
