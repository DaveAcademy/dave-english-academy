-- Exam Phase 1: enforce valid teacher-entered scores at the database layer.
--
-- Classroom workflow: teachers enter scores manually via exam_scores upserts
-- (ExamGradingRoster on /exams and in LessonHub). Previously nothing
-- constrained score, so negative or over-max values could persist.
-- A CHECK constraint cannot reference another table, so this uses a
-- BEFORE INSERT OR UPDATE trigger comparing NEW.score against the parent
-- exams.max_score: valid range is 0 <= score <= max_score.
--
-- Scope: trigger only. No data changes, no RLS/policy changes, no grant
-- changes, no new tables. Teacher authorization model and one-row-per-
-- student/exam (UNIQUE exam_id, student_id) unchanged.
--
-- Existing rows verified clean before this migration (read-only query
-- 2026-09-19: 160 exam_scores rows, 159 graded, 0 negative, 0 over-max,
-- 0 referencing a NULL max_score), so the trigger introduces no conflict
-- with stored data. NULL scores remain allowed (ungraded rows).
-- exams.max_score is NOT NULL DEFAULT 100; COALESCE guards defensively.

create or replace function public.check_exam_score_range()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
  if NEW.score is null then
    return NEW;
  end if;
  select max_score into v_max from public.exams where id = NEW.exam_id;
  if NEW.score < 0 or NEW.score > coalesce(v_max, 100) then
    raise exception 'exam score % out of range 0..% for exam %', NEW.score, coalesce(v_max, 100), NEW.exam_id
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_exam_scores_score_range on public.exam_scores;
create trigger trg_exam_scores_score_range
  before insert or update of score on public.exam_scores
  for each row execute function public.check_exam_score_range();
