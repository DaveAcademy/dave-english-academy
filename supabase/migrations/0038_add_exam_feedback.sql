-- Phase 3 (grading UX + feedback): adds an optional teacher feedback field
-- to exam_scores, mirroring homework_status.feedback (0009).
--
-- Nullable text column, no default. No admin/teacher policy changes
-- needed - exam_scores_admin_all / exam_scores_teacher_all (0005) are
-- already `for all using(is_admin()/is_teacher())` with no column
-- restriction, so both roles can already write feedback the moment the
-- column exists. exam_scores_self_read (0028, is_own_student(student_id))
-- is already row-scoped to the student's own row, so a student can never
-- read another student's feedback - no read-policy change needed either.
--
-- The two *student write* policies (exam_scores_student_submit/
-- update_own) DO need tightening: as originally written they only assert
-- `score is null`, with no restriction on which columns a student may
-- set on their own row. Once `feedback` exists, that gap would let a
-- student set their own feedback via a direct REST call (the app itself
-- never does this - MyExams.jsx only ever sends answer_file_url/
-- answer_file_name/submitted_at - but RLS should not rely on client
-- behavior). homework_status_student_submit/update_own (0009) already
-- closes the identical gap for homework by requiring `feedback is null`
-- in their WITH CHECK; this migration applies the exact same fix here.
-- The USING clause on update_own (which row a student may touch at all)
-- is intentionally left as `score is null` only - unchanged - since that
-- governs eligibility to update the row, not what the update may set.
--
-- Nothing else changes: exams table/storage policies, Phase 1's
-- attachments_read/insert/update and can_read_exam_file/
-- can_write_exam_answer are untouched.

alter table public.exam_scores add column if not exists feedback text;

drop policy if exists exam_scores_student_submit on public.exam_scores;
create policy exam_scores_student_submit on public.exam_scores for insert
  with check (
    is_own_student(student_id)
    and score is null
    and feedback is null
  );

drop policy if exists exam_scores_student_update_own on public.exam_scores;
create policy exam_scores_student_update_own on public.exam_scores for update
  using (
    is_own_student(student_id)
    and score is null
  )
  with check (
    is_own_student(student_id)
    and score is null
    and feedback is null
  );
