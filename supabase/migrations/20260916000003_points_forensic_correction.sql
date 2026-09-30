-- Forensic Points Correction Aug1-Sep30: cap inflated game_points to legitimate max (base+5 perfect)
-- Base per game_type_difficulty: picture 5, hangman 10, vocab 10, word_match 20, word_scramble 20, sentence 30, builder 30, detective 40, speed 40, grammar 50
-- Legit max = base + (is_perfect?5:0). Rows with points > max are corrupted (historical tier bug).
-- Also remove 0-point rows (should not award on fail).

-- Cap inflated points
update game_points_transactions set points = case game_type
  when 'picture_quiz' then 5 + case when is_perfect then 5 else 0 end
  when 'hangman' then 10 + case when is_perfect then 5 else 0 end
  when 'vocabulary_quiz' then 10 + case when is_perfect then 5 else 0 end
  when 'word_match' then 20 + case when is_perfect then 5 else 0 end
  when 'word_scramble' then 20 + case when is_perfect then 5 else 0 end
  when 'sentence_scramble' then 30 + case when is_perfect then 5 else 0 end
  when 'word_builder' then 30 + case when is_perfect then 5 else 0 end
  when 'word_detective' then 40 + case when is_perfect then 5 else 0 end
  when 'speed_challenge' then 40 + case when is_perfect then 5 else 0 end
  when 'grammar_battle' then 50 + case when is_perfect then 5 else 0 end
  else points end
where points > case game_type
  when 'picture_quiz' then 5 + case when is_perfect then 5 else 0 end
  when 'hangman' then 10 + case when is_perfect then 5 else 0 end
  when 'vocabulary_quiz' then 10 + case when is_perfect then 5 else 0 end
  when 'word_match' then 20 + case when is_perfect then 5 else 0 end
  when 'word_scramble' then 20 + case when is_perfect then 5 else 0 end
  when 'sentence_scramble' then 30 + case when is_perfect then 5 else 0 end
  when 'word_builder' then 30 + case when is_perfect then 5 else 0 end
  when 'word_detective' then 40 + case when is_perfect then 5 else 0 end
  when 'speed_challenge' then 40 + case when is_perfect then 5 else 0 end
  when 'grammar_battle' then 50 + case when is_perfect then 5 else 0 end
  else points end;

-- Remove 0-point game awards (no legitimate level-up should be 0)
delete from game_points_transactions where points = 0;

-- Log summary
do $$ declare v int; begin select count(*) into v from game_points_transactions; raise log 'points_forensic: remaining %', v; end $$;
