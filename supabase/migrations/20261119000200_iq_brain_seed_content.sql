-- IQ & Brain, Phase 3 / M1 seed: small, deterministic, hand-reviewed demo
-- set. Not a question bank.
--
-- 10 questions (2 per category, difficulties spread across 1-5) plus three
-- challenge definitions. This is the M1 verification seed so the feature is
-- exercisable end to end; every row is tagged 'iq-m1-seed' so rollout can
-- find and remove or replace it in one statement. Production content comes
-- from the Phase 2 content pipeline (author -> script validation -> human
-- review) and is a separate, separately approved change.
--
--   update public.iq_challenges set is_published = false
--    where slug in (select value from jsonb_array_elements_text(...))  -- or
--   delete from public.iq_questions where tags ? 'iq-m1-seed';
--
-- No answer key is ever served to students: questions are readable only
-- through the keyless RPCs (no student SELECT policy exists).

-- ---------- Questions ----------

insert into public.iq_questions
  (category, difficulty, question_type, prompt, stimulus, options, answer_key, explanation, points, status, tags)
values
-- logic / 1 / multiple_choice
('logic', 1, 'multiple_choice',
 '{"stem": "All bloops are razzies. All razzies are lazzies. Which statement must be true?"}',
 null,
 '["All bloops are lazzies", "All lazzies are bloops", "No bloops are lazzies", "Some bloops are not lazzies"]',
 '{"correct_index": 0}',
 'Every bloop is a razzie, and every razzie is a lazzy, so every bloop is a lazzy.',
 10, 'published', '["iq-m1-seed"]'),

-- logic / 3 / odd_one_out
('logic', 3, 'odd_one_out',
 '{"stem": "Which item does not belong with the others?"}',
 '{"rule": "Three of the four shapes have four straight sides."}',
 '["Square", "Rectangle", "Circle", "Rhombus"]',
 '{"correct_index": 2}',
 'Square, rectangle and rhombus all have four straight sides; a circle has no straight sides.',
 10, 'published', '["iq-m1-seed"]'),

-- number_patterns / 2 / number_sequence (choice form)
('number_patterns', 2, 'number_sequence',
 '{"stem": "2, 4, 8, 16, ?"}',
 '{"rule": "x2"}',
 '["20", "24", "32", "36"]',
 '{"correct_index": 2}',
 'Each term doubles the previous one: 16 x 2 = 32.',
 10, 'published', '["iq-m1-seed"]'),

-- number_patterns / 4 / number_sequence (typed form, no options)
('number_patterns', 4, 'number_sequence',
 '{"stem": "3, 6, 12, 24, ?"}',
 '{"rule": "x2"}',
 null,
 '{"value": 48}',
 'Each term doubles the previous one: 24 x 2 = 48.',
 10, 'published', '["iq-m1-seed"]'),

-- visual_patterns / 2 / pattern_recognition
('visual_patterns', 2, 'pattern_recognition',
 '{"stem": "Which letter continues the pattern?"}',
 '{"sequence": ["A", "B", "A", "B", "A"]}',
 '["B", "A", "C", "D"]',
 '{"correct_index": 0}',
 'The pattern alternates A, B, so after A comes B.',
 10, 'published', '["iq-m1-seed"]'),

-- visual_patterns / 3 / pattern_recognition
('visual_patterns', 3, 'pattern_recognition',
 '{"stem": "A hand points Up, then Right, then Down, then Left. Which direction comes next?"}',
 '{"rule": "90 degrees clockwise each step"}',
 '["Up", "Right", "Down", "Left"]',
 '{"correct_index": 0}',
 'The hand turns 90 degrees clockwise each step, so after Left it points Up again.',
 10, 'published', '["iq-m1-seed"]'),

-- spatial / 3 / spatial_reasoning
('spatial', 3, 'spatial_reasoning',
 '{"stem": "You face North, turn 90 degrees right, then turn 180 degrees left. Which direction are you facing now?"}',
 null,
 '["North", "East", "South", "West"]',
 '{"correct_index": 3}',
 'North, then right 90 degrees gives East, then left 180 degrees gives West.',
 10, 'published', '["iq-m1-seed"]'),

-- spatial / 4 / spatial_reasoning
('spatial', 4, 'spatial_reasoning',
 '{"stem": "An arrow points up and to the right. After a 180 degree rotation, which way does it point?"}',
 '{"figure": "arrow pointing up-right"}',
 '["Down and to the left", "Up and to the left", "Down and to the right", "Up and to the right"]',
 '{"correct_index": 0}',
 'A 180 degree rotation reverses both directions: up-right becomes down-left.',
 10, 'published', '["iq-m1-seed"]'),

-- memory / 2 / memory
('memory', 2, 'memory',
 '{"stem": "Watch the sequence, then answer after it hides. Which item was third?"}',
 '{"sequence": ["red", "blue", "green", "yellow"], "reveal_ms": 4000}',
 '["green", "yellow", "red", "blue"]',
 '{"correct_index": 0}',
 'The sequence is red, blue, green, yellow, so green is third.',
 10, 'published', '["iq-m1-seed"]'),

-- memory / 4 / memory
('memory', 4, 'memory',
 '{"stem": "Remember the numbers. What was the third number in the sequence?"}',
 '{"sequence": ["7", "2", "8", "3", "1"], "reveal_ms": 5000}',
 '["8", "2", "3", "1"]',
 '{"correct_index": 0}',
 'The sequence is 7, 2, 8, 3, 1, so the third number is 8.',
 10, 'published', '["iq-m1-seed"]');

-- ---------- Challenges ----------

-- iq_challenge: all five categories, two questions each (10 total).
-- practice: logic only, its two questions.
-- daily: published only once Phase 5 seeds iq_daily_challenges for the date;
-- start_iq_attempt raises 'no daily challenge today' until then.
insert into public.iq_challenges
  (slug, kind, title, description, question_count, time_limit_sec,
   difficulty_min, difficulty_max, category_weights, is_published)
values
('iq-challenge', 'iq_challenge', 'IQ Challenge',
 'A balanced reasoning challenge across Logic, Number Patterns, Visual Patterns, Spatial Reasoning and Memory.',
 10, 600, 1, 5, '{}'::jsonb, true),
('logic-practice', 'practice', 'Logic Practice',
 'Focused deduction and ordering practice.',
 2, 180, 1, 5, '{"logic": 1}'::jsonb, true),
('daily-brain', 'daily', 'Daily Brain Challenge',
 'One curated challenge per day. Becomes available when a daily set is published.',
 5, 300, 1, 5, '{}'::jsonb, false);
