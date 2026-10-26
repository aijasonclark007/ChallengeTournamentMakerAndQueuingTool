-- =====================================================================
-- Challenge - Match Day : Supabase setup, step 12  (choose when an extra match is played)
-- Adds an order position to extra matches so Match Control can put one "next" on its court instead of last.
-- Run in: SQL Editor > New query > paste > Run.  Safe to run more than once. (Run step 11 first.)
-- =====================================================================

alter table public.match_overrides add column if not exists slot numeric not null default 900;

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
           case when o.mid is not null then m.v || jsonb_build_object('court', o.court, 'from', m.v->>'court', 'moved', true) else m.v end
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

drop function if exists public.set_extra_slot(text, text, text, numeric);
create or replace function public.set_extra_slot(p_slug text, p_key text, p_mid text, p_slot numeric, p_time text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.published_schedules where slug = p_slug and umpire_key = p_key) then raise exception 'This link is not valid.'; end if;
  update public.match_overrides
     set slot = least(greatest(coalesce(p_slot, 900), -100), 900),
         time_label = case when p_time is null or trim(p_time) = '' then time_label else left(trim(p_time), 40) end
   where slug = p_slug and mid = p_mid and extra;
end;
$$;
grant execute on function public.set_extra_slot(text, text, text, numeric, text) to anon, authenticated;
