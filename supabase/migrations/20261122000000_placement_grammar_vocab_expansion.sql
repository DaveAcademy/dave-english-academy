-- 20261122000000_placement_grammar_vocab_expansion.sql
-- Adds grammar and vocabulary mcq items to reach 5 grammar + 5 vocabulary
-- per CEFR level for the grammar/vocabulary-only fixed-60 assessment.

insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  ('grammar', 1, 'mcq', $j${"text":"The cat is ___ the table.","options":["on","in","at","to"]}$j$, $j${"option_index":0}$j$, null, 'The preposition on is used for surfaces.', 1),
  ('grammar', 1, 'mcq', $j${"text":"Are you happy today?","options":["Is","Am","Are","Be"]}$j$, $j${"option_index":2}$j$, null, 'Second person you takes are.', 1),
  ('grammar', 1, 'mcq', $j${"text":"We ___ students.","options":["is","am","are","be"]}$j$, $j${"option_index":2}$j$, null, 'Plural subject we takes are.', 1),
  ('grammar', 2, 'mcq', $j${"text":"She ___ to the market yesterday.","options":["go","goes","went","gone"]}$j$, $j${"option_index":2}$j$, null, 'Yesterday signals past simple: went.', 2),
  ('grammar', 2, 'mcq', $j${"text":"I ___ my homework before dinner.","options":["finish","finished","have finish","finishing"]}$j$, $j${"option_index":1}$j$, null, 'Completed past action uses past simple: finished.', 2),
  ('grammar', 3, 'mcq', $j${"text":"By the time we arrived the film ___.","options":["started","has started","had started","starts"]}$j$, $j${"option_index":2}$j$, null, 'Past perfect for an action before another past action.', 3),
  ('grammar', 3, 'mcq', $j${"text":"You had better see a doctor.","options":["would","should","could","had"]}$j$, $j${"option_index":3}$j$, null, 'Had better is a fixed expression for advice.', 3),
  ('grammar', 4, 'mcq', $j${"text":"I wish I ___ more time to prepare.","options":["have","had","would have","have had"]}$j$, $j${"option_index":1}$j$, null, 'Wish about a present state takes the past simple.', 4),
  ('grammar', 4, 'mcq', $j${"text":"The report ___ by the committee last week.","options":["reviewed","was reviewed","has reviewed","is reviewing"]}$j$, $j${"option_index":1}$j$, null, 'Past passive: was plus past participle.', 4),
  ('grammar', 5, 'mcq', $j${"text":"Rarely ___ such dedication in a junior colleague.","options":["I have seen","have I seen","I saw","did I saw"]}$j$, $j${"option_index":1}$j$, null, 'Negative adverb fronting triggers inversion.', 5),
  ('grammar', 5, 'mcq', $j${"text":"The proposal ___ was unexpected was rejected.","options":["that","which","what","it"]}$j$, $j${"option_index":1}$j$, null, 'Non-restrictive relative clause uses which.', 5),
  ('grammar', 6, 'mcq', $j${"text":"___ the difficulty she completed the course with distinction.","options":["Despite of","Although","Notwithstanding","Even"]}$j$, $j${"option_index":2}$j$, null, 'Notwithstanding plus noun phrase means despite.', 6),
  ('grammar', 6, 'mcq', $j${"text":"So ___ the evidence that conviction was immediate.","options":["compelling was","was compelling","compelling were","were compelling"]}$j$, $j${"option_index":0}$j$, null, 'Fronting so plus adjective triggers inversion.', 6),
  ('vocabulary', 1, 'mcq', $j${"text":"The opposite of open is ___.","options":["close","start","big","new"]}$j$, $j${"option_index":0}$j$, null, 'Close is the antonym of open.', 1),
  ('vocabulary', 2, 'mcq', $j${"text":"Please ___ the door quietly.","options":["close","closed","closing","closes"]}$j$, $j${"option_index":0}$j$, null, 'Base form after please in an instruction.', 2),
  ('vocabulary', 3, 'mcq', $j${"text":"The company ___ new employees every year.","options":["hire","hires","hiring","hired to"]}$j$, $j${"option_index":1}$j$, null, 'Third person singular company takes hires.', 3),
  ('vocabulary', 4, 'mcq', $j${"text":"Her argument was ___ - it changed my mind completely.","options":["persuasive","pervasive","invasive","evasive"]}$j$, $j${"option_index":0}$j$, null, 'Persuasive means able to convince.', 4),
  ('vocabulary', 5, 'mcq', $j${"text":"The minister ___ allegations of misconduct.","options":["vehemently denied","strenuously was denying","was strenuously denied","denied strenuously"]}$j$, $j${"option_index":0}$j$, null, 'Adverb precedes the verb in standard word order.', 5),
  ('vocabulary', 6, 'mcq', $j${"text":"The philosopher argued that free will is a ___.","options":["chimera","panacea","litmus","bailiwick"]}$j$, $j${"option_index":0}$j$, null, 'A chimera is an illusion or impossible fantasy.', 6);

do $$
declare
  v_lvl smallint;
  v_need int := 5;
begin
  for v_lvl in 1..6 loop
    if (select count(*) from public.placement_questions where skill = 'grammar' and question_type = 'mcq' and cefr_level = v_lvl and status = 'published') < v_need then
      raise exception 'bank incomplete: level % has fewer than % grammar mcq', v_lvl, v_need;
    end if;
    if (select count(*) from public.placement_questions where skill = 'vocabulary' and question_type = 'mcq' and cefr_level = v_lvl and status = 'published') < v_need then
      raise exception 'bank incomplete: level % has fewer than % vocabulary mcq', v_lvl, v_need;
    end if;
  end loop;
end;
$$;
