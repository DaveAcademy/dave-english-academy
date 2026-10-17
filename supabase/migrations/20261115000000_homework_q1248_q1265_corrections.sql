-- 20261115000000_homework_q1248_q1265_corrections.sql
-- Convert Q1248 and Q1265 to translation with accepted_targets
-- Q1248: On Sunday I play football. -> On Sunday I played football.
-- Q1265: In Monday I go to school. -> On Monday I go to school. / On Mondays I go to school.
-- All PK-scoped, guarded on current type + empty question_data.
-- No schema/RPC/RLS changes.
BEGIN;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'On Sunday I play football.',
  'target_text', 'On Sunday I played football.'
), accepted_targets = ARRAY['On Sunday I played football.']
WHERE id = 1248 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'In Monday I go to school.',
  'target_text', 'On Monday I go to school.'
), accepted_targets = ARRAY['On Monday I go to school.', 'On Mondays I go to school.']
WHERE id = 1265 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
COMMIT;
