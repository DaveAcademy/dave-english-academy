-- Stage 5 of teacher authorization remediation: scope teacher access to
-- attendance and lesson_attendance by the student's current level via
-- teacher_group_assignments, mirroring 0131/0132/0133/0134. Admin and
-- student (self-read) policies are untouched.

drop policy if exists attendance_teacher_mark on attendance;

create policy attendance_teacher_mark on attendance
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = attendance.student_id
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
    where s.id = attendance.student_id
  )
);

drop policy if exists lesson_attendance_teacher_all on lesson_attendance;

create policy lesson_attendance_teacher_all on lesson_attendance
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = lesson_attendance.student_id
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
    where s.id = lesson_attendance.student_id
  )
);
