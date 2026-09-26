-- 20261118000000_homework_q2016_correction.sql
-- Convert Q2016 from short_answer to fill_blank with deterministic answer
-- Q2016: "Correct the sentence: This shoes." -> "These shoes"
-- Context: Lesson 25 quiz has identical structure: "___ shoes are new." (This/These) -> "These"
-- All PK-scoped, guarded on current type + empty question_data.
BEGIN;

UPDATE public.homework_questions
SET question_type = 'fill_blank',
    question_data = jsonb_build_object('answer', 'These shoes')
WHERE id = 2016
  AND question_type = 'short_answer'
  AND question_data = '{}'::jsonb;

COMMIT;