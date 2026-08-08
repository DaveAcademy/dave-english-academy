-- Level A1: a new student group, equivalent to A/B/C.
--
-- Every table that stores a level already has `check (level in ('A','B','C'))`
-- (students, lessons, exams, homework, chat, teacher_group_assignments,
-- point_transactions, recognition_awards). A1 must be allowed on all of them,
-- so this migration finds every single-column `level` CHECK that matches the
-- old three-level list and re-creates it with A1 included - preserving each
-- constraint's original name so the migration is idempotent.
--
-- It also seeds the per-level pace/cap row that lesson access is built on
-- (curriculum_progress.current_lesson_number + max_available_lesson, see 0093
-- and 0095). The lesson unlock rule (lessonLogic.js lessonCapFor, mirrored by
-- can_read_lesson_pdf) then applies to A1 automatically - no code change:
--   A  -> 1-20     A1 -> 1-30     B -> 1-40     C -> 1-50
-- A1's class coverage starts at 30 so lessons 21-30 are immediately open.

do $$
declare
  r record;
begin
  for r in
    select rn.nspname as sch, c.relname as tbl, con.conname as nm
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace rn on rn.oid = c.relnamespace
    join pg_attribute att on att.attrelid = c.oid and att.attnum = con.conkey[1]
    where con.contype = 'c'
      and cardinality(con.conkey) = 1
      and att.attname = 'level'
      and pg_get_constraintdef(con.oid) like '%''A''%''B''%''C''%'
  loop
    execute format('alter table %I.%I drop constraint %I', r.sch, r.tbl, r.nm);
    execute format('alter table %I.%I add constraint %I check (level in (''A'',''A1'',''B'',''C''))', r.sch, r.tbl, r.nm);
  end loop;
end $$;

insert into public.curriculum_progress (level, current_lesson_number, max_available_lesson, updated_at)
values ('A1', 30, 30, now())
on conflict (level) do nothing;