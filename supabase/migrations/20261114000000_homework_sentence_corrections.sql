-- 20261114000000_homework_sentence_corrections.sql
-- Convert 28 sentence-correction short_answer questions to translation with accepted_targets
-- All PK-scoped, guarded on current type + empty question_data.
-- No schema/RPC/RLS changes.
BEGIN;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'There is two beds.',
  'target_text', 'There are two beds.'
), accepted_targets = ARRAY['There are two beds.']
WHERE id = 1074 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'There is two pictures.',
  'target_text', 'There are two pictures.'
), accepted_targets = ARRAY['There are two pictures.']
WHERE id = 1106 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I play football yesterday.',
  'target_text', 'I played football yesterday.'
), accepted_targets = ARRAY['I played football yesterday.']
WHERE id = 1141 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I go to the market yesterday.',
  'target_text', 'I went to the market yesterday.'
), accepted_targets = ARRAY['I went to the market yesterday.']
WHERE id = 1150 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'Is there any rice?',
  'target_text', 'Is there any rice? Yes, there is.'
), accepted_targets = ARRAY['Is there any rice? Yes, there is.']
WHERE id = 1158 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'How many sugar do we need?',
  'target_text', 'How much sugar do we need?'
), accepted_targets = ARRAY['How much sugar do we need?']
WHERE id = 1166 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I go to school yesterday.',
  'target_text', 'I went to school yesterday.'
), accepted_targets = ARRAY['I went to school yesterday.']
WHERE id = 1193 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'We going to play.',
  'target_text', 'We are going to play.'
), accepted_targets = ARRAY['We are going to play.', 'We''re going to play.']
WHERE id = 1209 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I do always my homework.',
  'target_text', 'I always do my homework.'
), accepted_targets = ARRAY['I always do my homework.']
WHERE id = 1257 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'You should to eat fruit.',
  'target_text', 'You should eat fruit.'
), accepted_targets = ARRAY['You should eat fruit.']
WHERE id = 1337 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I want become a teacher.',
  'target_text', 'I want to become a teacher.'
), accepted_targets = ARRAY['I want to become a teacher.']
WHERE id = 1393 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'She has to works.',
  'target_text', 'She has to work.'
), accepted_targets = ARRAY['She has to work.']
WHERE id = 1401 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I have download it.',
  'target_text', 'I have downloaded it.'
), accepted_targets = ARRAY['I have downloaded it.', 'I''ve downloaded it.']
WHERE id = 1418 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I am agree.',
  'target_text', 'I agree.'
), accepted_targets = ARRAY['I agree.']
WHERE id = 1434 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'If it will rain, I stay.',
  'target_text', 'If it rains, I will stay.'
), accepted_targets = ARRAY['If it rains, I will stay.', 'If it rains, I stay.']
WHERE id = 1458 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I was read a book.',
  'target_text', 'I was reading a book.'
), accepted_targets = ARRAY['I was reading a book.', 'I read a book.']
WHERE id = 1499 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'If I was you.',
  'target_text', 'If I were you.'
), accepted_targets = ARRAY['If I were you.']
WHERE id = 1531 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'My name Ali.',
  'target_text', 'My name is Ali.'
), accepted_targets = ARRAY['My name is Ali.']
WHERE id = 1780 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'It red.',
  'target_text', 'It is red.'
), accepted_targets = ARRAY['It is red.', 'It''s red.']
WHERE id = 1806 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'It is a elephant.',
  'target_text', 'It is an elephant.'
), accepted_targets = ARRAY['It is an elephant.']
WHERE id = 1860 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I can to swim.',
  'target_text', 'I can swim.'
), accepted_targets = ARRAY['I can swim.']
WHERE id = 1873 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I am Uzbekistan.',
  'target_text', 'I am from Uzbekistan.'
), accepted_targets = ARRAY['I am from Uzbekistan.', 'I am Uzbek.']
WHERE id = 1886 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'He have a dog.',
  'target_text', 'He has a dog.'
), accepted_targets = ARRAY['He has a dog.']
WHERE id = 1912 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'today is monday.',
  'target_text', 'Today is Monday.'
), accepted_targets = ARRAY['Today is Monday.']
WHERE id = 1925 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'She kind.',
  'target_text', 'She is kind.'
), accepted_targets = ARRAY['She is kind.', 'She''s kind.']
WHERE id = 1938 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I like sing.',
  'target_text', 'I like singing.'
), accepted_targets = ARRAY['I like singing.', 'I like to sing.']
WHERE id = 1951 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I wake up 7.',
  'target_text', 'I wake up at 7.'
), accepted_targets = ARRAY['I wake up at 7.', 'I wake up at 7:00.']
WHERE id = 1980 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'I no like milk.',
  'target_text', 'I don''t like milk.'
), accepted_targets = ARRAY['I don''t like milk.', 'I do not like milk.']
WHERE id = 1998 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'Sunny today.',
  'target_text', 'It is sunny today.'
), accepted_targets = ARRAY['It is sunny today.', 'It''s sunny today.']
WHERE id = 2025 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
UPDATE public.homework_questions SET question_type = 'translation', question_data = jsonb_build_object(
  'direction', 'en2en_correction',
  'source_text', 'There is two bedrooms.',
  'target_text', 'There are two bedrooms.'
), accepted_targets = ARRAY['There are two bedrooms.']
WHERE id = 2034 AND question_type = 'short_answer' AND question_data = '{}'::jsonb;
COMMIT;
