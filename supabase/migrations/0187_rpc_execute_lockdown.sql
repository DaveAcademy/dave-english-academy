-- Lock application RPCs down to authenticated callers.
--
-- Audit finding (2026-08-23, live pg_proc introspection): Supabase's
-- default privileges explicitly grant EXECUTE on new functions to anon,
-- authenticated, and service_role. The house "revoke from public / grant
-- to authenticated" pattern used by most migrations only ever removed the
-- implicit PUBLIC grant - the explicit anon grant stayed, so every student
-- staff RPC below remained callable by anonymous PostgREST clients at the
-- SQL layer even though the frontend only ever calls them signed-in.
--
-- This migration applies the full trio to every application RPC the
-- frontend calls (verified against src usage: storageBridge.js,
-- dictionaryBridge.js, and page-level rpc calls):
--   revoke EXECUTE from anon;
--   revoke EXECUTE from public;   (no-op where 0186 or earlier already did)
--   grant  EXECUTE to authenticated;  (no-op, stated for completeness)
--
-- Deliberately EXCLUDED - intentionally callable anonymously:
--   claim_first_admin() / is_setup_complete() - called by AuthGate.jsx
--   before login during first-time setup.
-- Also untouched: RLS helper/predicate functions not called by the
-- frontend (is_own_student, is_teacher, is_admin, can_read_* etc.),
-- trigger functions, and service_role grants.
--
-- No function bodies, signatures, return types, tables, or policies are
-- changed - privilege statements only. Signatures were taken verbatim
-- from live production pg_get_function_identity_arguments() on
-- 2026-08-23. NOT applied in this commit; apply after review.

-- ---------- Games (Family V + Family C + shared round/submit path) ----------
revoke execute on function public.get_word_scramble_round() from anon;
revoke execute on function public.get_word_scramble_round() from public;
grant execute on function public.get_word_scramble_round() to authenticated;

revoke execute on function public.get_vocabulary_quiz_round() from anon;
revoke execute on function public.get_vocabulary_quiz_round() from public;
grant execute on function public.get_vocabulary_quiz_round() to authenticated;

revoke execute on function public.get_word_match_round() from anon;
revoke execute on function public.get_word_match_round() from public;
grant execute on function public.get_word_match_round() to authenticated;

revoke execute on function public.get_speed_challenge_round() from anon;
revoke execute on function public.get_speed_challenge_round() from public;
grant execute on function public.get_speed_challenge_round() to authenticated;

revoke execute on function public.get_word_builder_round() from anon;
revoke execute on function public.get_word_builder_round() from public;
grant execute on function public.get_word_builder_round() to authenticated;

revoke execute on function public.get_sentence_scramble_round() from anon;
revoke execute on function public.get_sentence_scramble_round() from public;
grant execute on function public.get_sentence_scramble_round() to authenticated;

revoke execute on function public.get_word_detective_round() from anon;
revoke execute on function public.get_word_detective_round() from public;
grant execute on function public.get_word_detective_round() to authenticated;

revoke execute on function public.get_grammar_battle_round() from anon;
revoke execute on function public.get_grammar_battle_round() from public;
grant execute on function public.get_grammar_battle_round() to authenticated;

revoke execute on function public.get_hangman_round() from anon;
revoke execute on function public.get_hangman_round() from public;
grant execute on function public.get_hangman_round() to authenticated;

revoke execute on function public.get_picture_quiz_round() from anon;
revoke execute on function public.get_picture_quiz_round() from public;
grant execute on function public.get_picture_quiz_round() to authenticated;

revoke execute on function public.submit_game_round(uuid, text, jsonb) from anon;
revoke execute on function public.submit_game_round(uuid, text, jsonb) from public;
grant execute on function public.submit_game_round(uuid, text, jsonb) to authenticated;

revoke execute on function public.get_game_best_records() from anon;
revoke execute on function public.get_game_best_records() from public;
grant execute on function public.get_game_best_records() to authenticated;

revoke execute on function public.get_game_level_leaderboard() from anon;
revoke execute on function public.get_game_level_leaderboard() from public;
grant execute on function public.get_game_level_leaderboard() to authenticated;

revoke execute on function public.get_game_points_leaderboard() from anon;
revoke execute on function public.get_game_points_leaderboard() from public;
grant execute on function public.get_game_points_leaderboard() to authenticated;

revoke execute on function public.get_game_points_overall_leaderboard() from anon;
revoke execute on function public.get_game_points_overall_leaderboard() from public;
grant execute on function public.get_game_points_overall_leaderboard() to authenticated;

-- ---------- Dictionary V1 ----------
revoke execute on function public.get_next_dictionary_words(bigint, integer) from anon;
revoke execute on function public.get_next_dictionary_words(bigint, integer) from public;
grant execute on function public.get_next_dictionary_words(bigint, integer) to authenticated;

revoke execute on function public.start_dictionary_words(uuid[]) from anon;
revoke execute on function public.start_dictionary_words(uuid[]) from public;
grant execute on function public.start_dictionary_words(uuid[]) to authenticated;

revoke execute on function public.get_due_dictionary_reviews(bigint, integer) from anon;
revoke execute on function public.get_due_dictionary_reviews(bigint, integer) from public;
grant execute on function public.get_due_dictionary_reviews(bigint, integer) to authenticated;

revoke execute on function public.schedule_dictionary_review(bigint, integer) from anon;
revoke execute on function public.schedule_dictionary_review(bigint, integer) from public;
grant execute on function public.schedule_dictionary_review(bigint, integer) to authenticated;

revoke execute on function public.search_dictionary_unified(text, integer) from anon;
revoke execute on function public.search_dictionary_unified(text, integer) from public;
grant execute on function public.search_dictionary_unified(text, integer) to authenticated;

revoke execute on function public.get_my_dictionary_summary() from anon;
revoke execute on function public.get_my_dictionary_summary() from public;
grant execute on function public.get_my_dictionary_summary() to authenticated;

revoke execute on function public.get_dictionary_leaderboard(text) from anon;
revoke execute on function public.get_dictionary_leaderboard(text) from public;
grant execute on function public.get_dictionary_leaderboard(text) to authenticated;

revoke execute on function public.get_dictionary_admin_overview() from anon;
revoke execute on function public.get_dictionary_admin_overview() from public;
grant execute on function public.get_dictionary_admin_overview() to authenticated;

revoke execute on function public.get_dictionary_student_detail(bigint) from anon;
revoke execute on function public.get_dictionary_student_detail(bigint) from public;
grant execute on function public.get_dictionary_student_detail(bigint) to authenticated;

-- ---------- Ranking / leaderboards / recognition ----------
revoke execute on function public.get_group_leaderboard(text, text, date) from anon;
revoke execute on function public.get_group_leaderboard(text, text, date) from public;
grant execute on function public.get_group_leaderboard(text, text, date) to authenticated;

revoke execute on function public.get_class_leaderboard(bigint) from anon;
revoke execute on function public.get_class_leaderboard(bigint) from public;
grant execute on function public.get_class_leaderboard(bigint) to authenticated;

revoke execute on function public.get_weekly_class_leaderboard(bigint, date) from anon;
revoke execute on function public.get_weekly_class_leaderboard(bigint, date) from public;
grant execute on function public.get_weekly_class_leaderboard(bigint, date) to authenticated;

revoke execute on function public.get_monthly_class_leaderboard(bigint, date) from anon;
revoke execute on function public.get_monthly_class_leaderboard(bigint, date) from public;
grant execute on function public.get_monthly_class_leaderboard(bigint, date) to authenticated;

revoke execute on function public.get_student_ranking_summary(bigint) from anon;
revoke execute on function public.get_student_ranking_summary(bigint) from public;
grant execute on function public.get_student_ranking_summary(bigint) to authenticated;

revoke execute on function public.get_my_point_history() from anon;
revoke execute on function public.get_my_point_history() from public;
grant execute on function public.get_my_point_history() to authenticated;

revoke execute on function public.get_activity_feed(integer) from anon;
revoke execute on function public.get_activity_feed(integer) from public;
grant execute on function public.get_activity_feed(integer) to authenticated;

revoke execute on function public.get_period_bounds(text, date) from anon;
revoke execute on function public.get_period_bounds(text, date) from public;
grant execute on function public.get_period_bounds(text, date) to authenticated;

revoke execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) from anon;
revoke execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) from public;
grant execute on function public.finalize_recognition_winner(text, text, text, date, date, bigint, text) to authenticated;

revoke execute on function public.revoke_recognition_award(bigint, text) from anon;
revoke execute on function public.revoke_recognition_award(bigint, text) from public;
grant execute on function public.revoke_recognition_award(bigint, text) to authenticated;

-- ---------- Payments / admin / diagnostics ----------
revoke execute on function public.get_student_payment_status(bigint) from anon;
revoke execute on function public.get_student_payment_status(bigint) from public;
grant execute on function public.get_student_payment_status(bigint) to authenticated;

revoke execute on function public.get_payment_collection_summary(date, date) from anon;
revoke execute on function public.get_payment_collection_summary(date, date) from public;
grant execute on function public.get_payment_collection_summary(date, date) to authenticated;

revoke execute on function public.get_monthly_payment_collection(integer, integer) from anon;
revoke execute on function public.get_monthly_payment_collection(integer, integer) from public;
grant execute on function public.get_monthly_payment_collection(integer, integer) to authenticated;

revoke execute on function public.get_payment_reminder_candidates() from anon;
revoke execute on function public.get_payment_reminder_candidates() from public;
grant execute on function public.get_payment_reminder_candidates() to authenticated;

revoke execute on function public.payment_data_audit() from anon;
revoke execute on function public.payment_data_audit() from public;
grant execute on function public.payment_data_audit() to authenticated;

revoke execute on function public.resync_sequences() from anon;
revoke execute on function public.resync_sequences() from public;
grant execute on function public.resync_sequences() to authenticated;

revoke execute on function public.get_student_login_info() from anon;
revoke execute on function public.get_student_login_info() from public;
grant execute on function public.get_student_login_info() to authenticated;
