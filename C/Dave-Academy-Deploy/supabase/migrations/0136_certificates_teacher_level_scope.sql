-- Stage 6 (final) of teacher authorization remediation: scope teacher
-- access to certificates by the student's current level via
-- teacher_group_assignments, mirroring 0131-0135. Admin and student
-- (self-read) policies untouched. No triggers exist on this table.

drop policy if exists certificates_teacher_all on certificates;

create policy certificates_teacher_all on certificates
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = certificates.student_id
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
    where s.id = certificates.student_id
  )
);
