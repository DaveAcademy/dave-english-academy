-- 20260919000000_homework_level_scoped_and_consistency.sql
-- Production hardening for Homework remaining issues #1-3:
-- 1) Teacher homework assignment writes not level-scoped
-- 2) Homework row reads across levels (homework_read_all too broad)
-- 3) Status/score/feedback consistency edge case

-- =========================
-- 1) Homework row RLS — level-scoped reads + writes
-- =========================

-- Remove overly permissive policies
drop policy if exists homework_read_all on public.homework;
drop policy if exists homework_teacher_all on public.homework;
drop policy if exists homework_admin_all on public.homework;

-- Admin retains full access
create policy homework_admin_all on public.homework
for all using (is_admin()) with check (is_admin());

-- Teacher: can SELECT homework where level IS NULL (global) or level in assigned levels
-- and can INSERT/UPDATE/DELETE only those levels. Split into 4 policies for clarity.

create policy homework_teacher_select on public.homework
for select using (
  is_teacher() and (
    level is null
    or exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = homework.level
    )
  )
);

create policy homework_teacher_insert on public.homework
for insert with check (
  is_teacher() and (
    level is null
    or exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = homework.level
    )
  )
);

create policy homework_teacher_update on public.homework
for update using (
  is_teacher() and (
    level is null
    or exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = homework.level
    )
  )
) with check (
  is_teacher() and (
    level is null
    or exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = homework.level
    )
  )
);

create policy homework_teacher_delete on public.homework
for delete using (
  is_teacher() and (
    level is null
    or exists (
      select 1 from public.teacher_group_assignments tga
      where tga.teacher_id = auth.uid() and tga.level = homework.level
    )
  )
);

-- Student: can SELECT homework where level IS NULL or level = own level
-- Uses students.profile_id = auth.uid() to resolve level; unlinked users get 0 rows.
create policy homework_student_select on public.homework
for select using (
  exists (
    select 1 from public.students s
    where s.profile_id = auth.uid()
      and (homework.level is null or homework.level = s.level)
  )
);

-- =========================
-- 2) homework_status score/feedback consistency
-- =========================

-- Existing RLS already prevents students from setting score/feedback (WITH CHECK score IS NULL AND feedback IS NULL)
-- Add database-level CHECK to catch any path (including teacher direct SQL) that creates inconsistent combos.
-- Valid states:
--   Assigned  -> score IS NULL (feedback must be null or graded-only, enforced separately)
--   Submitted -> score IS NULL
--   Graded    -> score IS NOT NULL
-- Feedback may only exist when Graded (prevents Assigned/Submitted with feedback)

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'homework_status_score_status_check' and conrelid = 'public.homework_status'::regclass
  ) then
    alter table public.homework_status
    add constraint homework_status_score_status_check
    check (
      (status = 'Assigned' and score is null)
      or (status = 'Submitted' and score is null)
      or (status = 'Graded' and score is not null)
    );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'homework_status_feedback_check' and conrelid = 'public.homework_status'::regclass
  ) then
    alter table public.homework_status
    add constraint homework_status_feedback_check
    check (
      feedback is null or status = 'Graded'
    );
  end if;
end $$;

-- Ensure existing data complies before constraint (should already comply; fix any stray rows idempotently)
-- Any homework_status that violates new checks would have been created via permissive early policies.
-- Coerce invalid combos to valid: if status Graded but score null -> set Assigned; if feedback set but not Graded -> nullify.
update public.homework_status set status = 'Assigned' where status = 'Graded' and score is null;
update public.homework_status set feedback = null where feedback is not null and status != 'Graded';
