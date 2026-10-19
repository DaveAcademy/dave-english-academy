-- 20261121000200_placement_test_seed.sql
-- CEFR Placement Test: original question bank (A1-C2).
--
-- All items are original content written for Dave English Academy - no
-- proprietary standardized-test material. weight = CEFR ladder index
-- (harder items are stronger evidence). Listening items carry audio_text,
-- which the runner reads aloud via browser speech synthesis; the transcript
-- itself is never rendered (documented limitation in docs/PLACEMENT_TEST.md).
-- Writing/speaking rows are prompts with no answer key; they are assessed
-- by a teacher, not auto-scored.

-- ===========================================================================
-- GRAMMAR (auto-scored)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  -- A1
  ('grammar', 1, 'gap_fill', $j${"text": "She ___ a teacher."}$j$, null, $j$["is"]$j$,
   'Third person singular of "be" is "is".', 1),
  ('grammar', 1, 'mcq', $j${"text": "___ you like coffee?", "options": ["Do", "Are", "Is", "Does"]}$j$,
   $j${"option_index": 0}$j$, null,
   'Questions with "you" in the present simple use the auxiliary "do".', 1),
  ('grammar', 1, 'gap_fill', $j${"text": "There ___ two books on the table."}$j$, null, $j$["are"]$j$,
   'Plural subject ("two books") takes "there are".', 1),
  ('grammar', 1, 'mcq', $j${"text": "This is ___ apple.", "options": ["a", "an", "the", "-"]}$j$,
   $j${"option_index": 1}$j$, null,
   'Use "an" before a vowel sound: an apple.', 1),
  -- A2
  ('grammar', 2, 'mcq', $j${"text": "We ___ to the beach last Sunday.", "options": ["went", "go", "gone", "going"]}$j$,
   $j${"option_index": 0}$j$, null,
   '"Last Sunday" signals past simple: went.', 2),
  ('grammar', 2, 'mcq', $j${"text": "This bag is ___ than the other one.", "options": ["more cheap", "cheaper", "cheapest", "cheap"]}$j$,
   $j${"option_index": 1}$j$, null,
   'One-syllable adjectives form the comparative with -er: cheaper.', 2),
  ('grammar', 2, 'mcq', $j${"text": "Look at those clouds! It ___ rain.", "options": ["is going to", "goes to", "will to", "going to"]}$j$,
   $j${"option_index": 0}$j$, null,
   'Present evidence about a future event uses "be going to".', 2),
  ('grammar', 2, 'gap_fill', $j${"text": "I ___ TV last night. (watch)", "hint": "past simple of watch"}$j$,
   null, $j$["watched"]$j$, 'Regular past simple adds -ed: watched.', 2),
  -- B1
  ('grammar', 3, 'mcq', $j${"text": "I ___ in Tashkent since 2019.", "options": ["live", "lived", "have lived", "am living"]}$j$,
   $j${"option_index": 2}$j$, null,
   '"Since + past point" with a situation continuing now takes present perfect.', 3),
  ('grammar', 3, 'mcq', $j${"text": "If I ___ more time, I would learn the guitar.", "options": ["have", "had", "will have", "would have"]}$j$,
   $j${"option_index": 1}$j$, null,
   'Second conditional: if + past simple, would + infinitive.', 3),
  ('grammar', 3, 'gap_fill', $j${"text": "You ___ smoke in here - it's forbidden. (must / mustn't)"}$j$,
   null, $j$["mustn't", "must not"]$j$,
   'Prohibition is expressed with "mustn''t".', 3),
  ('grammar', 3, 'mcq', $j${"text": "The woman ___ car was stolen called the police.", "options": ["who", "which", "whose", "that"]}$j$,
   $j${"option_index": 2}$j$, null,
   '"Whose" marks possession in a relative clause.', 3),
  -- B2
  ('grammar', 4, 'mcq', $j${"text": "The bridge ___ in 1998.", "options": ["was built", "is built", "has built", "built"]}$j$,
   $j${"option_index": 0}$j$, null,
   'Past simple passive: was/were + past participle.', 4),
  ('grammar', 4, 'mcq', $j${"text": "If she ___ the bus, she wouldn't have missed the interview.", "options": ["didn't miss", "hadn't missed", "doesn't miss", "wouldn't miss"]}$j$,
   $j${"option_index": 1}$j$, null,
   'Third conditional: if + past perfect, would have + participle.', 4),
  ('grammar', 4, 'gap_fill', $j${"text": "He said he ___ finished the report the day before. (have)"}$j$,
   null, $j$["had"]$j$,
   'In reported speech, present perfect shifts to past perfect.', 4),
  ('grammar', 4, 'mcq', $j${"text": "I wish I ___ how to dance.", "options": ["know", "knew", "would know", "known"]}$j$,
   $j${"option_index": 1}$j$, null,
   '"Wish" about a present state takes the past simple: knew.', 4),
  -- C1
  ('grammar', 5, 'mcq', $j${"text": "Not only ___ late, but he also forgot the documents.", "options": ["he was", "was he", "he is", "is he"]}$j$,
   $j${"option_index": 1}$j$, null,
   '"Not only" at the front triggers negative inversion: was he.', 5),
  ('grammar', 5, 'mcq', $j${"text": "___ finished the report, she went home.", "options": ["Having", "Have", "She has", "After"]}$j$,
   $j${"option_index": 0}$j$, null,
   'A perfect participle clause (Having + participle) sequences two actions.', 5),
  ('grammar', 5, 'gap_fill', $j${"text": "If he had saved money then, he ___ be rich now. (will)"}$j$,
   null, $j$["would"]$j$,
   'Mixed conditional: past condition, present result - would + infinitive.', 5),
  ('grammar', 5, 'mcq', $j${"text": "___ was the tone of her email that worried me.", "options": ["It", "That", "What", "There"]}$j$,
   $j${"option_index": 0}$j$, null,
   'Cleft sentence for emphasis: It was X that ...', 5),
  -- C2
  ('grammar', 6, 'mcq', $j${"text": "Scarcely ___ the meeting started when the fire alarm went off.", "options": ["did", "had", "has", "was"]}$j$,
   $j${"option_index": 1}$j$, null,
   '"Scarcely ... when" takes inverted past perfect: scarcely had ... when.', 6),
  ('grammar', 6, 'mcq', $j${"text": "___ he apologize, I still won't work with him.", "options": ["Should", "Would", "Were", "Had"]}$j$,
   $j${"option_index": 0}$j$, null,
   'Inverted conditional with "should" expresses a less certain future condition.', 6),
  ('grammar', 6, 'gap_fill', $j${"text": "Only after the audit ___ the discrepancies become apparent. (do)"}$j$,
   null, $j$["did"]$j$,
   '"Only after + past time" triggers inversion with did.', 6),
  ('grammar', 6, 'mcq', $j${"text": "The plan is ___ to succeed without further funding.", "options": ["dubious", "unlikely", "improbable", "doubtful"]}$j$,
   $j${"option_index": 1}$j$, null,
   'Only "unlikely" combines with a to-infinitive here; the others require different patterns.', 6);

-- ===========================================================================
-- VOCABULARY (auto-scored)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  -- A1
  ('vocabulary', 1, 'mcq', $j${"text": "I eat breakfast in the ___.", "options": ["morning", "evening", "night", "midnight"]}$j$,
   $j${"option_index": 0}$j$, null, 'Breakfast is eaten in the morning.', 1),
  ('vocabulary', 1, 'mcq', $j${"text": "My father's father is my ___.", "options": ["uncle", "grandfather", "brother", "cousin"]}$j$,
   $j${"option_index": 1}$j$, null, 'A parent''s father is a grandfather.', 1),
  ('vocabulary', 1, 'mcq', $j${"text": "The opposite of 'hot' is ___.", "options": ["warm", "cold", "cool", "wet"]}$j$,
   $j${"option_index": 1}$j$, null, 'Cold is the antonym of hot.', 1),
  ('vocabulary', 1, 'mcq', $j${"text": "You buy medicine at the ___.", "options": ["bakery", "bank", "pharmacy", "library"]}$j$,
   $j${"option_index": 2}$j$, null, 'A pharmacy (chemist''s) sells medicine.', 1),
  -- A2
  ('vocabulary', 2, 'mcq', $j${"text": "She ___ the bus to work every day.", "options": ["rides", "takes", "drives", "flies"]}$j$,
   $j${"option_index": 1}$j$, null, 'The standard collocation is "take the bus".', 2),
  ('vocabulary', 2, 'mcq', $j${"text": "I need to ___ an appointment with the dentist.", "options": ["do", "make", "have", "take"]}$j$,
   $j${"option_index": 1}$j$, null, '"Make an appointment" is the fixed collocation.', 2),
  ('vocabulary', 2, 'mcq', $j${"text": "It was so ___ that I took my umbrella.", "options": ["sunny", "foggy", "rainy", "windy"]}$j$,
   $j${"option_index": 2}$j$, null, 'An umbrella is used in the rain.', 2),
  ('vocabulary', 2, 'mcq', $j${"text": "He ___ his keys, so he couldn't open the door.", "options": ["found", "lost", "bought", "sold"]}$j$,
   $j${"option_index": 1}$j$, null, 'Losing keys explains why the door would not open.', 2),
  -- B1
  ('vocabulary', 3, 'mcq', $j${"text": "The company decided to ___ the meeting until Monday.", "options": ["postpone", "deny", "prevent", "disturb"]}$j$,
   $j${"option_index": 0}$j$, null, '"Postpone until" means to move to a later time.', 3),
  ('vocabulary', 3, 'mcq', $j${"text": "The medicine quickly ___ his pain.", "options": ["reduced", "recovered", "healed", "slept"]}$j$,
   $j${"option_index": 0}$j$, null, 'Pain is reduced; a wound is healed; a patient recovers.', 3),
  ('vocabulary', 3, 'mcq', $j${"text": "It's worth ___ the exhibition - the reviews are excellent.", "options": ["visiting", "visit", "to visit", "visited"]}$j$,
   $j${"option_index": 0}$j$, null, '"Worth" is followed by a gerund.', 3),
  ('vocabulary', 3, 'mcq', $j${"text": "The two designs are very ___ - I can hardly tell them apart.", "options": ["alike", "like", "same", "similarly"]}$j$,
   $j${"option_index": 0}$j$, null, 'After a linking verb we use "alike"; "the same" needs "the".', 3),
  -- B2
  ('vocabulary', 4, 'mcq', $j${"text": "The minister ___ reports of corruption, calling them baseless.", "options": ["dismissed", "depressed", "confessed", "repressed"]}$j$,
   $j${"option_index": 0}$j$, null, '"Dismiss reports" = reject them as unfounded.', 4),
  ('vocabulary', 4, 'mcq', $j${"text": "The new evidence ___ doubt on his alibi.", "options": ["threw", "cast", "put", "laid"]}$j$,
   $j${"option_index": 1}$j$, null, 'The fixed collocation is "cast doubt on".', 4),
  ('vocabulary', 4, 'mcq', $j${"text": "The talks broke down because neither side was willing to ___ ground.", "options": ["give", "take", "lose", "make"]}$j$,
   $j${"option_index": 0}$j$, null, '"Give ground" = make concessions in a dispute.', 4),
  ('vocabulary', 4, 'mcq', $j${"text": "The contract becomes ___ only when both parties sign it.", "options": ["valid", "vain", "vacant", "vague"]}$j$,
   $j${"option_index": 0}$j$, null, 'A signed contract is legally valid; the distractors mean useless/empty/unclear.', 4),
  -- C1
  ('vocabulary', 5, 'mcq', $j${"text": "Her argument was ___ - every claim was supported by data.", "options": ["cogent", "fallacious", "trivial", "obscure"]}$j$,
   $j${"option_index": 0}$j$, null, 'A cogent argument is clear, logical and convincing.', 5),
  ('vocabulary', 5, 'mcq', $j${"text": "The crisis ___ the government's failure to act.", "options": ["underscored", "undermined", "undertook", "underwent"]}$j$,
   $j${"option_index": 0}$j$, null, '"Underscore" = emphasize or highlight.', 5),
  ('vocabulary', 5, 'mcq', $j${"text": "He made an ___ remark that offended several guests.", "options": ["innocuous", "ill-advised", "ingenious", "immaculate"]}$j$,
   $j${"option_index": 1}$j$, null, 'An ill-advised remark is unwise; the others cannot offend.', 5),
  ('vocabulary', 5, 'mcq', $j${"text": "The report calls for a ___ overhaul of the tax system.", "options": ["sweeping", "sweep", "swept", "sweepingly"]}$j$,
   $j${"option_index": 0}$j$, null, '"Sweeping overhaul" = far-reaching; adjective form needed.', 5),
  -- C2
  ('vocabulary', 6, 'mcq', $j${"text": "The author's prose is admirably ___ - not a word is wasted.", "options": ["terse", "vacuous", "verbose", "florid"]}$j$,
   $j${"option_index": 0}$j$, null, 'Terse prose is compact; the distractors mean empty/wordy/ornate.', 6),
  ('vocabulary', 6, 'mcq', $j${"text": "She handled the crisis with remarkable ___.", "options": ["equanimity", "equivocation", "equity", "ebullience"]}$j$,
   $j${"option_index": 0}$j$, null, 'Equanimity = calmness under pressure.', 6),
  ('vocabulary', 6, 'mcq', $j${"text": "The minister's statement was deliberately ___, allowing each side to interpret it as it wished.", "options": ["ambiguous", "amenable", "amicable", "auspicious"]}$j$,
   $j${"option_index": 0}$j$, null, 'An ambiguous statement has more than one reading.', 6),
  ('vocabulary', 6, 'mcq', $j${"text": "Their claims were ___ by the archived records.", "options": ["gainsaid", "forestalled", "besmirched", "obviated"]}$j$,
   $j${"option_index": 0}$j$, null, '"Gainsay" = contradict or deny.', 6);

-- ===========================================================================
-- READING (auto-scored; passage + comprehension item)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  -- A1
  ('reading', 1, 'mcq',
   $j${"passage": "Ben is a student. He gets up at seven o'clock and goes to school by bus.", "text": "When does Ben get up?", "options": ["At six", "At seven", "At eight", "At nine"]}$j$,
   $j${"option_index": 1}$j$, null, 'The passage states he gets up at seven.', 1),
  ('reading', 1, 'mcq',
   $j${"passage": "Anna works in a small shop. She sells bread and milk.", "text": "What does Anna sell?", "options": ["Clothes", "Bread and milk", "Books", "Cars"]}$j$,
   $j${"option_index": 1}$j$, null, 'Stated directly in the second sentence.', 1),
  ('reading', 1, 'mcq',
   $j${"passage": "Tom has a dog. The dog's name is Rex. Rex likes to play in the garden.", "text": "Who likes to play in the garden?", "options": ["Tom", "Rex", "Tom's cat", "Anna"]}$j$,
   $j${"option_index": 1}$j$, null, 'Rex the dog plays in the garden.', 1),
  -- A2
  ('reading', 2, 'mcq',
   $j${"passage": "Dear Sara, I arrived in London on Monday. The weather is rainy, but I like the city. My hotel is near the museum. See you soon! - Murod", "text": "How is the weather in London?", "options": ["Sunny", "Snowy", "Rainy", "Windy"]}$j$,
   $j${"option_index": 2}$j$, null, 'The writer says the weather is rainy.', 2),
  ('reading', 2, 'mcq',
   $j${"passage": "Last weekend, Malika visited her grandmother in Samarkand. They cooked rice together and walked in the old city.", "text": "What did Malika and her grandmother do?", "options": ["Watched TV", "Cooked rice", "Went swimming", "Bought a car"]}$j$,
   $j${"option_index": 1}$j$, null, 'They cooked rice and walked in the old city.', 2),
  ('reading', 2, 'mcq',
   $j${"passage": "The library closes at 8 p.m. on weekdays, but at 5 p.m. on Saturdays and Sundays.", "text": "When does the library close on Saturday?", "options": ["8 p.m.", "5 p.m.", "6 p.m.", "It is closed"]}$j$,
   $j${"option_index": 1}$j$, null, 'Weekend closing time is 5 p.m.', 2),
  -- B1
  ('reading', 3, 'mcq',
   $j${"passage": "Many people believe that drinking eight glasses of water a day is essential. However, research shows that most foods also contain water, and the exact amount each person needs depends on their body, activity, and climate.", "text": "What does the passage suggest about the 'eight glasses' rule?", "options": ["It is essential for everyone", "It is too much for athletes", "It is not a strict rule for everyone", "Doctors invented it for advertising"]}$j$,
   $j${"option_index": 2}$j$, null, 'Needs vary by person; the rule is not universal.', 3),
  ('reading', 3, 'mcq',
   $j${"passage": "When Aziz started his small bakery, he worked alone. Two years later, he employed five people and delivered bread to cafes across the city. His advice is simple: 'Start small, but start well.'", "text": "What is Aziz's advice?", "options": ["Grow as quickly as possible", "Borrow money before starting", "Begin modestly but with quality", "Always work alone"]}$j$,
   $j${"option_index": 2}$j$, null, '"Start small, but start well" = begin modestly with quality.', 3),
  ('reading', 3, 'mcq',
   $j${"passage": "Recycling plastic is useful, but it is not the whole answer. Reducing the amount of plastic we use in the first place has a greater effect, because much plastic can only be recycled once or twice.", "text": "What is the main point?", "options": ["Recycling is useless", "Plastic can be recycled forever", "Using less plastic matters more than recycling", "Food packaging contains plastic"]}$j$,
   $j${"option_index": 2}$j$, null, 'Reduction has a greater effect because recycling is limited.', 3),
  -- B2
  ('reading', 4, 'mcq',
   $j${"passage": "The tradition of afternoon tea is often attributed to Anna, Duchess of Bedford, in the 1840s. Whether or not she truly invented it, her habit of a late-afternoon meal to bridge the long gap between lunch and dinner caught on among the upper classes and gradually spread.", "text": "What does the passage imply about the Duchess?", "options": ["She definitely invented afternoon tea", "Her role may be exaggerated", "She disliked tea", "She ran a tea shop"]}$j$,
   $j${"option_index": 1}$j$, null, '"Whether or not she truly invented it" questions her credit.', 4),
  ('reading', 4, 'mcq',
   $j${"passage": "Remote work has clear benefits: no commute, flexible hours, and access to a wider job market. Yet companies report a subtler cost - new employees learn less quickly when they cannot observe experienced colleagues at work.", "text": "What hidden cost of remote work is mentioned?", "options": ["Higher office rent", "Slower informal learning for newcomers", "Fewer job openings", "Longer commutes"]}$j$,
   $j${"option_index": 1}$j$, null, 'Newcomers learn less without observing colleagues.', 4),
  ('reading', 4, 'mcq',
   $j${"passage": "Critics dismissed the novel on its release as sentimental fiction. A century later, it is studied as a sharp critique of the very society that first rejected it.", "text": "How did opinions of the novel change?", "options": ["It was praised, then forgotten", "It was mocked but is now seen as a serious critique", "It was always popular", "It was never published"]}$j$,
   $j${"option_index": 1}$j$, null, 'Initial dismissal reversed into scholarly esteem.', 4),
  -- C1
  ('reading', 5, 'mcq',
   $j${"passage": "That cities should be designed for people rather than cars is now orthodoxy among planners. Yet the orthodoxy risks hardening into dogma: pedestrianisation imposed without consultation can hollow out the very street life it aims to protect.", "text": "What concern does the writer raise?", "options": ["Cars should dominate cities", "Well-intentioned planning may undermine its own goals", "Planners never consult anyone", "Pedestrian zones always succeed"]}$j$,
   $j${"option_index": 1}$j$, null, 'Unconsulted pedestrianisation can destroy street life.', 5),
  ('reading', 5, 'mcq',
   $j${"passage": "The archive's value lies less in its famous manuscripts than in its mundane ledgers, from which historians have reconstructed the daily economy of a village that left no other record.", "text": "Why are the ledgers valuable?", "options": ["They are famous", "They preserve an otherwise unrecorded daily economy", "They are beautifully written", "They list medieval kings"]}$j$,
   $j${"option_index": 1}$j$, null, 'The ledgers record what no other source does.', 5),
  ('reading', 5, 'mcq',
   $j${"passage": "Sceptics were quick to note that the study's sample was small and self-selected; enthusiasts were quick to forget it. Both, perhaps, were responding to the headline rather than the data.", "text": "What is the writer's view of both groups?", "options": ["Both read the study carefully", "Both reacted to the headline rather than the data", "The sceptics were right and the enthusiasts wrong", "The enthusiasts were right"]}$j$,
   $j${"option_index": 1}$j$, null, 'Both groups responded to the headline, not the data.', 5),
  -- C2
  ('reading', 6, 'mcq',
   $j${"passage": "It would be convenient to read the treaty as generous, and contemporary accounts largely did; the ledger of annexations tells a less flattering story.", "text": "What does the passage contrast?", "options": ["Generosity and gratitude", "Contemporary narrative and documentary evidence", "Two different treaties", "War and peace"]}$j$,
   $j${"option_index": 1}$j$, null, 'Contemporary accounts versus the annexation ledger.', 6),
  ('reading', 6, 'mcq',
   $j${"passage": "However eloquent the appeal, it founders on a simple fact: the fund, however large, is finite, and appeals to posterity do not pay interest.", "text": "What is the writer's point?", "options": ["The appeal is eloquent", "The appeal fails because resources are finite", "Posterity does pay interest", "The fund keeps growing"]}$j$,
   $j${"option_index": 1}$j$, null, 'The fund is finite, so the appeal fails.', 6),
  ('reading', 6, 'mcq',
   $j${"passage": "To call the reform a failure is premature; to call it a triumph is absurd. Between those poles lies an untidy truth that partisans on either side have little appetite for.", "text": "What does the writer suggest about the reform?", "options": ["It clearly failed", "It clearly triumphed", "Its outcome is mixed and inconvenient for partisans", "It has not happened yet"]}$j$,
   $j${"option_index": 2}$j$, null, 'Neither pole fits; the truth is mixed.', 6);

-- ===========================================================================
-- LISTENING (auto-scored; audio_text is read aloud, never displayed)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  -- A1
  ('listening', 1, 'mcq',
   $j${"audio_text": "Hello, my name is Dilnoza. I am nine years old. I have two brothers.", "text": "How many brothers does Dilnoza have?", "options": ["One", "Two", "Three", "No brothers"]}$j$,
   $j${"option_index": 1}$j$, null, 'She says she has two brothers.', 1),
  ('listening', 1, 'mcq',
   $j${"audio_text": "The train to Bukhara leaves from platform three at half past four.", "text": "Which platform does the train leave from?", "options": ["Platform one", "Platform two", "Platform three", "Platform four"]}$j$,
   $j${"option_index": 2}$j$, null, 'Platform three is stated.', 1),
  ('listening', 1, 'mcq',
   $j${"audio_text": "Excuse me, where is the post office? Go straight and turn left at the bank.", "text": "Where must the person turn?", "options": ["Right at the bank", "Left at the bank", "At the post office", "Straight ahead"]}$j$,
   $j${"option_index": 1}$j$, null, 'Turn left at the bank.', 1),
  -- A2
  ('listening', 2, 'mcq',
   $j${"audio_text": "Welcome to the City Hotel. Breakfast is served from seven to ten in the dining room on the ground floor.", "text": "Where is breakfast served?", "options": ["On the top floor", "In the dining room", "In the bedrooms", "In the garden"]}$j$,
   $j${"option_index": 1}$j$, null, 'Breakfast is in the ground-floor dining room.', 2),
  ('listening', 2, 'mcq',
   $j${"audio_text": "Hi, this is Jasur. I'm calling about the football match. It starts at six, not five. See you there!", "text": "When does the match start?", "options": ["At five", "At six", "At seven", "At four"]}$j$,
   $j${"option_index": 1}$j$, null, 'The correction states six, not five.', 2),
  ('listening', 2, 'mcq',
   $j${"audio_text": "This bus doesn't go to the airport. You need to change at Central Station and take the number twelve.", "text": "What should the passenger do?", "options": ["Stay on the bus", "Take a taxi", "Change at Central Station", "Walk to the airport"]}$j$,
   $j${"option_index": 2}$j$, null, 'Change at Central Station to the number twelve.', 2),
  -- B1
  ('listening', 3, 'mcq',
   $j${"audio_text": "Good morning. I'm phoning to confirm my appointment with Doctor Karimov on Thursday at three fifteen. If the time isn't convenient, please call me back on this number.", "text": "What time is the appointment?", "options": ["Three fifty", "Three fifteen", "Four fifteen", "Three thirty"]}$j$,
   $j${"option_index": 1}$j$, null, 'Three fifteen is stated.', 3),
  ('listening', 3, 'mcq',
   $j${"audio_text": "The museum will close early next Wednesday for maintenance. Morning visits are unaffected, but anyone arriving after one o'clock will be asked to return another day.", "text": "Who will be affected?", "options": ["Morning visitors", "Afternoon visitors", "All visitors", "Staff only"]}$j$,
   $j${"option_index": 1}$j$, null, 'Only arrivals after one o''clock are affected.', 3),
  ('listening', 3, 'mcq',
   $j${"audio_text": "I used to hate running, but my sister persuaded me to train with her. Now I've finished two marathons and I can't imagine my week without it.", "text": "How does the speaker feel about running now?", "options": ["Still hates it", "Runs only with the sister", "It has become part of life", "Quit after two marathons"]}$j$,
   $j${"option_index": 2}$j$, null, '"Can''t imagine my week without it" = habitual.', 3),
  -- B2
  ('listening', 4, 'mcq',
   $j${"audio_text": "We regret to announce that due to industrial action, the evening service will operate a reduced timetable. Passengers holding tickets for the eight o'clock express may travel on the six thirty service at no extra charge.", "text": "What are passengers on the eight o'clock train advised?", "options": ["Cancel their tickets", "Pay extra for the earlier train", "Travel earlier at no extra cost", "Wait until the morning"]}$j$,
   $j${"option_index": 2}$j$, null, 'They may take the 6:30 at no extra charge.', 4),
  ('listening', 4, 'mcq',
   $j${"audio_text": "What strikes me about young musicians today isn't their technical skill, which is remarkable, but their impatience. They record an album in a weekend and wonder why nobody listens.", "text": "What does the speaker criticize?", "options": ["Musicians' technique", "Modern recording equipment", "Their lack of patience", "The price of albums"]}$j$,
   $j${"option_index": 2}$j$, null, 'The criticism is impatience, not technique.', 4),
  ('listening', 4, 'mcq',
   $j${"audio_text": "The scheme works like this: households that cut their energy use by ten percent receive a discount, while those who increase consumption pay a small surcharge. Last year, two thirds of households qualified for the discount.", "text": "What happened last year?", "options": ["Most households got the discount", "Most paid a surcharge", "Nobody qualified", "Energy use doubled"]}$j$,
   $j${"option_index": 0}$j$, null, 'Two thirds qualified for the discount.', 4),
  -- C1
  ('listening', 5, 'mcq',
   $j${"audio_text": "I'm not suggesting the reform is worthless - far from it. But let's not confuse the enthusiasm of its architects with evidence of its success. The pilot data, frankly, is thin.", "text": "What is the speaker's position?", "options": ["The reform is worthless", "The reform's success is unproven", "The pilot was huge", "The architects lied"]}$j$,
   $j${"option_index": 1}$j$, null, 'The speaker accepts the reform but doubts the evidence.', 5),
  ('listening', 5, 'mcq',
   $j${"audio_text": "You'll notice the second movement repeats the opening theme, but transposed down a third and scored for the cellos - a subtle nod, I'd argue, to the composer's earlier chamber works.", "text": "What happens in the second movement?", "options": ["A completely new theme is introduced", "The opening theme returns, lower and for cellos", "The cellos stop playing", "The composer himself appears"]}$j$,
   $j${"option_index": 1}$j$, null, 'The theme returns transposed and rescored.', 5),
  ('listening', 5, 'mcq',
   $j${"audio_text": "The company attributes the shortfall to currency fluctuations. Perhaps. Though it's notable that the shortfall appears only in the divisions audited last year.", "text": "What does the speaker imply?", "options": ["Currency definitely caused it", "The explanation may hide another cause", "The audit was thorough", "Shortfalls are normal"]}$j$,
   $j${"option_index": 1}$j$, null, 'The pattern suggests the currency explanation is incomplete.', 5),
  -- C2
  ('listening', 6, 'mcq',
   $j${"audio_text": "To hear the minister tell it, the deadline was always negotiable; to read the minutes, it was set in stone. One of these accounts, presumably, is more convenient than accurate.", "text": "What contrast does the speaker draw?", "options": ["Two different deadlines", "The minister's account and the official record", "Two different ministers", "Stone and water"]}$j$,
   $j${"option_index": 1}$j$, null, 'The minister''s version versus the minutes.', 6),
  ('listening', 6, 'mcq',
   $j${"audio_text": "The edition is valuable not because it settles any question - it settles nothing - but because it makes the variants visible, and visibility, in textual criticism, is half the battle.", "text": "Why is the edition valuable?", "options": ["It answers every question", "It reveals textual variants", "It is inexpensive", "It is very old"]}$j$,
   $j${"option_index": 1}$j$, null, 'Its value is making variants visible.', 6),
  ('listening', 6, 'mcq',
   $j${"audio_text": "Few would defend the policy openly; fewer still would defend it with data. What sustains it, I suspect, is the fear of being the first to say it has failed.", "text": "What keeps the policy alive?", "options": ["Its strong results", "Open public support", "Fear of admitting failure", "New supporting data"]}$j$,
   $j${"option_index": 2}$j$, null, 'Nobody wants to be first to declare failure.', 6);

-- ===========================================================================
-- WRITING (teacher-assessed prompts; no answer key)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  ('writing', 1, 'prompt', $j${"text": "Write 3-5 sentences about your family.", "guidance": "Who is in your family? What are their names? How old are they?", "min_words": 15}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 1),
  ('writing', 1, 'prompt', $j${"text": "Write 3-5 sentences about your day.", "guidance": "What do you do in the morning, afternoon, and evening?", "min_words": 15}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 1),
  ('writing', 2, 'prompt', $j${"text": "Write 5-8 sentences about your last holiday.", "guidance": "Where did you go? When? What did you do?", "min_words": 40}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 2),
  ('writing', 2, 'prompt', $j${"text": "Write an invitation message to a friend for your birthday.", "guidance": "Include the day, the time, and the place. Write 4-6 sentences.", "min_words": 30}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 2),
  ('writing', 3, 'prompt', $j${"text": "Write an email to your teacher explaining that you missed last week's lesson and asking what you should study.", "guidance": "Write 8-12 sentences. Include a greeting and a closing.", "min_words": 70}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 3),
  ('writing', 3, 'prompt', $j${"text": "Describe a person who has influenced you.", "guidance": "Who are they? How do you know them? Why do they matter to you? Write 10-14 sentences.", "min_words": 90}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 3),
  ('writing', 4, 'prompt', $j${"text": "Your school wants students' opinions on banning phones in class. Write a response giving your view.", "guidance": "Write 150-180 words. Give your opinion with two clear reasons.", "min_words": 140}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 4),
  ('writing', 4, 'prompt', $j${"text": "Describe a difficult decision you made and explain how you chose.", "guidance": "Write 150-180 words. Explain the situation, the options, and the outcome.", "min_words": 140}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 4),
  ('writing', 5, 'prompt', $j${"text": "'Social media does more harm than good for teenagers.' Write a reasoned response.", "guidance": "Write 200-250 words. State your position, support it, and address at least one counter-argument.", "min_words": 190}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 5),
  ('writing', 5, 'prompt', $j${"text": "Write a short article for the academy newsletter proposing one improvement to the school.", "guidance": "Write 200-250 words. Describe the problem, your proposal, and justify it.", "min_words": 190}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 5),
  ('writing', 6, 'prompt', $j${"text": "'A language can be learned; it cannot be taught.' Discuss.", "guidance": "Write 250-300 words. Evaluate the claim and support your position with examples.", "min_words": 240}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 6),
  ('writing', 6, 'prompt', $j${"text": "Write a critical review of a book or film you know well.", "guidance": "Write 250-300 words. Assess both its achievement and its limitations.", "min_words": 240}$j$,
   null, null, 'Teacher rubric: task completion, grammatical control, vocabulary range, coherence.', 6);

-- ===========================================================================
-- SPEAKING (teacher-conducted prompts; no automated scoring)
-- ===========================================================================
insert into public.placement_questions
  (skill, cefr_level, question_type, prompt, answer_key, accepted_answers, explanation, weight) values
  ('speaking', 1, 'prompt', $j${"text": "Introduce yourself.", "guidance": "Say your name, your age, who is in your family, and one thing you like."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 1),
  ('speaking', 1, 'prompt', $j${"text": "Describe your home.", "guidance": "Say what rooms it has and what your favourite place in it is."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 1),
  ('speaking', 2, 'prompt', $j${"text": "Describe your typical day.", "guidance": "Talk about your day from morning to night."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 2),
  ('speaking', 2, 'prompt', $j${"text": "Talk about a trip you took.", "guidance": "Say where and when you went and what you did."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 2),
  ('speaking', 3, 'prompt', $j${"text": "Compare life in a big city and a small town.", "guidance": "Which do you prefer, and why?"}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 3),
  ('speaking', 3, 'prompt', $j${"text": "Describe a goal you have.", "guidance": "Say what the goal is and what steps you are taking to reach it."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 3),
  ('speaking', 4, 'prompt', $j${"text": "Some jobs may disappear because of technology.", "guidance": "Which jobs do you think are at risk, and why?"}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 4),
  ('speaking', 4, 'prompt', $j${"text": "Tell a story about a time when something went wrong.", "guidance": "What happened, and what did you learn from it?"}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 4),
  ('speaking', 5, 'prompt', $j${"text": "'Everyone should learn a second language.' Assess this claim.", "guidance": "Consider at least one objection to your position."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 5),
  ('speaking', 5, 'prompt', $j${"text": "Describe a change in your country over the past ten years.", "guidance": "Evaluate its effects on people's lives."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 5),
  ('speaking', 6, 'prompt', $j${"text": "To what extent does the language a person speaks shape how they think?", "guidance": "Give a reasoned answer with examples."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 6),
  ('speaking', 6, 'prompt', $j${"text": "Choose a decision in your studies or work that was widely criticised.", "guidance": "Was the criticism fair? Justify your view."}$j$,
   null, null, 'Teacher rubric: intelligibility, grammatical control, vocabulary range, fluency/coherence.', 6);

-- Bank review guard: every published objective skill must have items at all
-- six levels, so adaptive selection can always find an unused question.
do $$
declare
  v_skill text;
  v_n int;
begin
  foreach v_skill in array array['grammar','vocabulary','reading','listening'] loop
    select count(distinct cefr_level) into v_n
    from public.placement_questions
    where skill = v_skill and status = 'published';
    if v_n < 6 then
      raise exception 'seed incomplete: skill % covers only % levels', v_skill, v_n;
    end if;
  end loop;
end;
$$;
