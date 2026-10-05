-- H1 (Learning Flow audit): homework_status_student_submit/_update_own
-- only checked is_own_active_student() + status/score/feedback state -
-- nothing required an actual homework_submission_files row to exist
-- before status='Submitted', even though award_homework_submission_points()
-- fires purely on status='Submitted' and awards 10 points regardless. The
-- app's own UI (MyHomework.jsx's handleUploadPending) already refuses to
-- submit with zero pending files, but that's client-side only - a direct
-- API call could set status='Submitted' with nothing uploaded and still
-- collect the points. 0 such rows exist in current data (verified during
-- the audit), so this closes the gap before it's ever used, not after.
--
-- Fix: both write policies now additionally require, ONLY when the row is
-- being set to 'Submitted' (the 'Assigned' branch is untouched - creating
-- the initial tracking row before any file exists must keep working), that
-- a homework_submission_files row for this exact (homework_id, student_id)
-- already exists. Files are uploaded via separate prior requests in the
-- app's own flow (handleUploadPending uploads files, then calls
-- submitMyHomeworkFiles -> markHomeworkSubmitted), so by the time the
-- status write happens the file row is already committed - the real
-- submission flow is unaffected.

alter policy homework_status_student_submit on public.homework_status
  with check (
    is_own_active_student(student_id)
    and status = any (array['Assigned', 'Submitted'])
    and score is null
    and feedback is null
    and (
      status <> 'Submitted'
      or exists (
        select 1 from public.homework_submission_files f
        where f.homework_id = homework_status.homework_id
          and f.student_id = homework_status.student_id
      )
    )
  );

alter policy homework_status_student_update_own on public.homework_status
  using (is_own_active_student(student_id) and status <> 'Graded')
  with check (
    is_own_active_student(student_id)
    and status = any (array['Assigned', 'Submitted'])
    and score is null
    and feedback is null
    and (
      status <> 'Submitted'
      or exists (
        select 1 from public.homework_submission_files f
        where f.homework_id = homework_status.homework_id
          and f.student_id = homework_status.student_id
      )
    )
  );
