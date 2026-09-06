-- Extend teacher level-scoping (2026-08-14 remediation, 0131-0136) to
-- curriculum_progress. This table stores one row per level ('A'/'B'/'C',
-- level *is* the primary key), so scoping is a direct comparison against
-- teacher_group_assignments.level - no join through students is needed.
--
-- Only the UPDATE policy is touched: SELECT stays open (using (true)),
-- unchanged from 0093 - lesson pacing is read by students via
-- can_read_lesson_pdf() and isn't sensitive. Admin behavior is unchanged.
-- Real-world exposure at write time is zero (both current teachers are
-- assigned all levels), but the gap is architecturally real and this
-- mirrors the exact pattern already applied to exam_scores, homework,
-- lesson_work, student_lesson_progress, attendance, and certificates.

drop policy if exists curriculum_progress_update on public.curriculum_progress;
create policy curriculum_progress_update on public.curriculum_progress
for update
using (
  is_admin()
  or (
    is_teacher()
    and exists (
      select 1
      from teacher_group_assignments tga
      where tga.teacher_id = auth.uid()
        and tga.level = curriculum_progress.level
    )
  )
)
with check (
  is_admin()
  or (
    is_teacher()
    and exists (
      select 1
      from teacher_group_assignments tga
      where tga.teacher_id = auth.uid()
        and tga.level = curriculum_progress.level
    )
  )
);
