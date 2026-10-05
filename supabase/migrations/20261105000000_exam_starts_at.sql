-- Adds an exact scheduled start timestamp for exams. exams.exam_date is a
-- plain `date` column (day granularity only) and exams.deadline is the
-- submission cutoff driving expired-state logic, so neither can express
-- "the exam starts today at 18:00" without changing its meaning. starts_at
-- is nullable: existing exams without one keep their current day-based
-- behavior, and the frontend only shows a live countdown when it is set.
-- RLS needs no change: exams_read_all already grants SELECT on the whole
-- exams table to every authenticated user, which covers the new column.

alter table public.exams
  add column if not exists starts_at timestamptz;

comment on column public.exams.starts_at is
  'Exact scheduled start (Asia/Tashkent wall time stored as timestamptz). Null means date-only legacy behavior driven by exam_date.';
