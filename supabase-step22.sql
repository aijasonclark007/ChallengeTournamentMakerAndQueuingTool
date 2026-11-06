-- Step 22: a published schedule link survives deleting or re-creating its tournament.
-- Before: deleting the saved tournament also deleted its public link (ON DELETE CASCADE), so the link showed "not found".
-- After:  the link is only removed by "Stop sharing" (or by you deleting the row). Deleting the tournament just detaches it.
-- Run once in the Supabase SQL editor. Safe to run more than once.
--
-- To undo (not normally needed):
--   delete from public.published_schedules where draw_id is null;
--   alter table public.published_schedules alter column draw_id set not null;
--   (then re-add the foreign key with ON DELETE CASCADE)

do $$
declare c text;
begin
  -- find the foreign key from published_schedules.draw_id to draw_tournaments, whatever it is named
  select con.conname into c
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
   where con.conrelid = 'public.published_schedules'::regclass
     and con.contype = 'f' and att.attname = 'draw_id'
   limit 1;
  if c is not null then execute format('alter table public.published_schedules drop constraint %I', c); end if;
end $$;

alter table public.published_schedules alter column draw_id drop not null;

alter table public.published_schedules
  add constraint published_schedules_draw_id_fkey
  foreign key (draw_id) references public.draw_tournaments (id) on delete set null;

-- check: should list one row with delete_rule = SET NULL
select rc.constraint_name, rc.delete_rule
  from information_schema.referential_constraints rc
 where rc.constraint_name = 'published_schedules_draw_id_fkey';
