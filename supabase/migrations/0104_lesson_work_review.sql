-- Lesson Work Submission, Phase 2: teacher review + manual points.
-- Additive only on top of 0103 - adds columns to lesson_work_submissions,
-- touches no other table, no Homework table, and no existing column.
--
-- Points are NOT written by any trigger or default here. The only writer
-- of point_transactions for lesson work is awardLessonWorkPoints()
-- (storageBridge.js), which calls the exact same awardPoints() every other
-- points flow in this app uses (Rankings.jsx, HomeworkGradingRoster via
-- setHomeworkStatusForStudent, etc.) - one ledger, one insert path.
-- points_awarded/points_transaction_id below are a display-only cache set
-- right after that ledger insert succeeds, so the student's own submission
-- card can show "+N points" without re-querying/aggregating the ledger.
-- point_transactions remains the sole source of truth for actual totals.
--
-- No RLS policy changes needed: 0103's lesson_work_submissions_teacher_all
-- ("for all", using is_teacher()) already covers UPDATE of these new
-- columns, and lesson_work_submissions_self_read already lets a student
-- read them back on their own row.

alter table public.lesson_work_submissions
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists feedback text,
  add column if not exists points_awarded integer,
  add column if not exists points_transaction_id bigint references public.point_transactions(id);
