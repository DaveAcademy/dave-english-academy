-- Seeds only the curriculum lessons whose official title has actually been
-- confirmed (lessons 1-20 from the Month 1/2 plan, plus 34/44/56/61/71/72/73
-- stated directly). Lessons 21-33, 35-43, 45-55, 57-70, 74-120 are
-- deliberately left unseeded - their titles were never provided, and
-- fabricating them would misrepresent the academy's actual curriculum.
-- month is lesson_number's ceil/10 block (10 lessons per month); type is
-- 'review' for the two review slots, 'test' for the two test slots, and
-- 'normal' for every confirmed teaching lesson (none of the confirmed
-- rows are activity/final_exam).

insert into public.curriculum_lessons (lesson_number, title, month, lesson_type) values
  (1, 'Hello! Nice to Meet You', 1, 'normal'),
  (2, 'How Old Are You?', 1, 'normal'),
  (3, 'Colors All Around', 1, 'normal'),
  (4, 'Classroom Language', 1, 'normal'),
  (5, 'Numbers 20-100 and More', 1, 'normal'),
  (6, 'Asking Questions - The Toolbox', 1, 'normal'),
  (7, 'Numbers & Colors Games Day', 1, 'normal'),
  (8, 'Speaking Circle: Introducing Yourself', 1, 'normal'),
  (9, 'Month 1 Review', 1, 'review'),
  (10, 'Month 1 Test', 1, 'test'),
  (11, 'Where Are You From?', 2, 'normal'),
  (12, 'My Family', 2, 'normal'),
  (13, 'Have / Has - Describing Possessions', 2, 'normal'),
  (14, 'Days and Months', 2, 'normal'),
  (15, 'Describing People - Adjectives', 2, 'normal'),
  (16, 'All About Me - My Introduction', 2, 'normal'),
  (17, 'Family Tree Workshop', 2, 'normal'),
  (18, 'Speaking Circle: All About My Family', 2, 'normal'),
  (19, 'Month 2 Review', 2, 'review'),
  (20, 'Month 2 Test', 2, 'test'),
  (34, 'Prepositions', 4, 'normal'),
  (44, 'How Many / How Much', 5, 'normal'),
  (56, 'My Weekend', 6, 'normal'),
  (61, 'Holidays and Celebrations', 7, 'normal'),
  (71, 'Body Parts', 8, 'normal'),
  (72, 'Health Problems', 8, 'normal'),
  (73, 'At the Doctor''s', 8, 'normal');
