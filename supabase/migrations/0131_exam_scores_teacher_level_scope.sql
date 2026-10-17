-- Stage 1 of teacher authorization remediation: scope teacher access to
-- exam_scores by the student's current level via teacher_group_assignments,
-- mirroring the existing point_transactions pattern. Admin and student
-- policies are untouched.

drop policy if exists exam_scores_teacher_all on exam_scores;

create policy exam_scores_teacher_all on exam_scores
for all
using (
  is_teacher()
  and exists (
    select 1
    from students s
    join teacher_group_assignments tga
      on tga.level = s.level
     and tga.teacher_id = auth.uid()
    where s.id = exam_scores.student_id
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
    where s.id = exam_scores.student_id
  )
);
