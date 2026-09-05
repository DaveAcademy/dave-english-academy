-- Picture Quiz content expansion, phase 1: 20 -> 51 words (Dave's request
-- 2026-08-19: more variety, replaying felt repetitive with only 10 words
-- visible per round out of 20 total). Adds a third difficulty tier
-- (medium) - previously only very_easy/easy existed, so any student past
-- level 40 (game_level_to_tier's medium threshold) was silently falling
-- back to the full unfiltered pool every round. Same AI-generated flat-
-- icon style and CDN-hosted image_url approach as 0175 - no schema
-- change needed, difficulty='medium' was already a valid value on
-- game_content_bank_difficulty_check.
--
-- Levels themselves were never capped at 100 - game_level_to_tier() has
-- no upper bound on current_level, so "100+ levels" was already possible
-- mechanically. What was missing was word variety, which this addresses.
-- Phase 2 (hard/very_hard tiers, toward the ~100-word target the other
-- Family C games use) is a natural follow-up, not required to unblock
-- this complaint.
insert into public.game_content_bank (game_type, difficulty, category, payload, min_lesson_number) values
  ('picture_quiz', 'very_easy', 'object', '{"english":"bed","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125156_dc3f0a53-033c-48d0-965a-8283f499ae8c.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"cup","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125223_2b19eb55-9606-4dde-bf33-88fa9dc6f409.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"spoon","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125247_a61a079c-ab37-454e-9099-c4a57793f7a3.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"hat","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125317_8bffdbb1-00f7-4029-a828-a3955eb257b0.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"shoe","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125347_88b132de-8472-4d2a-8c12-b78586758d73.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'nature', '{"english":"egg","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125416_1b99cc5f-81be-42d9-8be4-215b7ad94b7e.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'nature', '{"english":"milk","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125452_5b62d501-ab9e-40e4-9c53-9cad4e2e258e.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"door","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125515_faaf2e65-9d10-4ba1-88a5-6a76737ef8bb.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"window","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125542_5cc38bea-b87a-4a33-9846-d54a6deab2fc.png"}'::jsonb, 1),
  ('picture_quiz', 'very_easy', 'object', '{"english":"clock","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125605_965217c7-f340-4c54-8c3d-8fb4bf54929c.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'animal', '{"english":"rabbit","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125635_358c824b-a0e0-4531-907b-528c4d40f7dd.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'nature', '{"english":"orange","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125712_fed5567a-916f-421a-a0da-7f289a8dad67.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"pizza","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125740_69fe8ec0-4fcf-40d0-8b80-de8ef8579ec4.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"backpack","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125803_86281eac-3a9e-4158-8e62-038d4254daa2.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"balloon","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125828_e22a62b7-69c1-4b81-8729-8f6bfcd1ffb7.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"drum","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125858_a395d313-d1a3-44fa-aa35-6c9f68e84ef3.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"sandwich","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_125933_f9abfd45-cdde-4fca-8c05-3194874cb4cd.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'animal', '{"english":"snail","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130007_a2dcf22b-ea59-4ec3-9099-de299641a38e.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"mirror","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130031_d1ac0e9d-b329-41b1-8076-9bec22443067.png"}'::jsonb, 1),
  ('picture_quiz', 'easy', 'object', '{"english":"scarf","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130134_48d6d91d-e57b-44bc-8f02-1a9ebf30cb3f.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'animal', '{"english":"giraffe","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130102_f5d92366-a2e7-45c6-b183-7a0b46286d44.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'animal', '{"english":"kangaroo","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130159_c857cc76-e4bf-45ed-9a2f-fcc5f488909d.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'animal', '{"english":"dolphin","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130229_18f08d03-3648-4a59-ad48-fd42c2984d68.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'animal', '{"english":"penguin","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130256_8b5c9a09-b3e6-4288-90a4-661f0557acba.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'animal', '{"english":"octopus","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130325_4d88863c-cb01-4c9a-af11-e811424803e8.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'object', '{"english":"helicopter","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130355_ea95defd-a5e6-4837-85e9-2e3b503b2897.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'object', '{"english":"compass","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130434_0762f0fa-a554-42aa-a682-21a371b86f38.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'nature', '{"english":"cactus","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130505_e0bc22ef-fcec-41d1-8d9b-ff8774510127.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'object', '{"english":"lighthouse","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130533_103f8af1-1a22-4714-ba9a-2a1d99b8ac6c.png"}'::jsonb, 1),
  ('picture_quiz', 'medium', 'nature', '{"english":"volcano","image_url":"https://d8j0ntlcm91z4.cloudfront.net/user_3GvrWFrcSTI9kALt1bkHkYOorsJ/hf_20260819_130603_b2527e44-b667-4611-8a2b-ab28c2ec7678.png"}'::jsonb, 1);
