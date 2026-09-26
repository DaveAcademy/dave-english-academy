-- Stage 4 of teacher authorization remediation: scope teacher access to
-- student_lesson_progress by the student's current level via
-- teacher_group_assignments, mirroring 0131/0132/0133.
--
-- This migration touches ONLY the teacher ALL policy. It does not touch
-- student_lesson_progress_self_insert / _self_update, which 0126 already
-- hardened for lesson-pacing enforcement, nor the admin/self-select/
-- self-delete policies.

drop policy if exists student_lesson_progress_teacher_all on student_lesson_progress;

create policy student_lesson_progress_teacher_all on student_lesson_progress
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = student_lesson_progress.student_id
  )
)
with check (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = student_lesson_progress.student_id
  )
);
