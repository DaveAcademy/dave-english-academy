-- Stage 2 of teacher authorization remediation: scope teacher access to
-- homework_status and homework_submission_files by the student's current
-- level via teacher_group_assignments, mirroring 0131 (exam_scores) and the
-- existing point_transactions pattern. Admin and student policies untouched.
-- homework definitions themselves (the `homework` table) are out of scope
-- for this migration.

drop policy if exists homework_status_teacher_all on homework_status;

create policy homework_status_teacher_all on homework_status
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = homework_status.student_id
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
    where s.id = homework_status.student_id
  )
);

drop policy if exists homework_submission_files_teacher_all on homework_submission_files;

create policy homework_submission_files_teacher_all on homework_submission_files
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = homework_submission_files.student_id
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
    where s.id = homework_submission_files.student_id
  )
);
