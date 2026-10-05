-- Online Tests rebalance 2026-10: 3-4 items per lesson, all Tests 1-10.
-- UPDATEs in place on (test_number, stage, position) so online_test_items IDs
-- are preserved; submitted attempts keep frozen scores (submit RPC is idempotent).
-- Generated from src/features/onlineTests/data/test*.json; do not hand-edit.

update public.online_test_items set prompt_data = '{"question": "What does “Good morning” mean?", "options": ["Xayrli tong", "Xayrli kun", "Xayrli kech", "Xayr"]}'::jsonb, answer_key = '{"correct_value": "Xayrli tong"}'::jsonb, source_ref = 'L1 greetings', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “qizil” mean in English?", "options": ["red", "blue", "green", "black"]}'::jsonb, answer_key = '{"correct_value": "red"}'::jsonb, source_ref = 'L3 colors', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “How old are you?” mean?", "options": ["Necha yoshdasiz?", "Ismingiz nima?", "Qalaysiz?", "Nechta?"]}'::jsonb, answer_key = '{"correct_value": "Necha yoshdasiz?"}'::jsonb, source_ref = 'L2 age', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each animal with its Uzbek word.", "left": ["Cat", "Dog", "Bird", "Fish"], "right": ["Mushuk", "It", "Qush", "Baliq"]}'::jsonb, answer_key = '{"pairs": [["Cat", "Mushuk"], ["Dog", "It"], ["Bird", "Qush"], ["Fish", "Baliq"]]}'::jsonb, source_ref = 'L9 animals', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “book” mean?", "options": ["kitob", "qalam", "stul", "parta"]}'::jsonb, answer_key = '{"correct_value": "kitob"}'::jsonb, source_ref = 'L4 classroom', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “yuz” mean in English?", "options": ["hundred", "twenty", "thirty", "fifty"]}'::jsonb, answer_key = '{"correct_value": "hundred"}'::jsonb, source_ref = 'L5 numbers', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each question word with its Uzbek word.", "left": ["who", "what", "where", "when"], "right": ["kim", "nima", "qayerda", "qachon"]}'::jsonb, answer_key = '{"pairs": [["who", "kim"], ["what", "nima"], ["where", "qayerda"], ["when", "qachon"]]}'::jsonb, source_ref = 'L6 question words', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Swim” mean?", "options": ["Suzmoq", "Yugurmoq", "Sakramoq", "Chiqmoq"]}'::jsonb, answer_key = '{"correct_value": "Suzmoq"}'::jsonb, source_ref = 'L10 abilities', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “sariq” mean in English?", "options": ["yellow", "red", "blue", "green"]}'::jsonb, answer_key = '{"correct_value": "yellow"}'::jsonb, source_ref = 'L7 colors games day', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Nice to meet you” mean?", "options": ["Tanishganimdan xursandman", "Xayrli tong", "Yaxshiman, rahmat", "Xayr"]}'::jsonb, answer_key = '{"correct_value": "Tanishganimdan xursandman"}'::jsonb, source_ref = 'L8 introductions', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "It ___ an elephant.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L9 be-verb animals', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "How ___ you?", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "are"}'::jsonb, source_ref = 'L1 be-verb', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "These ___ red apples.", "options": ["are", "is"]}'::jsonb, answer_key = '{"correct_value": "are"}'::jsonb, source_ref = 'L7 plural games day', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "I ___ swim.", "options": ["can", "is"]}'::jsonb, answer_key = '{"correct_value": "can"}'::jsonb, source_ref = 'L10 can', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "I ___ ten years old.", "options": ["am", "is"]}'::jsonb, answer_key = '{"correct_value": "am"}'::jsonb, source_ref = 'L2 be-verb age', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["It red.", "It is red.", "It are red."]}'::jsonb, answer_key = '{"correct_value": "It is red."}'::jsonb, source_ref = 'L3 be-verb correction', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I am twenty years old.", "I am twenty year old.", "I twenty years old."]}'::jsonb, answer_key = '{"correct_value": "I am twenty years old."}'::jsonb, source_ref = 'L5 numbers correction', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "I am ___ student.", "options": ["a", "an"]}'::jsonb, answer_key = '{"correct_value": "a"}'::jsonb, source_ref = 'L8 articles self-intro', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "___ your book.", "options": ["Open", "Opens"]}'::jsonb, answer_key = '{"correct_value": "Open"}'::jsonb, source_ref = 'L4 imperatives', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "___ is your birthday?", "options": ["When", "Who"]}'::jsonb, answer_key = '{"correct_value": "When"}'::jsonb, source_ref = 'L6 question words', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["My", "name", "is", "Ali."]}'::jsonb, answer_key = '{"correct_order": ["My", "name", "is", "Ali."]}'::jsonb, source_ref = 'L1 introductions', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Nice", "to", "meet", "you."]}'::jsonb, answer_key = '{"correct_order": ["Nice", "to", "meet", "you."]}'::jsonb, source_ref = 'L8 introductions', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The sky is ___."}'::jsonb, answer_key = '{"answer": "blue"}'::jsonb, source_ref = 'L3 colors', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Snow is ___."}'::jsonb, answer_key = '{"answer": "white"}'::jsonb, source_ref = 'L3 colors', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "ten", "years", "old."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "ten", "years", "old."]}'::jsonb, source_ref = 'L2 age', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank with a classroom command.", "template": "___ down, please."}'::jsonb, answer_key = '{"answer": "Sit"}'::jsonb, source_ref = 'L4 classroom', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["three", "red", "apples"]}'::jsonb, answer_key = '{"correct_order": ["three", "red", "apples"]}'::jsonb, source_ref = 'L7 games day', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Write the number in words.", "template": "21 is ___."}'::jsonb, answer_key = '{"answer": "twenty-one"}'::jsonb, source_ref = 'L5 numbers', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into Uzbek.", "source_text": "Good morning.", "direction": "en2uz"}'::jsonb, answer_key = '{"target_text": "Xayrli tong"}'::jsonb, source_ref = 'L1 greetings', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Necha yoshdasiz?", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "How old are you?"}'::jsonb, source_ref = 'L2 age', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Suzmoq", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Swim"}'::jsonb, source_ref = 'L10 abilities', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order to fix the question.", "tokens": ["What", "is", "this?"]}'::jsonb, answer_key = '{"correct_order": ["What", "is", "this?"]}'::jsonb, source_ref = 'L6 questions correction', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank with “a” or “an”.", "template": "We say “___ cat”."}'::jsonb, answer_key = '{"answer": "an"}'::jsonb, source_ref = 'L9 articles', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Fil", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Elephant"}'::jsonb, source_ref = 'L9 animals', points = 1
where test_id = (select id from public.online_tests where test_number = 1) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Country” mean?", "options": ["Davlat", "Shahar", "Millat", "Poytaxt"]}'::jsonb, answer_key = '{"correct_value": "Davlat"}'::jsonb, source_ref = 'L11 countries', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Ona” mean in English?", "options": ["Mother", "Father", "Sister", "Daughter"]}'::jsonb, answer_key = '{"correct_value": "Mother"}'::jsonb, source_ref = 'L12 family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Juma” mean in English?", "options": ["Friday", "Thursday", "Saturday", "Monday"]}'::jsonb, answer_key = '{"correct_value": "Friday"}'::jsonb, source_ref = 'L14 weekdays', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each family word with its Uzbek word.", "left": ["kind", "strong", "close", "proud"], "right": ["mehribon", "kuchli", "yaqin", "faxrlanuvchi"]}'::jsonb, answer_key = '{"pairs": [["kind", "mehribon"], ["strong", "kuchli"], ["close", "yaqin"], ["proud", "faxrlanuvchi"]]}'::jsonb, source_ref = 'L18 family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Mehribon” mean in English?", "options": ["Kind", "Happy", "Funny", "Strong"]}'::jsonb, answer_key = '{"correct_value": "Kind"}'::jsonb, source_ref = 'L15 adjectives', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Musiqa” mean in English?", "options": ["Music", "Sport", "Dance", "Read"]}'::jsonb, answer_key = '{"correct_value": "Music"}'::jsonb, source_ref = 'L16 hobbies', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each thing with its Uzbek word.", "left": ["bag", "phone", "bike", "ball"], "right": ["sumka", "telefon", "velosiped", "to''p"]}'::jsonb, answer_key = '{"pairs": [["bag", "sumka"], ["phone", "telefon"], ["bike", "velosiped"], ["ball", "to''p"]]}'::jsonb, source_ref = 'L13 possessions', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Kutubxona” mean in English?", "options": ["Library", "Gym", "Playground", "Classroom"]}'::jsonb, answer_key = '{"correct_value": "Library"}'::jsonb, source_ref = 'L19 school', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Best friend” mean?", "options": ["Eng yaqin do''st", "Sevimli fan", "O''ziga ishongan", "Allaqachon"]}'::jsonb, answer_key = '{"correct_value": "Eng yaqin do''st"}'::jsonb, source_ref = 'L20 friendship', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Qarindosh” mean in English?", "options": ["Relative", "Aunt", "Uncle", "Cousin"]}'::jsonb, answer_key = '{"correct_value": "Relative"}'::jsonb, source_ref = 'L17 relatives', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "I ___ from Uzbekistan.", "options": ["am", "is"]}'::jsonb, answer_key = '{"correct_value": "am"}'::jsonb, source_ref = 'L11 be-from', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Talking about your own uncle: This is ___ amaki.", "options": ["my", "his"]}'::jsonb, answer_key = '{"correct_value": "my"}'::jsonb, source_ref = 'L17 possessives family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "Talking about your own father: This is ___ father.", "options": ["my", "his"]}'::jsonb, answer_key = '{"correct_value": "my"}'::jsonb, source_ref = 'L12 possessives', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "She ___ a bike.", "options": ["have", "has"]}'::jsonb, answer_key = '{"correct_value": "has"}'::jsonb, source_ref = 'L13 have-has', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "I ___ proud of my family.", "options": ["am", "is"]}'::jsonb, answer_key = '{"correct_value": "am"}'::jsonb, source_ref = 'L20 be-verb pride', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "He ___ tall.", "options": ["is", "am"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L15 be-verb', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "I ___ to dance.", "options": ["like", "likes"]}'::jsonb, answer_key = '{"correct_value": "like"}'::jsonb, source_ref = 'L16 like', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "I ___ English on Monday.", "options": ["have", "has"]}'::jsonb, answer_key = '{"correct_value": "have"}'::jsonb, source_ref = 'L19 have', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["today is monday.", "Today is Monday.", "Today is monday."]}'::jsonb, answer_key = '{"correct_value": "Today is Monday."}'::jsonb, source_ref = 'L14 capitalization correction', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "My mother ___ kind.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L18 be-verb family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "from", "Uzbekistan."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "from", "Uzbekistan."]}'::jsonb, source_ref = 'L11 countries', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["This", "is", "my", "mother."]}'::jsonb, answer_key = '{"correct_order": ["This", "is", "my", "mother."]}'::jsonb, source_ref = 'L12 family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The day after Sunday is ___."}'::jsonb, answer_key = '{"answer": "Monday"}'::jsonb, source_ref = 'L14 weekdays', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The opposite of “tall” is ___."}'::jsonb, answer_key = '{"answer": "short"}'::jsonb, source_ref = 'L15 opposites', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["This", "is", "my", "uncle."]}'::jsonb, answer_key = '{"correct_order": ["This", "is", "my", "uncle."]}'::jsonb, source_ref = 'L17 family tree', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "We read books in the ___."}'::jsonb, answer_key = '{"answer": "library"}'::jsonb, source_ref = 'L19 school', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["He", "has", "a", "dog."]}'::jsonb, answer_key = '{"correct_order": ["He", "has", "a", "dog."]}'::jsonb, source_ref = 'L13 have-has', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I am ___ of my school."}'::jsonb, answer_key = '{"answer": "proud"}'::jsonb, source_ref = 'L20 pride', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Angliya", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "England"}'::jsonb, source_ref = 'L11 countries', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Ona", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Mother"}'::jsonb, source_ref = 'L12 family', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Birga", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Together"}'::jsonb, source_ref = 'L18 togetherness', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["He", "has", "a", "bike."]}'::jsonb, answer_key = '{"correct_order": ["He", "has", "a", "bike."]}'::jsonb, source_ref = 'L13 have-has', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Sevimli", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Favorite"}'::jsonb, source_ref = 'L16 hobbies', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Maktab", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "School"}'::jsonb, source_ref = 'L19 school', points = 1
where test_id = (select id from public.online_tests where test_number = 2) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Band” mean in English?", "options": ["Busy", "Free", "Early", "Late"]}'::jsonb, answer_key = '{"correct_value": "Busy"}'::jsonb, source_ref = 'L28 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Yarim” mean in English?", "options": ["Half past", "Quarter past", "Quarter to", "O''clock"]}'::jsonb, answer_key = '{"correct_value": "Half past"}'::jsonb, source_ref = 'L22 time', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Non” mean in English?", "options": ["Bread", "Rice", "Milk", "Cheese"]}'::jsonb, answer_key = '{"correct_value": "Bread"}'::jsonb, source_ref = 'L23 food', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each weather word with its Uzbek word.", "left": ["Sunny", "Rainy", "Snowy", "Windy"], "right": ["Quyoshli", "Yomg''irli", "Qorli", "Shamolli"]}'::jsonb, answer_key = '{"pairs": [["Sunny", "Quyoshli"], ["Rainy", "Yomg''irli"], ["Snowy", "Qorli"], ["Windy", "Shamolli"]]}'::jsonb, source_ref = 'L26 weather', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Och” mean in English?", "options": ["Hungry", "Thirsty", "Delicious", "Please"]}'::jsonb, answer_key = '{"correct_value": "Hungry"}'::jsonb, source_ref = 'L24 restaurant', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Arzon” mean in English?", "options": ["Cheap", "Expensive", "Price", "Dress"]}'::jsonb, answer_key = '{"correct_value": "Cheap"}'::jsonb, source_ref = 'L25 clothes', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each room with its Uzbek word.", "left": ["Kitchen", "Bedroom", "Garden", "Bathroom"], "right": ["Oshxona", "Yotoqxona", "Bog''", "Hammomxona"]}'::jsonb, answer_key = '{"pairs": [["Kitchen", "Oshxona"], ["Bedroom", "Yotoqxona"], ["Garden", "Bog''"], ["Bathroom", "Hammomxona"]]}'::jsonb, source_ref = 'L29 rooms', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Odatda” mean in English?", "options": ["Usually", "Sometimes", "Always", "Never"]}'::jsonb, answer_key = '{"correct_value": "Usually"}'::jsonb, source_ref = 'L28 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Qarsak chalmoq” mean in English?", "options": ["Clap", "Skip", "Stretch", "Spin around"]}'::jsonb, answer_key = '{"correct_value": "Clap"}'::jsonb, source_ref = 'L27 actions', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “mirror” mean in Uzbek?", "options": ["Oyna", "Stol", "Shkaf", "Gilam"]}'::jsonb, answer_key = '{"correct_value": "Oyna"}'::jsonb, source_ref = 'L30 furniture', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "I ___ up at 7.", "options": ["wake", "wakes"]}'::jsonb, answer_key = '{"correct_value": "wake"}'::jsonb, source_ref = 'L21 routine', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["Half past three.", "It''s half past three.", "Is half past three."]}'::jsonb, answer_key = '{"correct_value": "It''s half past three."}'::jsonb, source_ref = 'L22 time correction', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "I ___ like milk.", "options": ["don''t", "isn''t"]}'::jsonb, answer_key = '{"correct_value": "don''t"}'::jsonb, source_ref = 'L23 likes', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I no like milk.", "I don''t like milk.", "I doesn''t like milk."]}'::jsonb, answer_key = '{"correct_value": "I don''t like milk."}'::jsonb, source_ref = 'L23 likes correction', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "They ___ stretch.", "options": ["can", "cans"]}'::jsonb, answer_key = '{"correct_value": "can"}'::jsonb, source_ref = 'L27 actions', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "___ shoes are new.", "options": ["This", "These"]}'::jsonb, answer_key = '{"correct_value": "These"}'::jsonb, source_ref = 'L25 demonstratives', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "There ___ a kitchen.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L29 there-is', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "There ___ two bedrooms.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "are"}'::jsonb, source_ref = 'L29 there-are', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "___ sunny today.", "options": ["It''s", "Is"]}'::jsonb, answer_key = '{"correct_value": "It''s"}'::jsonb, source_ref = 'L26 weather', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I wake up 7.", "I wake up at 7.", "I wakes up at 7."]}'::jsonb, answer_key = '{"correct_value": "I wake up at 7."}'::jsonb, source_ref = 'L21 routine correction', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "wake", "up", "at", "7."]}'::jsonb, answer_key = '{"correct_order": ["I", "wake", "up", "at", "7."]}'::jsonb, source_ref = 'L21 routine', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["What", "time", "is", "it?"]}'::jsonb, answer_key = '{"correct_order": ["What", "time", "is", "it?"]}'::jsonb, source_ref = 'L22 time', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Can I have rice, ___?"}'::jsonb, answer_key = '{"answer": "please"}'::jsonb, source_ref = 'L24 restaurant', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The opposite of “expensive” is ___."}'::jsonb, answer_key = '{"answer": "cheap"}'::jsonb, source_ref = 'L25 opposites', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "usually", "wake", "up", "at", "7."]}'::jsonb, answer_key = '{"correct_order": ["I", "usually", "wake", "up", "at", "7."]}'::jsonb, source_ref = 'L28 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "There ___ two windows."}'::jsonb, answer_key = '{"answer": "are"}'::jsonb, source_ref = 'L29 there-are', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Touch", "your", "toes."]}'::jsonb, answer_key = '{"correct_order": ["Touch", "your", "toes."]}'::jsonb, source_ref = 'L27 actions', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Sit", "on", "the", "sofa."]}'::jsonb, answer_key = '{"correct_order": ["Sit", "on", "the", "sofa."]}'::jsonb, source_ref = 'L30 furniture', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Uyg''onmoq", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Wake up"}'::jsonb, source_ref = 'L21 routine', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Ertalab", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Morning"}'::jsonb, source_ref = 'L22 time', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Suv", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Water"}'::jsonb, source_ref = 'L23 food', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Can", "I", "have", "water,", "please."]}'::jsonb, answer_key = '{"correct_order": ["Can", "I", "have", "water,", "please."]}'::jsonb, source_ref = 'L24 restaurant correction', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Gilam", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "carpet"}'::jsonb, source_ref = 'L30 furniture', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Yoz", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Summer"}'::jsonb, source_ref = 'L26 seasons', points = 1
where test_id = (select id from public.online_tests where test_number = 3) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Tagida” mean in English?", "options": ["under", "in", "on", "next to"]}'::jsonb, answer_key = '{"correct_value": "under"}'::jsonb, source_ref = 'L31 prepositions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Bozor” mean in English?", "options": ["market", "shop", "street", "bank"]}'::jsonb, answer_key = '{"correct_value": "market"}'::jsonb, source_ref = 'L32 neighborhood', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Match each review word with its Uzbek word.", "left": ["Routine", "Furniture", "Price", "Street"], "right": ["Tartib", "Mebel", "Narx", "Ko''cha"]}'::jsonb, answer_key = '{"pairs": [["Routine", "Tartib"], ["Furniture", "Mebel"], ["Price", "Narx"], ["Street", "Ko''cha"]]}'::jsonb, source_ref = 'L40 review', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"question": "What does “Xarita” mean in English?", "options": ["map", "corner", "stop", "left"]}'::jsonb, answer_key = '{"correct_value": "map"}'::jsonb, source_ref = 'L36 directions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Ming” mean in English?", "options": ["thousand", "hundred", "money", "price"]}'::jsonb, answer_key = '{"correct_value": "thousand"}'::jsonb, source_ref = 'L39 numbers', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Ko''cha” mean in English?", "options": ["street", "map", "corner", "shop"]}'::jsonb, answer_key = '{"correct_value": "street"}'::jsonb, source_ref = 'L37 map', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each furniture word with its Uzbek word.", "left": ["Shelf", "Mirror", "Carpet", "Wardrobe"], "right": ["Tokcha", "Oyna", "Gilam", "Shkaf"]}'::jsonb, answer_key = '{"pairs": [["Shelf", "Tokcha"], ["Mirror", "Oyna"], ["Carpet", "Gilam"], ["Wardrobe", "Shkaf"]]}'::jsonb, source_ref = 'L33 furniture', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Mahalla” mean in English?", "options": ["neighborhood", "house", "street", "park"]}'::jsonb, answer_key = '{"correct_value": "neighborhood"}'::jsonb, source_ref = 'L38 town', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “furniture” mean in Uzbek?", "options": ["Mebel", "Mahalla", "Narx", "Ko''cha"]}'::jsonb, answer_key = '{"correct_value": "Mebel"}'::jsonb, source_ref = 'L40 review', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Burchak” mean in English?", "options": ["corner", "street", "map", "straight"]}'::jsonb, answer_key = '{"correct_value": "corner"}'::jsonb, source_ref = 'L37 map', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "Where ___ your books?", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "are"}'::jsonb, source_ref = 'L31 where', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "There ___ two sofas.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "are"}'::jsonb, source_ref = 'L33 furniture', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "The hospital is far ___ the school.", "options": ["from", "at"]}'::jsonb, answer_key = '{"correct_value": "from"}'::jsonb, source_ref = 'L32 far', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["The cat is under of the table.", "The cat is under the table.", "The cat is under a table."]}'::jsonb, answer_key = '{"correct_value": "The cat is under the table."}'::jsonb, source_ref = 'L34 prepositions correction', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "There ___ a clock on the wall.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L35 there-is', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["There is two pictures.", "There are two pictures.", "There are two picture."]}'::jsonb, answer_key = '{"correct_value": "There are two pictures."}'::jsonb, source_ref = 'L35 there-are correction', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "___ left at the bank.", "options": ["Turn", "Go"]}'::jsonb, answer_key = '{"correct_value": "Turn"}'::jsonb, source_ref = 'L36 directions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "The bank is ___ the corner.", "options": ["on", "at"]}'::jsonb, answer_key = '{"correct_value": "on"}'::jsonb, source_ref = 'L38 town', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["How much it is?", "How much is it?", "How much are it?"]}'::jsonb, answer_key = '{"correct_value": "How much is it?"}'::jsonb, source_ref = 'L39 prices correction', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["There are a bed.", "There is a bed.", "There is a beds."]}'::jsonb, answer_key = '{"correct_value": "There is a bed."}'::jsonb, source_ref = 'L33 there-is correction', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Where", "is", "the", "lamp?"]}'::jsonb, answer_key = '{"correct_order": ["Where", "is", "the", "lamp?"]}'::jsonb, source_ref = 'L31 where', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["There", "is", "a", "park", "near", "my", "house."]}'::jsonb, answer_key = '{"correct_order": ["There", "is", "a", "park", "near", "my", "house."]}'::jsonb, source_ref = 'L32 neighborhood', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The picture is ___ the wall."}'::jsonb, answer_key = '{"answer": "on"}'::jsonb, source_ref = 'L34 prepositions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Go ___ for one block."}'::jsonb, answer_key = '{"answer": "straight"}'::jsonb, source_ref = 'L36 directions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "ticket", "costs", "two", "thousand", "som."]}'::jsonb, answer_key = '{"correct_order": ["The", "ticket", "costs", "two", "thousand", "som."]}'::jsonb, source_ref = 'L39 prices', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "There ___ blue curtains on the window."}'::jsonb, answer_key = '{"answer": "are"}'::jsonb, source_ref = 'L35 room', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "shop", "is", "near", "the", "school."]}'::jsonb, answer_key = '{"correct_order": ["The", "shop", "is", "near", "the", "school."]}'::jsonb, source_ref = 'L38 town', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Excuse me, ___ is the bank?"}'::jsonb, answer_key = '{"answer": "where"}'::jsonb, source_ref = 'L37 directions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Mushuk stul tagida.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "The cat is under the chair."}'::jsonb, source_ref = 'L31 prepositions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Kitob qancha turadi?", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "How much is the book?"}'::jsonb, source_ref = 'L39 prices', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Qalam kitob ustida.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "The pencil is on the book."}'::jsonb, source_ref = 'L34 prepositions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Turn", "left", "at", "the", "shop."]}'::jsonb, answer_key = '{"correct_order": ["Turn", "left", "at", "the", "shop."]}'::jsonb, source_ref = 'L36 directions', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Devor", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "wall"}'::jsonb, source_ref = 'L35 room', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Tartib", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Routine"}'::jsonb, source_ref = 'L40 review', points = 1
where test_id = (select id from public.online_tests where test_number = 4) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Qoldi” mean in English?", "options": ["stayed", "went out", "got up", "yesterday"]}'::jsonb, answer_key = '{"correct_value": "stayed"}'::jsonb, source_ref = 'L48 yesterday', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Bordi” mean in English?", "options": ["went", "saw", "came", "took"]}'::jsonb, answer_key = '{"correct_value": "went"}'::jsonb, source_ref = 'L42 irregular verbs', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Shakar” mean in English?", "options": ["sugar", "rice", "milk", "cheese"]}'::jsonb, answer_key = '{"correct_value": "sugar"}'::jsonb, source_ref = 'L43 food', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each job with its Uzbek word.", "left": ["doctor", "teacher", "nurse", "driver"], "right": ["Shifokor", "O''qituvchi", "Hamshira", "Haydovchi"]}'::jsonb, answer_key = '{"pairs": [["doctor", "Shifokor"], ["teacher", "O''qituvchi"], ["nurse", "Hamshira"], ["driver", "Haydovchi"]]}'::jsonb, source_ref = 'L46 jobs', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Quti” mean in English?", "options": ["box", "bottle", "packet", "litre"]}'::jsonb, answer_key = '{"correct_value": "box"}'::jsonb, source_ref = 'L44 containers', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Chek” mean in English?", "options": ["receipt", "cashier", "discount", "bag"]}'::jsonb, answer_key = '{"correct_value": "receipt"}'::jsonb, source_ref = 'L45 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each action with its Uzbek word.", "left": ["reading", "running", "eating", "writing"], "right": ["O''qimoqda", "Yugurmoqda", "Yemoqda", "Yozmoqda"]}'::jsonb, answer_key = '{"pairs": [["reading", "O''qimoqda"], ["running", "Yugurmoqda"], ["eating", "Yemoqda"], ["writing", "Yozmoqda"]]}'::jsonb, source_ref = 'L49 continuous', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Kecha oqshom” mean in English?", "options": ["last night", "yesterday", "last week", "stayed"]}'::jsonb, answer_key = '{"correct_value": "last night"}'::jsonb, source_ref = 'L48 yesterday', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Reja” mean in English?", "options": ["plan", "visit", "buy", "meet"]}'::jsonb, answer_key = '{"correct_value": "plan"}'::jsonb, source_ref = 'L50 plans', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Qaytim” mean in English?", "options": ["change", "discount", "receipt", "cashier"]}'::jsonb, answer_key = '{"correct_value": "change"}'::jsonb, source_ref = 'L47 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "I ___ football yesterday.", "options": ["played", "play"]}'::jsonb, answer_key = '{"correct_value": "played"}'::jsonb, source_ref = 'L41 past simple', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I play football yesterday.", "I played football yesterday.", "I plays football yesterday."]}'::jsonb, answer_key = '{"correct_value": "I played football yesterday."}'::jsonb, source_ref = 'L41 past correction', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "She ___ her friend at school.", "options": ["saw", "see"]}'::jsonb, answer_key = '{"correct_value": "saw"}'::jsonb, source_ref = 'L42 irregular', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I have any bread.", "I have some bread.", "I has some bread."]}'::jsonb, answer_key = '{"correct_value": "I have some bread."}'::jsonb, source_ref = 'L43 some-any correction', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "I''d ___ a kilo of apples, please.", "options": ["like", "want"]}'::jsonb, answer_key = '{"correct_value": "like"}'::jsonb, source_ref = 'L45 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["How much apples are there?", "How many apples are there?", "How many apples is there?"]}'::jsonb, answer_key = '{"correct_value": "How many apples are there?"}'::jsonb, source_ref = 'L44 how-many correction', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What ___ your father do?", "options": ["does", "do"]}'::jsonb, answer_key = '{"correct_value": "does"}'::jsonb, source_ref = 'L46 jobs', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "She ___ cooking dinner.", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L49 continuous', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "I ___ going to study.", "options": ["am", "is"]}'::jsonb, answer_key = '{"correct_value": "am"}'::jsonb, source_ref = 'L50 going-to', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I going to study.", "I am going to study.", "I is going to study."]}'::jsonb, answer_key = '{"correct_value": "I am going to study."}'::jsonb, source_ref = 'L50 going-to correction', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "played", "football", "yesterday."]}'::jsonb, answer_key = '{"correct_order": ["I", "played", "football", "yesterday."]}'::jsonb, source_ref = 'L41 past simple', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "went", "to", "the", "market", "yesterday."]}'::jsonb, answer_key = '{"correct_order": ["I", "went", "to", "the", "market", "yesterday."]}'::jsonb, source_ref = 'L42 irregular', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "There aren''t ___ eggs."}'::jsonb, answer_key = '{"answer": "any"}'::jsonb, source_ref = 'L43 some-any', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "___ I have a bottle of milk?"}'::jsonb, answer_key = '{"answer": "Can"}'::jsonb, source_ref = 'L45 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["What", "does", "your", "father", "do?"]}'::jsonb, answer_key = '{"correct_order": ["What", "does", "your", "father", "do?"]}'::jsonb, source_ref = 'L46 jobs', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the past verb.", "template": "Last week we ___ (go) to Tashkent."}'::jsonb, answer_key = '{"answer": "went"}'::jsonb, source_ref = 'L48 yesterday', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I''d", "like", "a", "bag,", "please."]}'::jsonb, answer_key = '{"correct_order": ["I''d", "like", "a", "bag,", "please."]}'::jsonb, source_ref = 'L47 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "going", "to", "study."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "going", "to", "study."]}'::jsonb, source_ref = 'L50 going-to', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Mana qaytimingiz.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Here''s your change."}'::jsonb, source_ref = 'L47 supermarket', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Kecha bozorga bordim.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "I went to the market yesterday."}'::jsonb, source_ref = 'L42 irregular', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Nechta tuxum bor?", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "How many eggs are there?"}'::jsonb, source_ref = 'L44 how-many', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order to fix the sentence.", "tokens": ["She", "is", "cooking", "dinner."]}'::jsonb, answer_key = '{"correct_order": ["She", "is", "cooking", "dinner."]}'::jsonb, source_ref = 'L49 continuous correction', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Shifokor", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "doctor"}'::jsonb, source_ref = 'L46 jobs', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Bir oz", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "a little"}'::jsonb, source_ref = 'L44 quantities', points = 1
where test_id = (select id from public.online_tests where test_number = 5) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Sayil” mean in English?", "options": ["picnic", "concert", "ticket", "together"]}'::jsonb, answer_key = '{"correct_value": "picnic"}'::jsonb, source_ref = 'L54 plans', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Shaxmat o''ynamoq” mean in English?", "options": ["play chess", "play games", "watch movies", "read comics"]}'::jsonb, answer_key = '{"correct_value": "play chess"}'::jsonb, source_ref = 'L52 free time', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Zerikarli” mean in English?", "options": ["boring", "hobby", "usually", "sometimes"]}'::jsonb, answer_key = '{"correct_value": "boring"}'::jsonb, source_ref = 'L55 free time', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each frequency word with its Uzbek word.", "left": ["always", "usually", "sometimes", "never"], "right": ["Har doim", "Odatda", "Ba''zan", "Hech qachon"]}'::jsonb, answer_key = '{"pairs": [["always", "Har doim"], ["usually", "Odatda"], ["sometimes", "Ba''zan"], ["never", "Hech qachon"]]}'::jsonb, source_ref = 'L57 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Bilet” mean in English?", "options": ["ticket", "picnic", "concert", "together"]}'::jsonb, answer_key = '{"correct_value": "ticket"}'::jsonb, source_ref = 'L54 plans', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Bo''sh vaqt” mean in English?", "options": ["free time", "every day", "usually", "sometimes"]}'::jsonb, answer_key = '{"correct_value": "free time"}'::jsonb, source_ref = 'L55 free time', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each trip word with its Uzbek word.", "left": ["mountain", "lake", "map", "backpack"], "right": ["Tog''", "Ko''l", "Xarita", "Ryukzak"]}'::jsonb, answer_key = '{"pairs": [["mountain", "Tog''"], ["lake", "Ko''l"], ["map", "Xarita"], ["backpack", "Ryukzak"]]}'::jsonb, source_ref = 'L59 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Uy vazifasi” mean in English?", "options": ["homework", "class", "sports", "weekend"]}'::jsonb, answer_key = '{"correct_value": "homework"}'::jsonb, source_ref = 'L58 week', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Takrorlash” mean in English?", "options": ["review", "remember", "happen", "plan"]}'::jsonb, answer_key = '{"correct_value": "review"}'::jsonb, source_ref = 'L60 review', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Eslab qolmoq” mean in English?", "options": ["remember", "happen", "review", "plan"]}'::jsonb, answer_key = '{"correct_value": "remember"}'::jsonb, source_ref = 'L60 review', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "This phone is ___ expensive than that one.", "options": ["more", "most"]}'::jsonb, answer_key = '{"correct_value": "more"}'::jsonb, source_ref = 'L51 comparatives', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which is correct?", "options": ["more big", "bigger", "more bigger"]}'::jsonb, answer_key = '{"correct_value": "bigger"}'::jsonb, source_ref = 'L51 comparatives correction', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "I like ___ chess.", "options": ["playing", "play"]}'::jsonb, answer_key = '{"correct_value": "playing"}'::jsonb, source_ref = 'L52 like-ing', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Would you like ___ come?", "options": ["to", "for"]}'::jsonb, answer_key = '{"correct_value": "to"}'::jsonb, source_ref = 'L53 invitations', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["Would you like come?", "Would you like to come?", "Would you like coming?"]}'::jsonb, answer_key = '{"correct_value": "Would you like to come?"}'::jsonb, source_ref = 'L53 invitations correction', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "___ Friday I go to the club.", "options": ["On", "In"]}'::jsonb, answer_key = '{"correct_value": "On"}'::jsonb, source_ref = 'L58 week', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I do always my homework.", "I always do my homework.", "I always does my homework."]}'::jsonb, answer_key = '{"correct_value": "I always do my homework."}'::jsonb, source_ref = 'L57 frequency correction', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "___ Monday I go to school.", "options": ["On", "In"]}'::jsonb, answer_key = '{"correct_value": "On"}'::jsonb, source_ref = 'L58 on-days', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "She ___ a film.", "options": ["watched", "watch"]}'::jsonb, answer_key = '{"correct_value": "watched"}'::jsonb, source_ref = 'L56 past simple', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "We''re going to ___ camping.", "options": ["go", "going"]}'::jsonb, answer_key = '{"correct_value": "go"}'::jsonb, source_ref = 'L59 going-to', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["A", "car", "is", "faster."]}'::jsonb, answer_key = '{"correct_order": ["A", "car", "is", "faster."]}'::jsonb, source_ref = 'L51 comparatives', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "like", "playing", "chess."]}'::jsonb, answer_key = '{"correct_order": ["I", "like", "playing", "chess."]}'::jsonb, source_ref = 'L52 like-ing', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "We''re going to ___ a picnic."}'::jsonb, answer_key = '{"answer": "have"}'::jsonb, source_ref = 'L54 plans', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the -ing form.", "template": "I like ___ (swim)."}'::jsonb, answer_key = '{"answer": "swimming"}'::jsonb, source_ref = 'L55 like-ing', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["On", "Saturday", "I", "went", "fishing."]}'::jsonb, answer_key = '{"correct_order": ["On", "Saturday", "I", "went", "fishing."]}'::jsonb, source_ref = 'L56 weekend', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "She is ___ on time."}'::jsonb, answer_key = '{"answer": "always"}'::jsonb, source_ref = 'L57 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "going", "to", "take", "photos."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "going", "to", "take", "photos."]}'::jsonb, source_ref = 'L59 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the past verb.", "template": "The past of “buy” is ___."}'::jsonb, answer_key = '{"answer": "bought"}'::jsonb, source_ref = 'L60 review', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Kattaroq", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "bigger"}'::jsonb, source_ref = 'L51 comparatives', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the -ing form.", "template": "She loves ___ (dance)."}'::jsonb, answer_key = '{"answer": "dancing"}'::jsonb, source_ref = 'L52 like-ing', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Would", "you", "like", "to", "come?"]}'::jsonb, answer_key = '{"correct_order": ["Would", "you", "like", "to", "come?"]}'::jsonb, source_ref = 'L53 invitations correction', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["On", "Sunday", "I", "watched", "a", "film."]}'::jsonb, answer_key = '{"correct_order": ["On", "Sunday", "I", "watched", "a", "film."]}'::jsonb, source_ref = 'L56 past correction', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I ___ (never) eat candy in the morning."}'::jsonb, answer_key = '{"answer": "never"}'::jsonb, source_ref = 'L57 frequency', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I''m going to take ___."}'::jsonb, answer_key = '{"answer": "photos"}'::jsonb, source_ref = 'L59 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 6) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Sovg''a” mean in English?", "options": ["gift", "tradition", "guest", "invite"]}'::jsonb, answer_key = '{"correct_value": "gift"}'::jsonb, source_ref = 'L61 holidays', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Poyezd” mean in English?", "options": ["train", "plane", "bus", "ticket"]}'::jsonb, answer_key = '{"correct_value": "train"}'::jsonb, source_ref = 'L62 travel', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Bojxona” mean in English?", "options": ["customs", "security", "gate", "delayed"]}'::jsonb, answer_key = '{"correct_value": "customs"}'::jsonb, source_ref = 'L63 airport', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each health word with its Uzbek word.", "left": ["healthy", "sleep", "fresh", "habit"], "right": ["Sog''lom", "Uyqu", "Yangi", "Odat"]}'::jsonb, answer_key = '{"pairs": [["healthy", "Sog''lom"], ["sleep", "Uyqu"], ["fresh", "Yangi"], ["habit", "Odat"]]}'::jsonb, source_ref = 'L69 health', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Nihoyat” mean in English?", "options": ["finally", "first", "then", "after that"]}'::jsonb, answer_key = '{"correct_value": "finally"}'::jsonb, source_ref = 'L64 sequencing', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Sokin” mean in English?", "options": ["quiet", "crowded", "modern", "ancient"]}'::jsonb, answer_key = '{"correct_value": "quiet"}'::jsonb, source_ref = 'L65 cities', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each feeling with its Uzbek word.", "left": ["happy", "sad", "angry", "tired"], "right": ["Xursand", "G''amgin", "Jahli chiqqan", "Charchagan"]}'::jsonb, answer_key = '{"pairs": [["happy", "Xursand"], ["sad", "G''amgin"], ["angry", "Jahli chiqqan"], ["tired", "Charchagan"]]}'::jsonb, source_ref = 'L70 feelings', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “To''y” mean in English?", "options": ["wedding", "culture", "ceremony", "respect"]}'::jsonb, answer_key = '{"correct_value": "wedding"}'::jsonb, source_ref = 'L66 traditions', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Kirish to''lovi” mean in English?", "options": ["entrance fee", "budget", "schedule", "guide"]}'::jsonb, answer_key = '{"correct_value": "entrance fee"}'::jsonb, source_ref = 'L67 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Dengiz qirg''og''i” mean in English?", "options": ["beach", "rest", "memories", "enjoy"]}'::jsonb, answer_key = '{"correct_value": "beach"}'::jsonb, source_ref = 'L68 holiday', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "How ___ you celebrate Nowruz?", "options": ["do", "does"]}'::jsonb, answer_key = '{"correct_value": "do"}'::jsonb, source_ref = 'L61 holidays', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["How you celebrate Nowruz?", "How do you celebrate Nowruz?", "How does you celebrate Nowruz?"]}'::jsonb, answer_key = '{"correct_value": "How do you celebrate Nowruz?"}'::jsonb, source_ref = 'L61 holidays correction', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "We travel ___ plane.", "options": ["by", "on"]}'::jsonb, answer_key = '{"correct_value": "by"}'::jsonb, source_ref = 'L62 travel', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Where ___ the check-in desk?", "options": ["is", "are"]}'::jsonb, answer_key = '{"correct_value": "is"}'::jsonb, source_ref = 'L63 airport', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "This is ___ city.", "options": ["the oldest", "older"]}'::jsonb, answer_key = '{"correct_value": "the oldest"}'::jsonb, source_ref = 'L65 cities', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Which is correct?", "options": ["the more biggest", "the biggest", "most biggest"]}'::jsonb, answer_key = '{"correct_value": "the biggest"}'::jsonb, source_ref = 'L65 cities correction', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "___ we packed our bags.", "options": ["First", "Finally"]}'::jsonb, answer_key = '{"correct_value": "First"}'::jsonb, source_ref = 'L64 sequencing', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["You should to eat fruit.", "You should eat fruit.", "You should eating fruit."]}'::jsonb, answer_key = '{"correct_value": "You should eat fruit."}'::jsonb, source_ref = 'L69 health correction', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "I am ___ before the exam.", "options": ["nervous", "happy"]}'::jsonb, answer_key = '{"correct_value": "nervous"}'::jsonb, source_ref = 'L70 feelings', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "It is ___ tradition to greet guests.", "options": ["a", "the"]}'::jsonb, answer_key = '{"correct_value": "a"}'::jsonb, source_ref = 'L66 traditions', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "train", "departs", "at", "8:30."]}'::jsonb, answer_key = '{"correct_order": ["The", "train", "departs", "at", "8:30."]}'::jsonb, source_ref = 'L62 travel', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["First", "we", "bought", "tickets."]}'::jsonb, answer_key = '{"correct_order": ["First", "we", "bought", "tickets."]}'::jsonb, source_ref = 'L64 sequencing', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The flight is ___."}'::jsonb, answer_key = '{"answer": "delayed"}'::jsonb, source_ref = 'L63 airport', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "A ___ will show us around."}'::jsonb, answer_key = '{"answer": "guide"}'::jsonb, source_ref = 'L67 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "happy", "because", "I", "passed."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "happy", "because", "I", "passed."]}'::jsonb, source_ref = 'L70 feelings', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "We ___ our guests."}'::jsonb, answer_key = '{"answer": "welcome"}'::jsonb, source_ref = 'L66 traditions', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "The ___ fee is 10,000 som."}'::jsonb, answer_key = '{"answer": "entrance"}'::jsonb, source_ref = 'L67 trip', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the past verb.", "template": "We ___ (go) to the beach."}'::jsonb, answer_key = '{"answer": "went"}'::jsonb, source_ref = 'L68 holiday', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Navro''zni qanday nishonlaysiz?", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "How do you celebrate Nowruz?"}'::jsonb, source_ref = 'L61 holidays', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Poyezd 8:30 da jo''naydi.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "The train departs at 8:30."}'::jsonb, source_ref = 'L62 travel', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Menda ajoyib xotiralar bor.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "I have wonderful memories."}'::jsonb, source_ref = 'L68 holiday', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["It", "is", "a", "tradition", "to", "eat", "plov."]}'::jsonb, answer_key = '{"correct_order": ["It", "is", "a", "tradition", "to", "eat", "plov."]}'::jsonb, source_ref = 'L66 traditions correction', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Ko''proq suv ichishingiz kerak.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "You should drink more water."}'::jsonb, source_ref = 'L69 health', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Xavotirlangan", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "worried"}'::jsonb, source_ref = 'L70 feelings', points = 1
where test_id = (select id from public.online_tests where test_number = 7) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Tizza” mean in English?", "options": ["knee", "shoulder", "arm", "hand"]}'::jsonb, answer_key = '{"correct_value": "knee"}'::jsonb, source_ref = 'L71 body', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Isitma” mean in English?", "options": ["fever", "cough", "medicine", "headache"]}'::jsonb, answer_key = '{"correct_value": "fever"}'::jsonb, source_ref = 'L72 illness', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Match each clinic word with its Uzbek word.", "left": ["patient", "receptionist", "prescription", "pharmacy"], "right": ["Bemor", "Registrator", "Retsept", "Dorixona"]}'::jsonb, answer_key = '{"pairs": [["patient", "Bemor"], ["receptionist", "Registrator"], ["prescription", "Retsept"], ["pharmacy", "Dorixona"]]}'::jsonb, source_ref = 'L73 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"question": "What does “Tez yordam” mean in English?", "options": ["ambulance", "fire", "danger", "help"]}'::jsonb, answer_key = '{"correct_value": "ambulance"}'::jsonb, source_ref = 'L74 emergencies', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Orzu” mean in English?", "options": ["dream", "career", "scientist", "useful"]}'::jsonb, answer_key = '{"correct_value": "dream"}'::jsonb, source_ref = 'L77 careers', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Forma” mean in English?", "options": ["uniform", "duty", "meeting", "colleague"]}'::jsonb, answer_key = '{"correct_value": "uniform"}'::jsonb, source_ref = 'L78 work', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each work word with its Uzbek word.", "left": ["salary", "experience", "skills", "employee"], "right": ["Maosh", "Tajriba", "Mahoratlar", "Xodim"]}'::jsonb, answer_key = '{"pairs": [["salary", "Maosh"], ["experience", "Tajriba"], ["skills", "Mahoratlar"], ["employee", "Xodim"]]}'::jsonb, source_ref = 'L79 interview', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Maslahat” mean in English?", "options": ["advice", "healthy", "energy", "lifestyle"]}'::jsonb, answer_key = '{"correct_value": "advice"}'::jsonb, source_ref = 'L76 health', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Maqsad” mean in English?", "options": ["goal", "achievement", "progress", "experience"]}'::jsonb, answer_key = '{"correct_value": "goal"}'::jsonb, source_ref = 'L80 review', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Kutish xonasi” mean in English?", "options": ["waiting room", "patient", "nurse", "pharmacist"]}'::jsonb, answer_key = '{"correct_value": "waiting room"}'::jsonb, source_ref = 'L75 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "My head ___.", "options": ["hurts", "hurt"]}'::jsonb, answer_key = '{"correct_value": "hurts"}'::jsonb, source_ref = 'L71 body', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What''s the ___?", "options": ["problem", "problems"]}'::jsonb, answer_key = '{"correct_value": "problem"}'::jsonb, source_ref = 'L73 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "I have ___ fever.", "options": ["a", "the"]}'::jsonb, answer_key = '{"correct_value": "a"}'::jsonb, source_ref = 'L72 illness', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I have headache.", "I have a headache.", "I have an headache."]}'::jsonb, answer_key = '{"correct_value": "I have a headache."}'::jsonb, source_ref = 'L72 illness correction', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "You ___ call 103.", "options": ["must", "mustn''t"]}'::jsonb, answer_key = '{"correct_value": "must"}'::jsonb, source_ref = 'L74 emergencies', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["You must to call.", "You must call.", "You must calling."]}'::jsonb, answer_key = '{"correct_value": "You must call."}'::jsonb, source_ref = 'L74 emergencies correction', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "I want ___ be a doctor.", "options": ["to", "-"]}'::jsonb, answer_key = '{"correct_value": "to"}'::jsonb, source_ref = 'L77 careers', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "She ___ wear a uniform.", "options": ["has to", "have to"]}'::jsonb, answer_key = '{"correct_value": "has to"}'::jsonb, source_ref = 'L78 work', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What ___ are you good at?", "options": ["skills", "skill"]}'::jsonb, answer_key = '{"correct_value": "skills"}'::jsonb, source_ref = 'L79 interview', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "I want to ___ my English.", "options": ["improve", "improvement"]}'::jsonb, answer_key = '{"correct_value": "improve"}'::jsonb, source_ref = 'L80 review', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["My", "head", "hurts."]}'::jsonb, answer_key = '{"correct_order": ["My", "head", "hurts."]}'::jsonb, source_ref = 'L71 body', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Take one ___ twice a day."}'::jsonb, answer_key = '{"answer": "tablet"}'::jsonb, source_ref = 'L73 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "You ___ touch the fire."}'::jsonb, answer_key = '{"answer": "mustn''t"}'::jsonb, source_ref = 'L74 emergencies', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "want", "to", "be", "a", "doctor."]}'::jsonb, answer_key = '{"correct_order": ["I", "want", "to", "be", "a", "doctor."]}'::jsonb, source_ref = 'L77 careers', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "have", "to", "wear", "a", "uniform."]}'::jsonb, answer_key = '{"correct_order": ["I", "have", "to", "wear", "a", "uniform."]}'::jsonb, source_ref = 'L78 work', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I am hard-___."}'::jsonb, answer_key = '{"answer": "working"}'::jsonb, source_ref = 'L79 interview', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I eat ___ food."}'::jsonb, answer_key = '{"answer": "healthy"}'::jsonb, source_ref = 'L76 health', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Who takes your card first? The ___."}'::jsonb, answer_key = '{"answer": "receptionist"}'::jsonb, source_ref = 'L75 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Tizzam og''riyapti.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "My knee hurts."}'::jsonb, source_ref = 'L71 body', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Sog''lom taom yeyman.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "I eat healthy food."}'::jsonb, source_ref = 'L76 health', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Tez tuzalib keting!", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Get well soon!"}'::jsonb, source_ref = 'L75 clinic', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "want", "to", "become", "a", "doctor."]}'::jsonb, answer_key = '{"correct_order": ["I", "want", "to", "become", "a", "doctor."]}'::jsonb, source_ref = 'L77 careers correction', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Vazifa", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "duty"}'::jsonb, source_ref = 'L78 work', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Yutuq", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "achievement"}'::jsonb, source_ref = 'L80 review', points = 1
where test_id = (select id from public.online_tests where test_number = 8) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Qurilma” mean in English?", "options": ["device", "screen", "battery", "search"]}'::jsonb, answer_key = '{"correct_value": "device"}'::jsonb, source_ref = 'L81 technology', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “Izoh” mean in English?", "options": ["comment", "profile", "share", "private"]}'::jsonb, answer_key = '{"correct_value": "comment"}'::jsonb, source_ref = 'L82 social media', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Chunki” mean in English?", "options": ["because", "opinion", "probably", "certainly"]}'::jsonb, answer_key = '{"correct_value": "because"}'::jsonb, source_ref = 'L83 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each environment word with its Uzbek word.", "left": ["pollution", "recycle", "rubbish", "nature"], "right": ["Ifloslanish", "Qayta ishlash", "Axlat", "Tabiat"]}'::jsonb, answer_key = '{"pairs": [["pollution", "Ifloslanish"], ["recycle", "Qayta ishlash"], ["rubbish", "Axlat"], ["nature", "Tabiat"]]}'::jsonb, source_ref = 'L85 environment', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Biroq” mean in English?", "options": ["however", "exactly", "perhaps", "in fact"]}'::jsonb, answer_key = '{"correct_value": "however"}'::jsonb, source_ref = 'L84 agreement', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Agar” mean in English?", "options": ["if", "will", "probably", "instead"]}'::jsonb, answer_key = '{"correct_value": "if"}'::jsonb, source_ref = 'L86 conditional', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each debate word with its Uzbek word.", "left": ["debate", "reason", "support", "conclusion"], "right": ["Munozara", "Sabab", "Qo''llab-quvvatlamoq", "Xulosa"]}'::jsonb, answer_key = '{"pairs": [["debate", "Munozara"], ["reason", "Sabab"], ["support", "Qo''llab-quvvatlamoq"], ["conclusion", "Xulosa"]]}'::jsonb, source_ref = 'L87 debate', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Tinch” mean in English?", "options": ["peaceful", "crowded", "noisy", "convenient"]}'::jsonb, answer_key = '{"correct_value": "peaceful"}'::jsonb, source_ref = 'L89 city-country', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Festival” mean in English?", "options": ["festival", "culture", "custom", "exchange"]}'::jsonb, answer_key = '{"correct_value": "festival"}'::jsonb, source_ref = 'L90 cultures', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Hurmat” mean in English?", "options": ["respect", "opinion", "reason", "conclusion"]}'::jsonb, answer_key = '{"correct_value": "respect"}'::jsonb, source_ref = 'L88 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "I ___ used this app.", "options": ["have", "has"]}'::jsonb, answer_key = '{"correct_value": "have"}'::jsonb, source_ref = 'L81 present perfect', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I have download it.", "I have downloaded it.", "I has downloaded it."]}'::jsonb, answer_key = '{"correct_value": "I have downloaded it."}'::jsonb, source_ref = 'L81 present perfect correction', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "You ___ share your password.", "options": ["shouldn''t", "should"]}'::jsonb, answer_key = '{"correct_value": "shouldn''t"}'::jsonb, source_ref = 'L82 social media', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "___ my opinion, it''s great.", "options": ["In", "On"]}'::jsonb, answer_key = '{"correct_value": "In"}'::jsonb, source_ref = 'L83 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "I completely ___.", "options": ["agree", "disagree"]}'::jsonb, answer_key = '{"correct_value": "agree"}'::jsonb, source_ref = 'L84 agreement', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "If you study, you ___ pass.", "options": ["will", "does"]}'::jsonb, answer_key = '{"correct_value": "will"}'::jsonb, source_ref = 'L86 conditional', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["If it will rain, I stay.", "If it rains, I will stay.", "If it rains, I stay."]}'::jsonb, answer_key = '{"correct_value": "If it rains, I will stay."}'::jsonb, source_ref = 'L86 conditional correction', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "An ___ of the village is fresh air.", "options": ["advantage", "disadvantage"]}'::jsonb, answer_key = '{"correct_value": "advantage"}'::jsonb, source_ref = 'L89 city-country', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "It is a ___ to drink tea.", "options": ["tradition", "traditional"]}'::jsonb, answer_key = '{"correct_value": "tradition"}'::jsonb, source_ref = 'L90 cultures', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "Give me a ___.", "options": ["reason", "reasons"]}'::jsonb, answer_key = '{"correct_value": "reason"}'::jsonb, source_ref = 'L87 debate', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Respect", "different", "views."]}'::jsonb, answer_key = '{"correct_order": ["Respect", "different", "views."]}'::jsonb, source_ref = 'L88 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "think", "English", "is", "important."]}'::jsonb, answer_key = '{"correct_order": ["I", "think", "English", "is", "important."]}'::jsonb, source_ref = 'L83 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I''m afraid I ___."}'::jsonb, answer_key = '{"answer": "disagree"}'::jsonb, source_ref = 'L84 agreement', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "We should ___ plastic."}'::jsonb, answer_key = '{"answer": "recycle"}'::jsonb, source_ref = 'L85 environment', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "countryside", "is", "peaceful."]}'::jsonb, answer_key = '{"correct_order": ["The", "countryside", "is", "peaceful."]}'::jsonb, source_ref = 'L89 city-country', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "___ Japan, people bow."}'::jsonb, answer_key = '{"answer": "In"}'::jsonb, source_ref = 'L90 cultures', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Keep your profile ___."}'::jsonb, answer_key = '{"answer": "private"}'::jsonb, source_ref = 'L82 social media', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["I", "am", "against", "this", "idea."]}'::jsonb, answer_key = '{"correct_order": ["I", "am", "against", "this", "idea."]}'::jsonb, source_ref = 'L87 debate', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Xulosa", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "conclusion"}'::jsonb, source_ref = 'L88 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Sport qiziqarli.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "Sport is fun."}'::jsonb, source_ref = 'L83 opinions', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Siz bilan to''liq roziman.", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "I completely agree with you."}'::jsonb, source_ref = 'L84 agreement', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["We", "should", "recycle", "more."]}'::jsonb, answer_key = '{"correct_order": ["We", "should", "recycle", "more."]}'::jsonb, source_ref = 'L85 environment', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Bashorat qilmoq", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "predict"}'::jsonb, source_ref = 'L86 conditional', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Parol", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "password"}'::jsonb, source_ref = 'L82 social media', points = 1
where test_id = (select id from public.online_tests where test_number = 9) and stage = 'writing' and position = 6;
update public.online_test_items set prompt_data = '{"question": "What does “Kashf etmoq” mean in English?", "options": ["discover", "invent", "inspire", "admire"]}'::jsonb, answer_key = '{"correct_value": "discover"}'::jsonb, source_ref = 'L91 people', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 1;
update public.online_test_items set prompt_data = '{"question": "What does “To''satdan” mean in English?", "options": ["suddenly", "finally", "memory", "story"]}'::jsonb, answer_key = '{"correct_value": "suddenly"}'::jsonb, source_ref = 'L92 story', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 2;
update public.online_test_items set prompt_data = '{"question": "What does “Ssenariy” mean in English?", "options": ["script", "scene", "camera", "editing"]}'::jsonb, answer_key = '{"correct_value": "script"}'::jsonb, source_ref = 'L93 film', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Match each word with its Uzbek word.", "left": ["skills", "experience", "apply", "contact"], "right": ["Mahoratlar", "Tajriba", "Ariza bermoq", "Bog''lanish"]}'::jsonb, answer_key = '{"pairs": [["skills", "Mahoratlar"], ["experience", "Tajriba"], ["apply", "Ariza bermoq"], ["contact", "Bog''lanish"]]}'::jsonb, source_ref = 'L95 applications', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 4;
update public.online_test_items set prompt_data = '{"question": "What does “Kulmoq” mean in English?", "options": ["laugh", "memory", "surprise", "finally"]}'::jsonb, answer_key = '{"correct_value": "laugh"}'::jsonb, source_ref = 'L94 storytelling', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 5;
update public.online_test_items set prompt_data = '{"question": "What does “Imzo” mean in English?", "options": ["signature", "attachment", "draft", "sender"]}'::jsonb, answer_key = '{"correct_value": "signature"}'::jsonb, source_ref = 'L96 email', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Match each word with its Uzbek word.", "left": ["advice", "problem", "solution", "decision"], "right": ["Maslahat", "Muammo", "Yechim", "Qaror"]}'::jsonb, answer_key = '{"pairs": [["advice", "Maslahat"], ["problem", "Muammo"], ["solution", "Yechim"], ["decision", "Qaror"]]}'::jsonb, source_ref = 'L97 advice', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 7;
update public.online_test_items set prompt_data = '{"question": "What does “Taqdimot” mean in English?", "options": ["presentation", "project", "slide", "topic"]}'::jsonb, answer_key = '{"correct_value": "presentation"}'::jsonb, source_ref = 'L99 project', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 8;
update public.online_test_items set prompt_data = '{"question": "What does “Bitirmoq” mean in English?", "options": ["graduate", "congratulate", "success", "present"]}'::jsonb, answer_key = '{"correct_value": "graduate"}'::jsonb, source_ref = 'L100 presentations', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 9;
update public.online_test_items set prompt_data = '{"question": "What does “Qiyin” mean in English?", "options": ["difficult", "succeed", "improve", "fix"]}'::jsonb, answer_key = '{"correct_value": "difficult"}'::jsonb, source_ref = 'L98 problems', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'vocabulary' and position = 10;
update public.online_test_items set prompt_data = '{"question": "He ___ born in 1980.", "options": ["was", "is"]}'::jsonb, answer_key = '{"correct_value": "was"}'::jsonb, source_ref = 'L91 people', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 1;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["She famous for her work.", "She is famous for her work.", "She are famous for her work."]}'::jsonb, answer_key = '{"correct_value": "She is famous for her work."}'::jsonb, source_ref = 'L91 people correction', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 2;
update public.online_test_items set prompt_data = '{"question": "I was ___ when it rang.", "options": ["reading", "read"]}'::jsonb, answer_key = '{"correct_value": "reading"}'::jsonb, source_ref = 'L92 story', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 3;
update public.online_test_items set prompt_data = '{"question": "Which sentence is correct?", "options": ["I was read a book.", "I was reading a book.", "I were reading a book."]}'::jsonb, answer_key = '{"correct_value": "I was reading a book."}'::jsonb, source_ref = 'L92 story correction', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 4;
update public.online_test_items set prompt_data = '{"question": "I am writing ___ apply.", "options": ["to", "for"]}'::jsonb, answer_key = '{"correct_value": "to"}'::jsonb, source_ref = 'L95 applications', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 5;
update public.online_test_items set prompt_data = '{"question": "Write a clear ___ line.", "options": ["subject", "object"]}'::jsonb, answer_key = '{"correct_value": "subject"}'::jsonb, source_ref = 'L96 email', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 6;
update public.online_test_items set prompt_data = '{"question": "If I ___ you, I would rest.", "options": ["were", "was"]}'::jsonb, answer_key = '{"correct_value": "were"}'::jsonb, source_ref = 'L97 advice', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 7;
update public.online_test_items set prompt_data = '{"question": "The best solution is ___ a plan.", "options": ["to make", "making"]}'::jsonb, answer_key = '{"correct_value": "to make"}'::jsonb, source_ref = 'L98 problems', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 8;
update public.online_test_items set prompt_data = '{"question": "Finish with a ___.", "options": ["conclusion", "concluding"]}'::jsonb, answer_key = '{"correct_value": "conclusion"}'::jsonb, source_ref = 'L99 project', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 9;
update public.online_test_items set prompt_data = '{"question": "My project is ___ about my town.", "options": ["about", "of"]}'::jsonb, answer_key = '{"correct_value": "about"}'::jsonb, source_ref = 'L100 presentations', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'grammar' and position = 10;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["In", "the", "end,", "they", "found", "it."]}'::jsonb, answer_key = '{"correct_order": ["In", "the", "end,", "they", "found", "it."]}'::jsonb, source_ref = 'L94 storytelling', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "narrator", "tells", "the", "story."]}'::jsonb, answer_key = '{"correct_order": ["The", "narrator", "tells", "the", "story."]}'::jsonb, source_ref = 'L93 documentary', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "We wrote a short ___."}'::jsonb, answer_key = '{"answer": "script"}'::jsonb, source_ref = 'L93 film', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "My skills ___ English."}'::jsonb, answer_key = '{"answer": "include"}'::jsonb, source_ref = 'L95 applications', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["Best", "regards,", "Malika."]}'::jsonb, answer_key = '{"correct_order": ["Best", "regards,", "Malika."]}'::jsonb, source_ref = 'L96 email', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "I would ___ to the teacher."}'::jsonb, answer_key = '{"answer": "talk"}'::jsonb, source_ref = 'L97 advice', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 6;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["How", "do", "you", "deal", "with", "stress?"]}'::jsonb, answer_key = '{"correct_order": ["How", "do", "you", "deal", "with", "stress?"]}'::jsonb, source_ref = 'L98 problems', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 7;
update public.online_test_items set prompt_data = '{"instruction": "Fill in the blank.", "template": "Choose an ___ topic."}'::jsonb, answer_key = '{"answer": "interesting"}'::jsonb, source_ref = 'L99 project', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'sentences' and position = 8;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Tarix", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "history"}'::jsonb, source_ref = 'L91 people', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 1;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["While", "we", "were", "walking,", "it", "rained."]}'::jsonb, answer_key = '{"correct_order": ["While", "we", "were", "walking,", "it", "rained."]}'::jsonb, source_ref = 'L92 story', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 2;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Xotira", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "memory"}'::jsonb, source_ref = 'L94 storytelling', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 3;
update public.online_test_items set prompt_data = '{"instruction": "Put the words in order.", "tokens": ["The", "solution", "is", "to", "make", "a", "plan."]}'::jsonb, answer_key = '{"correct_order": ["The", "solution", "is", "to", "make", "a", "plan."]}'::jsonb, source_ref = 'L98 problems correction', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 4;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Slayd", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "slide"}'::jsonb, source_ref = 'L99 project', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 5;
update public.online_test_items set prompt_data = '{"instruction": "Translate into English.", "source_text": "Muvaffaqiyat", "direction": "uz2en"}'::jsonb, answer_key = '{"target_text": "success"}'::jsonb, source_ref = 'L100 presentations', points = 1
where test_id = (select id from public.online_tests where test_number = 10) and stage = 'writing' and position = 6;
