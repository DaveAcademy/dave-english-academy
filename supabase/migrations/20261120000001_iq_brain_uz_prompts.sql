-- 20261120000001_iq_brain_uz_prompts.sql
--
-- IQ & Brain M1 localization: Uzbek display translations for the 10 seeded
-- questions (tag iq-m1-seed). Display content ONLY.
--
-- Safety contract (unchanged behavior):
--   * English prompt.stem stays authoritative and untouched.
--   * Adds prompt.stem_uz alongside it. The keyless get_iq_attempt payload
--     already projects the whole prompt object, so no RPC changes needed.
--   * Scoring reads answer_key/points/difficulty only; this migration never
--   touches those columns, nor ids, categories, RLS, grants, or scoring.
--   * Matched by (category, difficulty, iq-m1-seed tag), which is unique per
--     seeded question - never by volatile row id.
--   * The `not (prompt ? 'stem_uz')` guard makes every statement idempotent
--     and preserves any hand-edited translation on re-run.
--   * Numbers, sequences, symbols and option labels are preserved exactly;
--     direction/compass words referenced by answer options keep their
--     English form with an Uzbek gloss in parentheses so the options still
--     read unambiguously.

-- logic / 1 / multiple_choice
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Barcha blooplar razzilardir. Barcha razzilar lazzilardir. Qaysi tasdiq albatta to''g''ri?"}'::jsonb,
    updated_at = now()
where category = 'logic' and difficulty = 1
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- logic / 3 / odd_one_out
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Qaysi biri qolganlariga mos kelmaydi?"}'::jsonb,
    updated_at = now()
where category = 'logic' and difficulty = 3
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- number_patterns / 2 / number_sequence (choice form, no language to translate)
update public.iq_questions
set prompt = prompt || '{"stem_uz": "2, 4, 8, 16, ?"}'::jsonb,
    updated_at = now()
where category = 'number_patterns' and difficulty = 2
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- number_patterns / 4 / number_sequence (typed form, no language to translate)
update public.iq_questions
set prompt = prompt || '{"stem_uz": "3, 6, 12, 24, ?"}'::jsonb,
    updated_at = now()
where category = 'number_patterns' and difficulty = 4
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- visual_patterns / 2 / pattern_recognition
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Naqshni qaysi harf davom ettiradi?"}'::jsonb,
    updated_at = now()
where category = 'visual_patterns' and difficulty = 2
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- visual_patterns / 3 / pattern_recognition (direction words glossed; options stay English)
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Strelka avval Up (yuqoriga), keyin Right (o''ngga), keyin Down (pastga), keyin Left (chapga) yo''naldi. Keyingi qadamda qaysi yo''nalish keladi?"}'::jsonb,
    updated_at = now()
where category = 'visual_patterns' and difficulty = 3
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- spatial / 3 / spatial_reasoning (compass words glossed; options stay English)
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Siz North (shimol) tomonga qarab turibsiz, avval 90 daraja o''ngga, keyin 180 daraja chapga burildingiz. Hozir qaysi tomonga qarayapsiz?"}'::jsonb,
    updated_at = now()
where category = 'spatial' and difficulty = 3
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- spatial / 4 / spatial_reasoning
update public.iq_questions
set prompt = prompt || '{"stem_uz": "O''q yuqoriga va o''ngga qarab turibdi. U 180 daraja burilgandan keyin qaysi tomonga qaraydi?"}'::jsonb,
    updated_at = now()
where category = 'spatial' and difficulty = 4
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- memory / 2 / memory (includes the watch-then-answer instruction)
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Ketma-ketlikni kuzating, u yashiringandan keyin javob bering. Uchinchi element qaysi edi?"}'::jsonb,
    updated_at = now()
where category = 'memory' and difficulty = 2
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');

-- memory / 4 / memory
update public.iq_questions
set prompt = prompt || '{"stem_uz": "Raqamlarni eslab qoling. Ketma-ketlikdagi uchinchi raqam qaysi edi?"}'::jsonb,
    updated_at = now()
where category = 'memory' and difficulty = 4
  and tags @> '["iq-m1-seed"]'
  and prompt ? 'stem'
  and not (prompt ? 'stem_uz');
