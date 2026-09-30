-- 20261116000000_homework_q1854_ordering.sql
-- Convert Q1854 from short_answer to ordering
-- apples / three / red → three red apples
-- Tokens in given order: apples(0), three(1), red(2)
-- Correct order: three(1), red(2), apples(0) -> [1, 2, 0]
-- All PK-scoped, guarded on current type + empty question_data.
BEGIN;

UPDATE public.homework_questions
SET
  question_type = 'ordering',
  question_data = jsonb_build_object(
    'items', jsonb_build_array('apples', 'three', 'red'),
    'correct_order', jsonb_build_array(1, 2, 0)
  )
WHERE id = 1854
  AND question_type = 'short_answer'
  AND question_data = '{}'::jsonb;

COMMIT;