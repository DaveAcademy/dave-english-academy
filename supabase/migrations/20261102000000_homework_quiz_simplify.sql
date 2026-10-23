-- 20261102000000_homework_quiz_simplify.sql
-- Student-UX simplification: short 3-section practice quiz (~15-20 scoring
-- units total) instead of the exhaustive first version (up to 28).
--
-- Scope: replaces ONLY public.homework_build_auto_quiz(). Grading
-- (homework_grade_auto_stage), the two student RPCs, RLS, the results
-- table, normalization, and all security properties are untouched - the
-- grader is type-driven and already handles every emitted type, and
-- submit resets best score when quiz totals change (quiz-version guard),
-- so in-flight attempts migrate cleanly.
--
-- v2 distribution (scoring units):
-- * vocabulary:        1 alternating-direction MCQ per word, up to 6 words
-- * sentences:         fib + ordering per word, up to 3 words (up to 6)
-- * quick quiz/tests:  one matching set (per-pair units, up to 3) +
--                      1 quick MCQ per word, up to 3 words (up to 6)
-- A 12-word lesson yields 6 + 6 + 6 = 18 units; minimum (4-word lesson)
-- yields 5. Deliberately NO grammar-form MCQ: there is no authoritative
-- grammar key source in the schema, and inventing distractors would be
-- unreliable grading. Sentence skill is covered deterministically via
-- example-sentence fib + ordering.
-- Stage keys are unchanged ('vocabulary' | 'sentences' | 'tests') so all
-- existing rows, constraints, and RPCs keep working - only the student
-- UI relabels 'tests' as "Quick Quiz".

create or replace function public.homework_build_auto_quiz(
  p_homework_id bigint,
  p_student_id bigint,
  p_include_keys boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_lesson_id bigint;
  v_seed text;
  v_words jsonb := '[]'::jsonb;
  v_total int := 0;
  v_n_vocab int;
  v_n_sent int;
  v_n_test int;
  v_vocab jsonb := '[]'::jsonb;
  v_sent jsonb := '[]'::jsonb;
  v_test jsonb := '[]'::jsonb;
  v_questions jsonb;
  v_q jsonb;
  v_dir text;
  i int;
  v_w jsonb;
  v_wid text;
  v_en text;
  v_uz text;
  v_ex text;
  v_qid text;
  v_d jsonb;
  v_opts jsonb;
  v_tokens text[];
  v_ord_tokens text[];
  v_norm_en text;
  v_blank_idx int := -1;
  v_prompt text;
  v_shuffled jsonb;
  v_pairs jsonb;
  v_left jsonb;
  v_right jsonb;
  j int;
begin
  select h.lesson_id into v_lesson_id
  from public.homework h
  where h.id = p_homework_id;

  if v_lesson_id is null then
    return jsonb_build_object('eligible', false, 'reason', 'no_lesson');
  end if;

  v_seed := p_homework_id::text || ':' || p_student_id::text;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', lv.id::text, 'en', lv.english, 'uz', lv.uzbek, 'ex', lv.example
           )
           order by md5(v_seed || '|' || lv.id::text)
         ), '[]'::jsonb)
    into v_words
  from public.lesson_vocabulary lv
  where lv.lesson_id = v_lesson_id
    and lv.is_active;

  v_total := jsonb_array_length(v_words);

  if v_total < 4 then
    return jsonb_build_object('eligible', false, 'reason', 'needs_vocabulary');
  end if;

  -- Short-practice partition: at most 6 + 3 + 3 words (18 units on a
  -- 12-word lesson), each stage guaranteed >= 1 word.
  v_n_vocab := (v_total + 1) / 2;
  if v_n_vocab > 6 then v_n_vocab := 6; end if;
  v_n_sent := greatest(1, (v_total - v_n_vocab) / 2);
  if v_n_sent > 3 then v_n_sent := 3; end if;
  v_n_test := v_total - v_n_vocab - v_n_sent;
  if v_n_test < 1 then
    v_n_test := 1;
    if v_n_sent > 1 then v_n_sent := v_n_sent - 1;
    else v_n_vocab := v_n_vocab - 1; end if;
  end if;
  if v_n_test > 3 then v_n_test := 3; end if;

  -- ---------- Section 1: Vocabulary (one quick MCQ per word, alternating direction) ----------
  v_questions := '[]'::jsonb;
  for i in 0 .. v_n_vocab - 1 loop
    v_w := v_words -> i;
    v_wid := v_w ->> 'id';
    v_en := v_w ->> 'en';
    v_uz := v_w ->> 'uz';
    v_qid := 'v-mcq:' || v_wid;

    if i % 2 = 0 then
      -- en -> uz
      select coalesce(jsonb_agg(x.d), '[]'::jsonb) into v_d
      from (
        select (w ->> 'uz') as d
        from jsonb_array_elements(v_words) w
        where (w ->> 'id') <> v_wid
        order by md5(v_seed || '|d|' || v_qid || '|' || (w ->> 'id'))
        limit 3
      ) x;
      select jsonb_agg(o order by md5(v_seed || '|o|' || v_qid || '|' || o)) into v_opts
      from jsonb_array_elements_text(jsonb_build_array(v_uz) || v_d) o;
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'mcq', 'dir', 'en_uz',
        'prompt', v_en, 'options', v_opts
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_uz); end if;
      v_questions := v_questions || v_q;
    else
      -- uz -> en
      select coalesce(jsonb_agg(x.d), '[]'::jsonb) into v_d
      from (
        select (w ->> 'en') as d
        from jsonb_array_elements(v_words) w
        where (w ->> 'id') <> v_wid
        order by md5(v_seed || '|d|' || v_qid || '|' || (w ->> 'id'))
        limit 3
      ) x;
      select jsonb_agg(o order by md5(v_seed || '|o|' || v_qid || '|' || o)) into v_opts
      from jsonb_array_elements_text(jsonb_build_array(v_en) || v_d) o;
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'mcq', 'dir', 'uz_en',
        'prompt', v_uz, 'options', v_opts
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_en); end if;
      v_questions := v_questions || v_q;
    end if;
  end loop;
  v_vocab := v_questions;

  -- ---------- Section 2: Sentences (fill-in-the-blank + ordering) ----------
  v_questions := '[]'::jsonb;
  for i in 0 .. v_n_sent - 1 loop
    v_w := v_words -> (v_n_vocab + i);
    v_wid := v_w ->> 'id';
    v_en := v_w ->> 'en';
    v_uz := v_w ->> 'uz';
    v_ex := v_w ->> 'ex';
    v_norm_en := public.homework_normalize_answer(v_en);

    -- fill-in-the-blank from the example sentence when it contains the
    -- word as a whole token, otherwise fall back to typing the word.
    v_blank_idx := -1;
    v_tokens := null;
    if v_ex is not null and btrim(v_ex) <> '' then
      v_tokens := string_to_array(v_ex, ' ');
      for j in 1 .. array_length(v_tokens, 1) loop
        if public.homework_normalize_answer(v_tokens[j]) = v_norm_en then
          v_blank_idx := j;
          exit;
        end if;
      end loop;
    end if;

    v_qid := 's-fib:' || v_wid;
    if v_blank_idx > 0 then
      v_tokens[v_blank_idx] := '_____';
      v_prompt := array_to_string(v_tokens, ' ');
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'fib',
        'prompt', v_prompt, 'hint', v_uz
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_en); end if;
      v_questions := v_questions || v_q;
    else
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'type', 'dir', 'uz_en',
        'prompt', v_uz
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_en); end if;
      v_questions := v_questions || v_q;
    end if;

    -- ordering: example-sentence tokens when usable, else word letters.
    -- NOTE: v_tokens may carry the '_____' blank from the fib branch above,
    -- so ordering always re-splits from the original example (or letters).
    v_qid := 's-ord:' || v_wid;
    v_ord_tokens := null;
    if v_ex is not null and btrim(v_ex) <> '' then
      v_ord_tokens := string_to_array(v_ex, ' ');
    end if;
    if v_ord_tokens is not null and array_length(v_ord_tokens, 1) >= 3
       and array_length(v_ord_tokens, 1) <= 15 then
      select coalesce(jsonb_agg(t order by md5(v_seed || '|s|' || v_qid || '|' || t || '|' || n::text)), '[]'::jsonb)
        into v_shuffled
      from unnest(v_ord_tokens) with ordinality as u(t, n);
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'order',
        'prompt', v_uz, 'tokens', v_shuffled
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', to_jsonb(v_ord_tokens)); end if;
      v_questions := v_questions || v_q;
    elsif char_length(v_en) >= 3 and char_length(v_en) <= 15 then
      v_ord_tokens := regexp_split_to_array(v_en, '');
      select coalesce(jsonb_agg(t order by md5(v_seed || '|s|' || v_qid || '|' || t || '|' || n::text)), '[]'::jsonb)
        into v_shuffled
      from unnest(v_ord_tokens) with ordinality as u(t, n);
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'order',
        'prompt', v_uz || case when v_ex is not null and btrim(v_ex) <> ''
                               then ' (' || v_ex || ')' else '' end,
        'tokens', v_shuffled
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', to_jsonb(v_ord_tokens)); end if;
      v_questions := v_questions || v_q;
    else
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'type', 'dir', 'en_uz',
        'prompt', v_en
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_uz); end if;
      v_questions := v_questions || v_q;
    end if;
  end loop;
  v_sent := v_questions;

  -- ---------- Section 3: Quick Quiz (matching set + quick multiple choice) ----------
  v_questions := '[]'::jsonb;
  v_qid := 't-match';
  select coalesce(jsonb_agg((v_words -> (v_n_vocab + v_n_sent + k)) ->> 'en'
                    order by md5(v_seed || '|ml|' || k::text)), '[]'::jsonb)
    into v_left
  from generate_series(0, v_n_test - 1) k;
  select coalesce(jsonb_agg((v_words -> (v_n_vocab + v_n_sent + k)) ->> 'uz'
                    order by md5(v_seed || '|mr|' || k::text)), '[]'::jsonb)
    into v_right
  from generate_series(0, v_n_test - 1) k;
  select coalesce(jsonb_object_agg((v_words -> (v_n_vocab + v_n_sent + k)) ->> 'en',
                                   (v_words -> (v_n_vocab + v_n_sent + k)) ->> 'uz'),
                  '{}'::jsonb)
    into v_pairs
  from generate_series(0, v_n_test - 1) k;
  if v_n_test >= 2 then
    v_q := jsonb_build_object(
      'qid', v_qid, 'type', 'match',
      'prompt', 'match', 'left', v_left, 'right', v_right
    );
    if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_pairs); end if;
    v_questions := v_questions || v_q;
  end if;
  for i in 0 .. v_n_test - 1 loop
    v_w := v_words -> (v_n_vocab + v_n_sent + i);
    v_wid := v_w ->> 'id';
    v_en := v_w ->> 'en';
    v_uz := v_w ->> 'uz';
    v_qid := 't-mcq:' || v_wid;
    v_dir := case when i % 2 = 0 then 'en_uz' else 'uz_en' end;
    if v_dir = 'en_uz' then
      select coalesce(jsonb_agg(x.d), '[]'::jsonb) into v_d
      from (
        select (w ->> 'uz') as d
        from jsonb_array_elements(v_words) w
        where (w ->> 'id') <> v_wid
        order by md5(v_seed || '|d|' || v_qid || '|' || (w ->> 'id'))
        limit 3
      ) x;
      select jsonb_agg(o order by md5(v_seed || '|o|' || v_qid || '|' || o)) into v_opts
      from jsonb_array_elements_text(jsonb_build_array(v_uz) || v_d) o;
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'mcq', 'dir', 'en_uz',
        'prompt', v_en, 'options', v_opts
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_uz); end if;
      v_questions := v_questions || v_q;
    else
      select coalesce(jsonb_agg(x.d), '[]'::jsonb) into v_d
      from (
        select (w ->> 'en') as d
        from jsonb_array_elements(v_words) w
        where (w ->> 'id') <> v_wid
        order by md5(v_seed || '|d|' || v_qid || '|' || (w ->> 'id'))
        limit 3
      ) x;
      select jsonb_agg(o order by md5(v_seed || '|o|' || v_qid || '|' || o)) into v_opts
      from jsonb_array_elements_text(jsonb_build_array(v_en) || v_d) o;
      v_q := jsonb_build_object(
        'qid', v_qid, 'type', 'mcq', 'dir', 'uz_en',
        'prompt', v_uz, 'options', v_opts
      );
      if p_include_keys then v_q := v_q || jsonb_build_object('answer', v_en); end if;
      v_questions := v_questions || v_q;
    end if;
  end loop;
  v_test := v_questions;

  return jsonb_build_object(
    'eligible', true,
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'vocabulary', 'questions', v_vocab),
      jsonb_build_object('key', 'sentences', 'questions', v_sent),
      jsonb_build_object('key', 'tests', 'questions', v_test)
    )
  );
end;
$$;
