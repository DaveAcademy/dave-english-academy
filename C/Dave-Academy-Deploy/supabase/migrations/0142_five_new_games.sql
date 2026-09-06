-- Adds 5 new games to the Game & Practice System: Word Builder and
-- Listening Challenge reuse the existing vocabulary pipeline
-- (pick_game_words/student_available_vocabulary), exactly like
-- word_scramble/vocabulary_quiz. Sentence Scramble, Word Detective and
-- Grammar Battle are curated-content games (grammar/sentence-order
-- questions, not vocabulary) - their canonical content and answer keys
-- are seeded into a new small table, game_content_bank, so grading stays
-- server-authoritative (same anti-cheat invariant as every other game:
-- the client never supplies its own "correct answer", only its choice,
-- and the server looks up truth by id). Round tokens and replay
-- protection reuse game_rounds/consumed_at exactly as in 0141 - no new
-- anti-replay mechanism needed.
--
-- NOT applied to any database (local or prod) by this commit - SQL only,
-- untested against a live instance. Run `supabase db push` in its own
-- reviewed session per the project's migration-ledger discipline.

-- ---------- curated content bank (sentence_scramble / word_detective / grammar_battle) ----------

create table if not exists public.game_content_bank (
  id uuid primary key default gen_random_uuid(),
  game_type text not null check (game_type in ('sentence_scramble', 'word_detective', 'grammar_battle')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  category text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists game_content_bank_type_idx on public.game_content_bank (game_type, difficulty);

alter table public.game_content_bank enable row level security;

-- Content itself is not sensitive (no answer key is ever exposed to a
-- client directly from this table - get_*_round() strips it before
-- returning rows, same pattern as pick_game_words). Readable by any
-- authenticated user is fine and simplest; writes stay admin-only.
drop policy if exists game_content_bank_select_authenticated on public.game_content_bank;
create policy game_content_bank_select_authenticated on public.game_content_bank for select
  using (auth.role() = 'authenticated');

drop policy if exists game_content_bank_admin_write on public.game_content_bank;
create policy game_content_bank_admin_write on public.game_content_bank for all
  using (is_admin()) with check (is_admin());

-- ---------- sentence_scramble seed ----------
-- payload: { words: [canonical token order], type: statement|question|negative, tense }
-- "words" is the single source of truth for the correct order - get_round
-- returns a shuffled copy of these tokens plus the id; submit_game_round
-- compares the submitted order against this array by id lookup.

insert into public.game_content_bank (game_type, difficulty, category, payload) values
('sentence_scramble', 'easy', 'present_simple', '{"type":"statement","tense":"present_simple","words":["She","goes","to","school","every","day"]}'),
('sentence_scramble', 'easy', 'present_simple', '{"type":"negative","tense":"present_simple","words":["He","does","not","like","coffee"]}'),
('sentence_scramble', 'easy', 'present_simple', '{"type":"question","tense":"present_simple","words":["Do","you","play","football","on","Sundays"]}'),
('sentence_scramble', 'easy', 'present_continuous', '{"type":"statement","tense":"present_continuous","words":["They","are","watching","a","movie","now"]}'),
('sentence_scramble', 'easy', 'present_continuous', '{"type":"question","tense":"present_continuous","words":["Why","is","she","crying"]}'),
('sentence_scramble', 'easy', 'basic', '{"type":"statement","tense":"present_simple","words":["My","brother","lives","in","Tashkent"]}'),
('sentence_scramble', 'easy', 'basic', '{"type":"statement","tense":"present_simple","words":["I","like","reading","books","in","the","evening"]}'),
('sentence_scramble', 'medium', 'past_simple', '{"type":"statement","tense":"past_simple","words":["We","visited","our","grandparents","last","weekend"]}'),
('sentence_scramble', 'medium', 'past_simple', '{"type":"negative","tense":"past_simple","words":["I","did","not","finish","my","homework","yesterday"]}'),
('sentence_scramble', 'medium', 'past_simple', '{"type":"question","tense":"past_simple","words":["Where","did","you","go","last","summer"]}'),
('sentence_scramble', 'medium', 'future_simple', '{"type":"statement","tense":"future_simple","words":["I","will","call","you","after","dinner"]}'),
('sentence_scramble', 'medium', 'future_simple', '{"type":"question","tense":"future_simple","words":["Will","she","join","us","tomorrow"]}'),
('sentence_scramble', 'medium', 'modals', '{"type":"statement","tense":"modal","words":["You","should","drink","more","water","every","day"]}'),
('sentence_scramble', 'medium', 'modals', '{"type":"negative","tense":"modal","words":["Students","must","not","use","phones","during","the","exam"]}'),
('sentence_scramble', 'medium', 'comparatives', '{"type":"statement","tense":"present_simple","words":["This","book","is","more","interesting","than","that","one"]}'),
('sentence_scramble', 'medium', 'basic', '{"type":"statement","tense":"present_simple","words":["My","favorite","subject","at","school","is","English"]}'),
('sentence_scramble', 'hard', 'present_perfect', '{"type":"statement","tense":"present_perfect","words":["She","has","already","finished","her","project"]}'),
('sentence_scramble', 'hard', 'present_perfect', '{"type":"question","tense":"present_perfect","words":["Have","you","ever","been","to","London"]}'),
('sentence_scramble', 'hard', 'conditionals', '{"type":"statement","tense":"conditional","words":["If","it","rains","tomorrow","we","will","stay","at","home"]}'),
('sentence_scramble', 'hard', 'conditionals', '{"type":"statement","tense":"conditional","words":["If","I","had","more","time","I","would","learn","French"]}'),
('sentence_scramble', 'hard', 'passive', '{"type":"statement","tense":"passive","words":["The","letter","was","sent","by","the","manager","this","morning"]}'),
('sentence_scramble', 'hard', 'reported_speech', '{"type":"statement","tense":"reported_speech","words":["She","said","that","she","was","tired","after","work"]}'),
('sentence_scramble', 'hard', 'relative_clauses', '{"type":"statement","tense":"present_simple","words":["The","teacher","who","helped","me","is","very","kind"]}'),
('sentence_scramble', 'hard', 'past_continuous', '{"type":"statement","tense":"past_continuous","words":["I","was","studying","when","my","friend","called","me"]}');

-- ---------- word_detective seed ----------
-- payload: { sentence: "text with one wrong word", wrong_word, correction,
-- explanation, wrong_index (token index of the wrong word when the
-- sentence is split on whitespace) }. get_round strips correction/
-- explanation/wrong_index; submit_game_round compares the student's
-- chosen index and typed/selected correction against this stored copy.

insert into public.game_content_bank (game_type, difficulty, category, payload) values
('word_detective','easy','subject_verb_agreement','{"sentence":"She go to school every morning.","wrong_index":1,"wrong_word":"go","correction":"goes","explanation":"With he/she/it in the present simple, the verb takes an -s ending: she goes."}'),
('word_detective','easy','subject_verb_agreement','{"sentence":"My parents is very supportive.","wrong_index":2,"wrong_word":"is","correction":"are","explanation":"\"Parents\" is plural, so it needs the plural verb \"are\", not \"is\"."}'),
('word_detective','easy','subject_verb_agreement','{"sentence":"The children plays in the park after school.","wrong_index":2,"wrong_word":"plays","correction":"play","explanation":"\"Children\" is plural, so the verb has no -s: they play."}'),
('word_detective','easy','articles','{"sentence":"I saw a elephant at the zoo.","wrong_index":2,"wrong_word":"a","correction":"an","explanation":"Use \"an\" before a word starting with a vowel sound, like \"elephant\"."}'),
('word_detective','easy','articles','{"sentence":"She is an teacher at our school.","wrong_index":2,"wrong_word":"an","correction":"a","explanation":"\"Teacher\" starts with a consonant sound, so it needs \"a\", not \"an\"."}'),
('word_detective','easy','articles','{"sentence":"He gave me advice, and the advice was very useful.","wrong_index":2,"wrong_word":"the","correction":"","explanation":"\"Advice\" is uncountable and general here, so no article is needed the second time."}'),
('word_detective','easy','spelling','{"sentence":"I recieved your message yesterday.","wrong_index":1,"wrong_word":"recieved","correction":"received","explanation":"Remember the rule \"i before e except after c\": received, not recieved."}'),
('word_detective','easy','spelling','{"sentence":"This is definately the best restaurant in town.","wrong_index":2,"wrong_word":"definately","correction":"definitely","explanation":"The correct spelling is \"definitely\" - it comes from \"definite\", not \"definate\"."}'),
('word_detective','easy','spelling','{"sentence":"Their going to the market this afternoon.","wrong_index":0,"wrong_word":"Their","correction":"They''re","explanation":"\"They''re\" (they are) is needed here, not the possessive \"their\"."}'),
('word_detective','easy','word_confusion','{"sentence":"Can you loose the door before you leave?","wrong_index":2,"wrong_word":"loose","correction":"lock","explanation":"\"Loose\" means not tight; the sentence needs \"lock\" (to secure the door)."}'),
('word_detective','easy','word_confusion','{"sentence":"I need to buy a new pair of shoos.","wrong_index":7,"wrong_word":"shoos","correction":"shoes","explanation":"The footwear is spelled \"shoes\"; \"shoos\" is not a standard word."}'),
('word_detective','easy','prepositions','{"sentence":"We arrived to the airport two hours early.","wrong_index":2,"wrong_word":"to","correction":"at","explanation":"\"Arrive\" takes \"at\" for places like airports/buildings: arrive at the airport."}'),
('word_detective','easy','prepositions','{"sentence":"She is good in playing the piano.","wrong_index":2,"wrong_word":"in","correction":"at","explanation":"The fixed expression is \"good at\" doing something, not \"good in\"."}'),
('word_detective','easy','prepositions','{"sentence":"He was born on 1998.","wrong_index":3,"wrong_word":"on","correction":"in","explanation":"Use \"in\" with years: born in 1998. \"On\" is used with specific days/dates."}'),
('word_detective','medium','tense','{"sentence":"I am living here since 2015.","wrong_index":1,"wrong_word":"am living","correction":"have lived","explanation":"With \"since\" describing an unfinished period, use the present perfect: I have lived here since 2015."}'),
('word_detective','medium','tense','{"sentence":"Yesterday, I go to the cinema with my friends.","wrong_index":2,"wrong_word":"go","correction":"went","explanation":"\"Yesterday\" signals the past simple, so the verb should be \"went\", not \"go\"."}'),
('word_detective','medium','tense','{"sentence":"When I arrived, she already left.","wrong_index":4,"wrong_word":"left","correction":"had left","explanation":"An action completed before another past action needs the past perfect: she had already left."}'),
('word_detective','medium','tense','{"sentence":"By next year, I will finished my degree.","wrong_index":3,"wrong_word":"will finished","correction":"will have finished","explanation":"\"By next year\" needs the future perfect: I will have finished my degree."}'),
('word_detective','medium','word_form','{"sentence":"This decision was very important for the company success.","wrong_index":8,"wrong_word":"company","correction":"company''s","explanation":"The possessive form is needed: the company''s success."}'),
('word_detective','medium','word_form','{"sentence":"The movie was really interested.","wrong_index":4,"wrong_word":"interested","correction":"interesting","explanation":"Use \"-ing\" adjectives for the thing causing a feeling: an interesting movie. \"Interested\" describes how a person feels."}'),
('word_detective','medium','word_form','{"sentence":"He speaks English very good.","wrong_index":3,"wrong_word":"good","correction":"well","explanation":"\"Good\" is an adjective; the sentence needs the adverb \"well\" to modify the verb \"speaks\"."}'),
('word_detective','medium','word_form','{"sentence":"She is a very successfully businesswoman.","wrong_index":3,"wrong_word":"successfully","correction":"successful","explanation":"An adjective, not an adverb, is needed before the noun \"businesswoman\": successful."}'),
('word_detective','medium','word_confusion','{"sentence":"Please lay down and rest for a while.","wrong_index":1,"wrong_word":"lay","correction":"lie","explanation":"\"Lie\" (lie down) means to rest yourself; \"lay\" needs an object (lay something down)."}'),
('word_detective','medium','word_confusion','{"sentence":"The effect of the new policy will affect prices.","wrong_index":6,"wrong_word":"affect","correction":"change","explanation":"\"Affect\" is usually a verb and \"effect\" a noun; repeating \"affect\" here is awkward - the intended meaning is that prices will change."}'),
('word_detective','medium','word_confusion','{"sentence":"I would like to borrow you my notes.","wrong_index":4,"wrong_word":"borrow","correction":"lend","explanation":"\"Lend\" means to give something temporarily; \"borrow\" means to receive it. The speaker is giving, so it should be \"lend\"."}'),
('word_detective','medium','prepositions','{"sentence":"She is married with a doctor.","wrong_index":2,"wrong_word":"with","correction":"to","explanation":"The correct preposition is \"married to\" someone, not \"married with\"."}'),
('word_detective','medium','prepositions','{"sentence":"I am interested about learning Spanish.","wrong_index":2,"wrong_word":"about","correction":"in","explanation":"The fixed expression is \"interested in\" something, not \"interested about\"."}'),
('word_detective','medium','prepositions','{"sentence":"We depend of public transport in this city.","wrong_index":2,"wrong_word":"of","correction":"on","explanation":"The correct preposition after \"depend\" is \"on\": depend on."}'),
('word_detective','medium','articles','{"sentence":"Money is not the most important thing in a life.","wrong_index":9,"wrong_word":"a","correction":"","explanation":"\"Life\" here is a general, uncountable idea, so no article is needed."}'),
('word_detective','hard','tense','{"sentence":"If I would know the answer, I would tell you.","wrong_index":1,"wrong_word":"would know","correction":"knew","explanation":"Second conditional \"if\" clauses use the past simple, not \"would\": if I knew the answer."}'),
('word_detective','hard','tense','{"sentence":"I wish I am taller.","wrong_index":3,"wrong_word":"am","correction":"were","explanation":"After \"I wish\" for an unreal present wish, use the past subjunctive: I wish I were taller."}'),
('word_detective','hard','tense','{"sentence":"She has been working here since five years.","wrong_index":5,"wrong_word":"since","correction":"for","explanation":"Use \"for\" with a length of time (for five years) and \"since\" with a starting point (since 2019)."}'),
('word_detective','hard','grammar_mistake','{"sentence":"Neither of the answers are correct.","wrong_index":3,"wrong_word":"are","correction":"is","explanation":"\"Neither\" is singular, so it takes a singular verb: neither is correct."}'),
('word_detective','hard','grammar_mistake','{"sentence":"Each of the students have their own laptop.","wrong_index":3,"wrong_word":"have","correction":"has","explanation":"\"Each\" is treated as singular, so the verb must be \"has\", not \"have\"."}'),
('word_detective','hard','grammar_mistake','{"sentence":"The number of students are increasing every year.","wrong_index":4,"wrong_word":"are","correction":"is","explanation":"\"The number of\" takes a singular verb (it is the number that increases): the number is increasing."}'),
('word_detective','hard','grammar_mistake','{"sentence":"He suggested me to see a doctor.","wrong_index":2,"wrong_word":"me","correction":"that I","explanation":"\"Suggest\" is not usually followed by an object + infinitive; use \"suggested that I see\" or \"suggested seeing\"."}'),
('word_detective','hard','word_form','{"sentence":"The company made a huge improve last quarter.","wrong_index":5,"wrong_word":"improve","correction":"improvement","explanation":"After \"a\", a noun is needed, not the verb \"improve\": an improvement."}'),
('word_detective','hard','word_form','{"sentence":"His explaination of the problem was very clear.","wrong_index":1,"wrong_word":"explaination","correction":"explanation","explanation":"The correct spelling of the noun is \"explanation\", not \"explaination\"."}'),
('word_detective','hard','prepositions','{"sentence":"The results are different than what we expected.","wrong_index":3,"wrong_word":"than","correction":"from","explanation":"In formal English, \"different from\" is preferred over \"different than\"."}'),
('word_detective','hard','prepositions','{"sentence":"She apologized about being late.","wrong_index":2,"wrong_word":"about","correction":"for","explanation":"The fixed expression is \"apologize for\" doing something, not \"apologize about\"."}'),
('word_detective','hard','spelling','{"sentence":"Their are many opportunities in this field.","wrong_index":0,"wrong_word":"Their","correction":"There","explanation":"The existential \"there are\" is needed here, not the possessive \"their\"."}'),
('word_detective','hard','spelling','{"sentence":"I cant believe how expensive this is.","wrong_index":1,"wrong_word":"cant","correction":"can''t","explanation":"The contraction needs an apostrophe: can''t (cannot)."}');

-- ---------- grammar_battle seed ----------
-- payload: { question, options: [4], correct_index, category }
-- Tiered by difficulty: ~15 easy, ~15 medium, ~10 hard.

insert into public.game_content_bank (game_type, difficulty, category, payload) values
('grammar_battle','easy','verb_tense','{"question":"She ___ to work every day.","options":["go","goes","going","gone"],"correct_index":1,"category":"verb_tense"}'),
('grammar_battle','easy','verb_tense','{"question":"They ___ watching TV right now.","options":["is","am","are","be"],"correct_index":2,"category":"verb_tense"}'),
('grammar_battle','easy','verb_tense','{"question":"I ___ my homework yesterday.","options":["finish","finished","finishing","finishes"],"correct_index":1,"category":"verb_tense"}'),
('grammar_battle','easy','subject_verb_agreement','{"question":"My sister ___ a doctor.","options":["are","is","am","be"],"correct_index":1,"category":"subject_verb_agreement"}'),
('grammar_battle','easy','subject_verb_agreement','{"question":"The dogs ___ in the garden.","options":["is playing","play","plays","playing"],"correct_index":1,"category":"subject_verb_agreement"}'),
('grammar_battle','easy','articles','{"question":"I saw ___ interesting movie last night.","options":["a","an","the","-"],"correct_index":1,"category":"articles"}'),
('grammar_battle','easy','articles','{"question":"___ sun rises in the east.","options":["A","An","The","-"],"correct_index":2,"category":"articles"}'),
('grammar_battle','easy','prepositions','{"question":"We usually meet ___ 6 pm.","options":["in","on","at","by"],"correct_index":2,"category":"prepositions"}'),
('grammar_battle','easy','prepositions','{"question":"She was born ___ March.","options":["at","on","in","for"],"correct_index":2,"category":"prepositions"}'),
('grammar_battle','easy','pronouns','{"question":"This book is ___.","options":["I","me","my","mine"],"correct_index":3,"category":"pronouns"}'),
('grammar_battle','easy','pronouns','{"question":"Can you help ___, please?","options":["I","me","my","mine"],"correct_index":1,"category":"pronouns"}'),
('grammar_battle','easy','plurals','{"question":"There are three ___ on the table.","options":["box","boxs","boxes","boxies"],"correct_index":2,"category":"plurals"}'),
('grammar_battle','easy','plurals','{"question":"How many ___ do you have?","options":["child","childs","childes","children"],"correct_index":3,"category":"plurals"}'),
('grammar_battle','easy','comparatives','{"question":"This car is ___ than that one.","options":["fast","faster","fastest","more fast"],"correct_index":1,"category":"comparatives"}'),
('grammar_battle','easy','word_order','{"question":"Choose the correct question form.","options":["You are from where?","Where you are from?","Where are you from?","From where you are?"],"correct_index":2,"category":"word_order"}'),
('grammar_battle','medium','verb_tense','{"question":"By the time we arrived, the movie ___ already.","options":["started","has started","had started","starts"],"correct_index":2,"category":"verb_tense"}'),
('grammar_battle','medium','verb_tense','{"question":"I ___ this book for two weeks now.","options":["read","am reading","have been reading","was reading"],"correct_index":2,"category":"verb_tense"}'),
('grammar_battle','medium','verb_tense','{"question":"She ___ dinner when the phone rang.","options":["cooked","was cooking","has cooked","cooks"],"correct_index":1,"category":"verb_tense"}'),
('grammar_battle','medium','subject_verb_agreement','{"question":"Neither of the students ___ ready.","options":["are","is","were","have been"],"correct_index":1,"category":"subject_verb_agreement"}'),
('grammar_battle','medium','subject_verb_agreement','{"question":"The news ___ surprising.","options":["are","were","is","have been"],"correct_index":2,"category":"subject_verb_agreement"}'),
('grammar_battle','medium','prepositions','{"question":"She is good ___ solving problems.","options":["in","at","on","for"],"correct_index":1,"category":"prepositions"}'),
('grammar_battle','medium','prepositions','{"question":"He apologized ___ being late.","options":["for","about","of","with"],"correct_index":0,"category":"prepositions"}'),
('grammar_battle','medium','modals','{"question":"You ___ smoke in this building.","options":["mustn''t","don''t must","not must","musn''t not"],"correct_index":0,"category":"modals"}'),
('grammar_battle','medium','modals','{"question":"___ you help me with this bag?","options":["Do","Would","Are","Have"],"correct_index":1,"category":"modals"}'),
('grammar_battle','medium','passive','{"question":"The letter ___ yesterday.","options":["sent","was sent","has sent","is sending"],"correct_index":1,"category":"passive"}'),
('grammar_battle','medium','conditionals','{"question":"If it rains tomorrow, we ___ the trip.","options":["cancel","canceled","will cancel","would cancel"],"correct_index":2,"category":"conditionals"}'),
('grammar_battle','medium','word_form','{"question":"This is a very ___ decision.","options":["important","importantly","importance","importantness"],"correct_index":0,"category":"word_form"}'),
('grammar_battle','medium','word_form','{"question":"He answered the question ___.","options":["correct","correctly","correction","correctness"],"correct_index":1,"category":"word_form"}'),
('grammar_battle','medium','articles','{"question":"She plays ___ violin beautifully.","options":["a","an","the","-"],"correct_index":2,"category":"articles"}'),
('grammar_battle','medium','word_order','{"question":"Choose the correctly ordered sentence.","options":["I always am tired on Mondays.","I am always tired on Mondays.","Always I am tired on Mondays.","I am tired always on Mondays."],"correct_index":1,"category":"word_order"}'),
('grammar_battle','hard','conditionals','{"question":"If I ___ known about the meeting, I would have come.","options":["had","have","has","would have"],"correct_index":0,"category":"conditionals"}'),
('grammar_battle','hard','conditionals','{"question":"If she ___ harder, she would pass the exam.","options":["studies","studied","had studied","study"],"correct_index":1,"category":"conditionals"}'),
('grammar_battle','hard','reported_speech','{"question":"He said that he ___ tired.","options":["is","was","be","were"],"correct_index":1,"category":"reported_speech"}'),
('grammar_battle','hard','reported_speech','{"question":"She told me that she ___ the report the day before.","options":["finished","had finished","has finished","finishes"],"correct_index":1,"category":"reported_speech"}'),
('grammar_battle','hard','passive','{"question":"The bridge ___ by the end of next year.","options":["will complete","will be completed","completes","is completing"],"correct_index":1,"category":"passive"}'),
('grammar_battle','hard','relative_clauses','{"question":"The man ___ car was stolen called the police.","options":["who","which","whose","whom"],"correct_index":2,"category":"relative_clauses"}'),
('grammar_battle','hard','relative_clauses','{"question":"This is the house ___ I grew up.","options":["which","where","who","whose"],"correct_index":1,"category":"relative_clauses"}'),
('grammar_battle','hard','subjunctive','{"question":"I wish I ___ more time to travel.","options":["have","had","has","having"],"correct_index":1,"category":"subjunctive"}'),
('grammar_battle','hard','inversion','{"question":"Never ___ such a beautiful sunset.","options":["I have seen","have I seen","I seen","did I saw"],"correct_index":1,"category":"inversion"}'),
('grammar_battle','hard','word_form','{"question":"The committee reached an ___ decision.","options":["agree","agreeable","agreement","agreeably"],"correct_index":1,"category":"word_form"}');

-- ---------- get_*_round() for the 5 new games ----------

create or replace function public.get_word_builder_round()
returns table (round_id uuid, id uuid, english text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english from public.pick_game_words(true, 8) p
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'word_builder', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_word_builder_round() from public;
grant execute on function public.get_word_builder_round() to authenticated;

create or replace function public.get_listening_challenge_round()
returns table (round_id uuid, id uuid, english text, options text[])
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
  v_distractors text[];
  v_options text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in select p.id, p.english, p.uzbek from public.pick_game_words(false, 8) p
  loop
    select array_agg(u) into v_distractors from (
      select v.uzbek as u
      from public.student_available_vocabulary() v
      where v.uzbek is distinct from r.uzbek
      order by random()
      limit 3
    ) d;
    v_options := array_append(coalesce(v_distractors, '{}'), r.uzbek);
    select array_agg(o order by random()) into v_options from unnest(v_options) o;
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    english := r.english;
    options := v_options;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'listening_challenge', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_listening_challenge_round() from public;
grant execute on function public.get_listening_challenge_round() to authenticated;

-- Curated-content rounds share one shape: pick N random bank rows for a
-- game_type (mixed across difficulty so easy/medium/hard all appear),
-- mint a game_rounds token whose vocabulary_ids column is repurposed to
-- hold game_content_bank ids (still uuid[], same column - no schema
-- change needed), and strip the answer key before returning.

create or replace function public.get_sentence_scramble_round()
returns table (round_id uuid, id uuid, words text[], canonical_words text[], type text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
  v_shuffled text[];
  v_canonical text[];
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload
    from public.game_content_bank b
    where b.game_type = 'sentence_scramble'
    order by random()
    limit 6
  loop
    select array_agg(w order by random())
      into v_shuffled
    from jsonb_array_elements_text(r.payload->'words') w;

    -- Untouched (non-shuffled) order, for the client's post-attempt
    -- "correct answer" reveal - safe to send once the round exists since
    -- game_rounds/consumed_at already prevents this same round being
    -- resubmitted for credit.
    select array_agg(w)
      into v_canonical
    from jsonb_array_elements_text(r.payload->'words') w;

    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    words := v_shuffled;
    canonical_words := v_canonical;
    type := r.payload->>'type';
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'sentence_scramble', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_sentence_scramble_round() from public;
grant execute on function public.get_sentence_scramble_round() to authenticated;

create or replace function public.get_word_detective_round()
returns table (round_id uuid, id uuid, sentence text, category text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  for r in
    select b.id, b.payload, b.category as bank_category
    from public.game_content_bank b
    where b.game_type = 'word_detective'
    order by random()
    limit 8
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    sentence := r.payload->>'sentence';
    category := r.bank_category;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'word_detective', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_word_detective_round() from public;
grant execute on function public.get_word_detective_round() to authenticated;

create or replace function public.get_grammar_battle_round()
returns table (round_id uuid, id uuid, question text, options text[], category text, difficulty text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_round_id uuid;
  v_ids uuid[] := '{}';
  r record;
begin
  select s.id into v_student_id from public.students s where s.profile_id = auth.uid();
  if v_student_id is null then
    return;
  end if;

  v_round_id := gen_random_uuid();

  -- A generous mixed-tier pool (not a fixed "round length" like the
  -- other games) so the client can pick the next question from the
  -- appropriate difficulty bucket as the student's streak grows -
  -- Grammar Battle is lives-based and ends on its own, not after a
  -- fixed word count.
  for r in
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'easy' order by random() limit 10)
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'medium' order by random() limit 10)
    union all
    (select b.id, b.payload, b.difficulty from public.game_content_bank b where b.game_type = 'grammar_battle' and b.difficulty = 'hard' order by random() limit 8)
  loop
    v_ids := array_append(v_ids, r.id);
    round_id := v_round_id;
    id := r.id;
    question := r.payload->>'question';
    options := array(select jsonb_array_elements_text(r.payload->'options'));
    category := r.payload->>'category';
    difficulty := r.difficulty;
    return next;
  end loop;

  if array_length(v_ids, 1) > 0 then
    insert into public.game_rounds (id, student_id, game_type, vocabulary_ids)
    values (v_round_id, v_student_id, 'grammar_battle', v_ids);
  end if;
end;
$$;

revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;

-- ---------- extend submit_game_round ----------
-- Same function, same shape, just a wider allowlist/case set. The
-- vocabulary-graded branch (word_builder, listening_challenge) is
-- unchanged logic reused verbatim; the curated-content branch
-- (sentence_scramble/word_detective/grammar_battle) grades against
-- game_content_bank by id instead of student_available_vocabulary().

create or replace function public.submit_game_round(p_round_id uuid, p_game_type text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_student_id bigint;
  v_words_correct integer := 0;
  v_words_total integer := 0;
  v_score numeric := 0;
  v_results jsonb := '[]'::jsonb;
  r record;
  v_correct boolean;
  v_points numeric;
  v_elapsed_ms numeric;
  v_speed_bonus numeric;
  v_session_id bigint;
  v_is_new_best boolean;
  v_metric_key text;
  v_round_game_type text;
  v_payload jsonb;
  v_submitted_words text[];
  v_canonical_words text[];
begin
  if p_game_type not in (
    'word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge',
    'word_builder', 'listening_challenge', 'sentence_scramble', 'word_detective', 'grammar_battle'
  ) then
    raise exception 'Unknown game_type: %', p_game_type;
  end if;
  v_metric_key := case p_game_type
    when 'word_scramble' then 'game_words_scrambled_correct'
    when 'vocabulary_quiz' then 'game_vocabulary_quiz_correct'
    when 'word_match' then 'game_word_match_correct'
    when 'speed_challenge' then 'game_speed_challenge_correct'
    when 'word_builder' then 'game_word_builder_correct'
    when 'listening_challenge' then 'game_listening_challenge_correct'
    when 'sentence_scramble' then 'game_sentence_scramble_correct'
    when 'word_detective' then 'game_word_detective_correct'
    when 'grammar_battle' then 'game_grammar_battle_correct'
  end;

  select id into v_student_id from public.students where profile_id = auth.uid();
  if v_student_id is null then
    raise exception 'No student record for the current user';
  end if;

  update public.game_rounds
     set consumed_at = now()
   where id = p_round_id
     and student_id = v_student_id
     and consumed_at is null
  returning game_type into v_round_game_type;

  if not found then
    raise exception 'This round is invalid or has already been submitted' using errcode = 'P0001';
  end if;

  if v_round_game_type <> p_game_type then
    raise exception 'Round/game type mismatch';
  end if;

  if p_game_type in ('word_scramble', 'vocabulary_quiz', 'word_match', 'speed_challenge', 'word_builder', 'listening_challenge') then
    -- Vocabulary-graded games: canonical answer comes from
    -- student_available_vocabulary(), same as every pre-existing game.
    for r in
      select
        (a->>'vocabulary_id')::uuid as vocabulary_id,
        a->>'answer' as answer,
        coalesce((a->>'used_hint')::boolean, false) as used_hint,
        coalesce((a->>'skipped')::boolean, false) as skipped,
        (a->>'elapsed_ms')::numeric as elapsed_ms
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;

      select (not r.skipped) and (
        case p_game_type
          when 'word_scramble' then lower(trim(r.answer)) = lower(v.english)
          when 'vocabulary_quiz' then trim(r.answer) = v.uzbek
          when 'word_match' then trim(r.answer) = v.uzbek
          when 'speed_challenge' then trim(r.answer) = v.uzbek
          when 'word_builder' then lower(trim(r.answer)) = lower(v.english)
          when 'listening_challenge' then trim(r.answer) = v.uzbek
        end
      )
        into v_correct
      from public.student_available_vocabulary() v
      where v.id = r.vocabulary_id;

      v_correct := coalesce(v_correct, false);

      if v_correct then
        v_words_correct := v_words_correct + 1;
        if p_game_type = 'speed_challenge' then
          v_elapsed_ms := greatest(0, least(coalesce(r.elapsed_ms, 10000), 10000));
          v_speed_bonus := round(5 * (1 - v_elapsed_ms / 10000));
          v_points := 10 + v_speed_bonus;
        else
          v_points := case when r.used_hint then 5 else 10 end;
        end if;
        v_score := v_score + v_points;
      end if;

      insert into public.game_word_history (student_id, vocabulary_id, times_seen, times_correct, last_seen_at)
      values (v_student_id, r.vocabulary_id, 1, case when v_correct then 1 else 0 end, now())
      on conflict (student_id, vocabulary_id) do update set
        times_seen = game_word_history.times_seen + 1,
        times_correct = game_word_history.times_correct + case when v_correct then 1 else 0 end,
        last_seen_at = now();

      v_results := v_results || jsonb_build_object('vocabulary_id', r.vocabulary_id, 'correct', v_correct);
    end loop;
  else
    -- Curated-content games: canonical answer comes from
    -- game_content_bank.payload by id. No game_word_history entry (that
    -- table is vocabulary-specific); everything else (session row,
    -- metric bump, achievements) is identical.
    for r in
      select
        (a->>'content_id')::uuid as content_id,
        a->>'answer' as answer,
        a->'words' as answer_words,
        coalesce((a->>'wrong_index')::int, -1) as wrong_index,
        a->>'correction' as correction,
        coalesce((a->>'skipped')::boolean, false) as skipped
      from jsonb_array_elements(p_answers) as a
    loop
      v_words_total := v_words_total + 1;
      v_payload := (select payload from public.game_content_bank where id = r.content_id and game_type = p_game_type);
      v_correct := false;

      if v_payload is not null and not r.skipped then
        if p_game_type = 'sentence_scramble' then
          select array_agg(w) into v_submitted_words from jsonb_array_elements_text(coalesce(r.answer_words, '[]'::jsonb)) w;
          select array_agg(w) into v_canonical_words from jsonb_array_elements_text(v_payload->'words') w;
          v_correct := v_submitted_words = v_canonical_words;
        elsif p_game_type = 'word_detective' then
          v_correct := r.wrong_index = coalesce((v_payload->>'wrong_index')::int, -2)
            and lower(trim(coalesce(r.correction, ''))) = lower(trim(coalesce(v_payload->>'correction', '')));
        elsif p_game_type = 'grammar_battle' then
          v_correct := trim(coalesce(r.answer, '')) = ((v_payload->'options') ->> ((v_payload->>'correct_index')::int));
        end if;
      end if;

      v_correct := coalesce(v_correct, false);
      if v_correct then
        v_words_correct := v_words_correct + 1;
        v_points := 10;
        v_score := v_score + v_points;
      end if;

      v_results := v_results || jsonb_build_object('content_id', r.content_id, 'correct', v_correct);
    end loop;
  end if;

  select v_score > coalesce(max(score), -1)
    into v_is_new_best
  from public.game_sessions
  where student_id = v_student_id and game_type = p_game_type;

  insert into public.game_sessions (student_id, game_type, score, words_correct, words_total)
  values (v_student_id, p_game_type, v_score, v_words_correct, v_words_total)
  returning id into v_session_id;

  perform public.bump_student_metric(v_student_id, v_metric_key, v_words_correct);
  perform public.evaluate_achievements(v_student_id);

  return jsonb_build_object(
    'session_id', v_session_id,
    'score', v_score,
    'words_correct', v_words_correct,
    'words_total', v_words_total,
    'is_new_best', coalesce(v_is_new_best, true),
    'results', v_results
  );
end;
$$;

revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;
