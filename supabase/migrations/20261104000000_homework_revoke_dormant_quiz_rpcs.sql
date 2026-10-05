-- 20261104000000_homework_revoke_dormant_quiz_rpcs.sql
-- Reconciliation: the reconciled student flow uses the seeded-question
-- engine (homework_stages/questions/answers + auto_grade_homework_answer).
-- The lesson-vocabulary-derived quiz RPCs from 20261101000000 (refined by
-- 20261102000000/20261103000000) are superseded and must not remain a
-- second callable grading path: no shipped UI calls them, and nothing in
-- the repo references them. Revoke (not drop) so the change is minimal,
-- auditable, and reversible; the functions, table, and RLS stay intact.
-- Internal helpers (builder/grader) already carry no grants. The pure
-- homework_normalize_answer() helper grades nothing alone and keeps its
-- existing grants. Vocabulary evidence, manual grading, points, and all
-- other subsystems are untouched.

revoke execute on function public.get_homework_auto_quiz(bigint) from anon;
revoke execute on function public.get_homework_auto_quiz(bigint) from public;
revoke execute on function public.get_homework_auto_quiz(bigint) from authenticated;

revoke execute on function public.submit_homework_auto_stage(bigint, text, jsonb) from anon;
revoke execute on function public.submit_homework_auto_stage(bigint, text, jsonb) from public;
revoke execute on function public.submit_homework_auto_stage(bigint, text, jsonb) from authenticated;
