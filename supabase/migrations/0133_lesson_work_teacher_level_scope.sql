-- Stage 3 of teacher authorization remediation: scope teacher access to
-- lesson_work_submissions and lesson_work_submission_files by the student's
-- current level via teacher_group_assignments, mirroring 0131/0132.
-- Admin and student policies untouched.

drop policy if exists lesson_work_submissions_teacher_all on lesson_work_submissions;

create policy lesson_work_submissions_teacher_all on lesson_work_submissions
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = lesson_work_submissions.student_id
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
    where s.id = lesson_work_submissions.student_id
  )
);

drop policy if exists lesson_work_submission_files_teacher_all on lesson_work_submission_files;

create policy lesson_work_submission_files_teacher_all on lesson_work_submission_files
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = lesson_work_submission_files.student_id
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
    where s.id = lesson_work_submission_files.student_id
  )
);
