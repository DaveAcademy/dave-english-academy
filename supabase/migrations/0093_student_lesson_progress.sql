-- Lesson Hub V2: per-student lesson completion + PDF progress.
--
-- The academy's lessons are shared teaching instances (a `lessons` row per
-- curriculum lesson), but "did this student work through lesson N" is
-- individual data, so it gets its own per-student table rather than a
-- column on `lessons`. Rows are keyed (student_id, lesson_id) - one row
-- per student per lesson. `status` drives the Not Started / In Progress /
-- Completed states in the portal; `last_page` lets the PDF viewer resume
-- where the student left off.
--
-- Unlock model (additive on top of the existing teacher-pace gate in
-- can_read_lesson_pdf): the teacher's per-level current_lesson_number
-- stays the floor (whole-class coverage - the storage RLS boundary that
-- was already live). On top of it, completing a lesson unlocks the next
-- one for that student, one lesson at a time. Lesson 1 is always
-- unlocked. Administrators/teachers override locks the same way they
-- already do - by setting current_lesson_number (up to 100 unlocks
-- everything) or by editing a student's completion rows.
--
-- This replaces can_read_lesson_pdf() (first defined in 0032/0033, last
-- updated directly in the live DB). The new body is strictly more
-- permissive in one direction only - it adds a completion-gated branch
-- scoped to the requesting student's own completed rows. The existing
-- level-match and teacher-pace checks are unchanged.

create table if not exists public.student_lesson_progress (
  student_id bigint not null references public.students (id) on delete cascade,
  lesson_id bigint not null references public.lessons (id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  last_page integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

create index if not exists student_lesson_progress_lesson_id_idx on public.student_lesson_progress (lesson_id);
create index if not exists student_lesson_progress_student_status_idx on public.student_lesson_progress (student_id, status);

alter table public.student_lesson_progress enable row level security;

-- Admin/teacher manage any student's progress (the admin override).
drop policy if exists student_lesson_progress_admin_all on public.student_lesson_progress;
create policy student_lesson_progress_admin_all on public.student_lesson_progress for all
  using (is_admin()) with check (is_admin());

drop policy if exists student_lesson_progress_teacher_all on public.student_lesson_progress;
create policy student_lesson_progress_teacher_all on public.student_lesson_progress for all
  using (is_teacher()) with check (is_teacher());

-- A student may only ever touch their own rows - same is_own_student()
-- self-scope used by student_vocabulary_favorites (0048).
drop policy if exists student_lesson_progress_self_select on public.student_lesson_progress;
create policy student_lesson_progress_self_select on public.student_lesson_progress for select
  using (public.is_own_student(student_id));

drop policy if exists student_lesson_progress_self_insert on public.student_lesson_progress;
create policy student_lesson_progress_self_insert on public.student_lesson_progress for insert
  with check (public.is_own_student(student_id));

drop policy if exists student_lesson_progress_self_update on public.student_lesson_progress;
create policy student_lesson_progress_self_update on public.student_lesson_progress for update
  using (public.is_own_student(student_id))
  with check (public.is_own_student(student_id));

drop policy if exists student_lesson_progress_self_delete on public.student_lesson_progress;
create policy student_lesson_progress_self_delete on public.student_lesson_progress for delete
  using (public.is_own_student(student_id));

grant select, insert, update, delete on public.student_lesson_progress to authenticated;

-- ---------- can_read_lesson_pdf: add completion-based unlock ----------
--
-- A student may read a lesson's PDF when any of these hold (legacy lessons
-- with no curriculum link stay level-gated only, as before):
--   * the lesson has no curriculum link (level check only), or
--   * it is curriculum lesson 1 (always unlocked), or
--   * its number is within the teacher's per-level pace, or
--   * the student has completed the immediately previous curriculum lesson.
create or replace function public.can_read_lesson_pdf(p_lesson_id bigint)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.lessons l
    join public.students s on s.profile_id = auth.uid()
    left join public.curriculum_lessons cl on cl.id = l.curriculum_lesson_id
    left join public.curriculum_progress cp on cp.level = s.level
    where l.id = p_lesson_id
      and (l.level is null or l.level = s.level)
      and (
        cl.lesson_number is null
        or cl.lesson_number <= 1
        or cl.lesson_number <= coalesce(cp.current_lesson_number, 0)
        or exists (
          select 1
          from public.student_lesson_progress slp
          join public.lessons prev on prev.id = slp.lesson_id
          join public.curriculum_lessons pcl on pcl.id = prev.curriculum_lesson_id
          where slp.student_id = s.id
            and slp.status = 'completed'
            and pcl.lesson_number = cl.lesson_number - 1
        )
      )
  );
$$;

revoke execute on function public.can_read_lesson_pdf(bigint) from public;
grant execute on function public.can_read_lesson_pdf(bigint) to authenticated;
