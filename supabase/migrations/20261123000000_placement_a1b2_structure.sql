-- 20261123000000_placement_a1b2_structure.sql
-- Restructures the assessment to A1-B2 only: 60 questions, 15 per level
-- (8 grammar + 7 vocabulary), 600 points maximum.
-- Adds 20 new mcq questions. Rerunnable via NOT EXISTS guard.

insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  ('grammar', 1, 'mcq', $j${"text":"I ___ a teacher.","options":["am","is","are","be"]}$j$, $j${"option_index":0}$j$, null, 'First person singular I takes am.', 1),
  ('grammar', 1, 'mcq', $j${"text":"They are from Uzbekistan.","options":["is","am","are","be"]}$j$, $j${"option_index":2}$j$, null, 'Plural subject they takes are.', 1),
  ('grammar', 1, 'mcq', $j${"text":"She does not like coffee.","options":["does","do","is","has"]}$j$, $j${"option_index":0}$j$, null, 'Third person singular negative uses does not.', 1),
  ('grammar', 2, 'mcq', $j${"text":"I am taller than my brother.","options":["tall","taller","tallest","more tall"]}$j$, $j${"option_index":1}$j$, null, 'Comparative adds er.', 2),
  ('grammar', 2, 'mcq', $j${"text":"We go swimming every Saturday.","options":["go","goes","going","gone"]}$j$, $j${"option_index":0}$j$, null, 'Present simple habitual action.', 2),
  ('grammar', 2, 'mcq', $j${"text":"He is good at football.","options":["in","at","on","for"]}$j$, $j${"option_index":1}$j$, null, 'The correct preposition with good for skills is at.', 2),
  ('grammar', 3, 'mcq', $j${"text":"If it rains we will stay inside.","options":["will stay","would stay","stayed","will stayed"]}$j$, $j${"option_index":0}$j$, null, 'First conditional.', 3),
  ('grammar', 3, 'mcq', $j${"text":"I have lived here since 2015.","options":["for","since","from","at"]}$j$, $j${"option_index":1}$j$, null, 'Since is used with a starting point.', 3),
  ('grammar', 3, 'mcq', $j${"text":"She said she was tired.","options":["is","was","will be","has been"]}$j$, $j${"option_index":1}$j$, null, 'Reported speech shifts present to past.', 3),
  ('grammar', 4, 'mcq', $j${"text":"The house was being painted when we arrived.","options":["was","is","has","had"]}$j$, $j${"option_index":0}$j$, null, 'Past continuous passive.', 4),
  ('grammar', 4, 'mcq', $j${"text":"No sooner had he arrived than the phone rang.","options":["when","than","then","that"]}$j$, $j${"option_index":1}$j$, null, 'No sooner than is a fixed correlative construction.', 4),
  ('grammar', 4, 'mcq', $j${"text":"It is essential that every student arrive on time.","options":["arrives","arrive","arriving","arrived"]}$j$, $j${"option_index":1}$j$, null, 'Subjunctive uses base form.', 4),
  ('vocabulary', 1, 'mcq', $j${"text":"I drink water every morning.","options":["water","waters","a water","an water"]}$j$, $j${"option_index":0}$j$, null, 'Uncountable noun water has no article.', 1),
  ('vocabulary', 1, 'mcq', $j${"text":"The sky is blue today.","options":["blue","beautifully","quickly","loudly"]}$j$, $j${"option_index":0}$j$, null, 'Adjective blue describes the noun sky.', 1),
  ('vocabulary', 2, 'mcq', $j${"text":"She left her keys on the table.","options":["left","leaved","lefted","leaving"]}$j$, $j${"option_index":0}$j$, null, 'Past simple of leave is left.', 2),
  ('vocabulary', 2, 'mcq', $j${"text":"The weather is warmer today than yesterday.","options":["warm","warmer","warmest","more warm"]}$j$, $j${"option_index":1}$j$, null, 'Comparative of warm is warmer.', 2),
  ('vocabulary', 3, 'mcq', $j${"text":"I need to make a decision soon.","options":["do","make","take","have"]}$j$, $j${"option_index":1}$j$, null, 'The correct collocation is make a decision.', 3),
  ('vocabulary', 3, 'mcq', $j${"text":"He declined the offer because the salary was too low.","options":["accepted","declined","approved","promoted"]}$j$, $j${"option_index":1}$j$, null, 'Declined means refused politely.', 3),
  ('vocabulary', 4, 'mcq', $j${"text":"The results were unforeseen - nobody expected them.","options":["anticipated","unforeseen","predicted","planned"]}$j$, $j${"option_index":1}$j$, null, 'Unforeseen means not anticipated or expected.', 4),
  ('vocabulary', 4, 'mcq', $j${"text":"She embraced the opportunity to study abroad.","options":["embraced","embarked","entailed","evoked"]}$j$, $j${"option_index":0}$j$, null, 'Embraced means eagerly accepted an opportunity.', 4);

-- Verify the bank can supply the new A1-B2 distribution
do $$
declare
  v_lvl smallint;
begin
  for v_lvl in 1..4 loop
    if (select count(*) from public.placement_questions where skill = 'grammar' and question_type = 'mcq' and cefr_level = v_lvl and status = 'published') < 8 then
      raise exception 'bank incomplete: level % has fewer than 8 grammar mcq', v_lvl;
    end if;
    if (select count(*) from public.placement_questions where skill = 'vocabulary' and question_type = 'mcq' and cefr_level = v_lvl and status = 'published') < 7 then
      raise exception 'bank incomplete: level % has fewer than 7 vocabulary mcq', v_lvl;
    end if;
  end loop;
end;
$$;
