-- scripts/backfill-vocab-identity.sql
-- Safe deterministic backfill: links single-word questions to
-- lesson_vocabulary.id through their OWN lesson scope only.
-- Rules (both sources):
--   * only rows with vocabulary_id IS NULL are touched (re-runnable);
--   * exactly one in-lesson candidate required (HAVING count = 1);
--     zero or 2+ candidates are left NULL and reported, never guessed;
--   * the correct answer cross-check must agree (uzbek for en->uz,
--     english for uz->en), so snapshot/DB drift never mislinks;
--   * homework: multiple_choice `What does "X" mean?` only;
--   * online tests: vocabulary/multiple_choice word-meaning items only;
--   * sentence/grammar/matching/reading rows are never touched.
-- Ends with mapped/ambiguous/unmapped report SELECTs. Read-only until
-- the two UPDATEs; run in a transaction to dry-review if desired.

-- ================= homework =================
drop table if exists tmp_hw_cands;
create temp table tmp_hw_cands as
select p.qid, lv.id as vid
from (
  select q.id as qid, q.stage_id,
    substring(q.question_text from '^What does ["“](.+)["”] mean\?$') as w,
    case
      when jsonb_typeof(q.question_data -> 'options') = 'array'
        and (q.question_data ->> 'correct_index') ~ '^\d+$'
      then q.question_data -> 'options' ->> (q.question_data ->> 'correct_index')::int
    end as correct_uz
  from public.homework_questions q
  where q.vocabulary_id is null
    and q.question_type = 'multiple_choice'
) p
join public.homework_stages s on s.id = p.stage_id
join public.homework h on h.id = s.homework_id
join public.lessons l on l.id = h.lesson_id
join public.lesson_vocabulary lv on lv.lesson_id = l.id
where p.w is not null
  and p.correct_uz is not null
  and lv.is_active
  and lower(lv.english) = lower(p.w)
  and lv.uzbek = p.correct_uz;

update public.homework_questions q
set vocabulary_id = u.vid
from (select qid, (array_agg(vid))[1] as vid from tmp_hw_cands group by qid having count(*) = 1) u
where q.id = u.qid
  and q.vocabulary_id is null;

-- ================= online tests =================
drop table if exists tmp_ot_cands;
create temp table tmp_ot_cands as
select p.iid, lv.id as vid
from (
  select it.id as iid,
    nullif(substring(it.source_ref from '^L(\d+)'), '')::int as lnum,
    case
      when it.prompt_data ->> 'question' ~ '^What does .+ mean in English\?$' then 'uz2en'
      when it.prompt_data ->> 'question' ~ '^What does .+ mean\?$' then 'en2uz'
    end as dir,
    substring(it.prompt_data ->> 'question' from '^What does ["“](.+)["”] mean( in English)?\?$') as w,
    it.answer_key ->> 'correct_value' as cv
  from public.online_test_items it
  where it.vocabulary_id is null
    and it.stage = 'vocabulary'
    and it.question_type = 'multiple_choice'
) p
join public.curriculum_lessons cl on cl.lesson_number = p.lnum
join public.lessons l on l.curriculum_lesson_id = cl.id
join public.lesson_vocabulary lv on lv.lesson_id = l.id
where p.w is not null
  and p.dir is not null
  and p.cv is not null
  and lv.is_active
  and (
    (p.dir = 'en2uz' and lower(lv.english) = lower(p.w) and lv.uzbek = p.cv)
    or (p.dir = 'uz2en' and lower(lv.uzbek) = lower(p.w) and lv.english = p.cv)
  );

update public.online_test_items t
set vocabulary_id = u.vid
from (select iid, (array_agg(vid))[1] as vid from tmp_ot_cands group by iid having count(*) = 1) u
where t.id = u.iid
  and t.vocabulary_id is null;

-- ================= report =================
select 'homework' as src,
  (select count(*) from public.homework_questions where vocabulary_id is not null) as mapped,
  (select count(*) from (select qid from tmp_hw_cands group by qid having count(*) <> 1) a) as ambiguous,
  (select count(*) from public.homework_questions where vocabulary_id is null) as unmapped,
  (select count(*) from public.homework_questions) as total;

select 'online_tests' as src,
  (select count(*) from public.online_test_items where vocabulary_id is not null) as mapped,
  (select count(*) from (select iid from tmp_ot_cands group by iid having count(*) <> 1) a) as ambiguous,
  (select count(*) from public.online_test_items where vocabulary_id is null) as unmapped,
  (select count(*) from public.online_test_items) as total;

select question_type::text as homework_type, count(*) as still_null
from public.homework_questions where vocabulary_id is null
group by 1 order by 2 desc;

select stage as test_stage, count(*) as still_null
from public.online_test_items where vocabulary_id is null
group by 1 order by 2 desc;

drop table if exists tmp_hw_cands;
drop table if exists tmp_ot_cands;
