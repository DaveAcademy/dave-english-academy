// Placement Test security contract (static checks over the RPC migration).
// Pins: SECURITY DEFINER + locked search_path, ownership validation,
// server-side grading, no correctness oracle, no client-supplied scores,
// teacher scope enforcement, and revocation of internal helpers.
// Run: node tests/placement-security.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

function body(sql, fnName) {
  const m = sql.match(new RegExp(`create or replace function public\\.${fnName}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`));
  return m ? m[1] : '';
}

const rpcs = readFileSync(
  `${root}/supabase/migrations/20261121000100_placement_test_rpcs.sql`, 'utf8'
);

// Every public RPC is SECURITY DEFINER with a locked search_path.
for (const fn of [
  'start_placement_attempt', 'get_next_placement_question', 'save_placement_answer',
  'submit_placement_attempt', 'get_placement_attempt', 'list_my_placement_attempts',
  'submit_placement_review',
]) {
  const decl = rpcs.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?as \\$\\$`));
  check(decl !== null && /security definer/i.test(decl[0]), `${fn} is SECURITY DEFINER`);
  check(decl !== null && /set search_path = public/i.test(decl[0]), `${fn} pins search_path`);
}

// Ownership: every attempt-scoped RPC resolves the student via auth.uid().
for (const fn of ['get_next_placement_question', 'save_placement_answer', 'submit_placement_attempt']) {
  const b = body(rpcs, fn);
  check(b.includes('s.profile_id = v_profile_id') || b.includes('profile_id = v_profile_id'),
    `${fn} validates attempt ownership via profile_id`);
}
check(body(rpcs, 'get_placement_attempt').includes("raise exception 'access denied'"),
  'get_placement_attempt rejects non-owner, out-of-scope callers');
check(body(rpcs, 'submit_placement_review').includes('teacher_group_assignments'),
  'submit_placement_review enforces teacher level scope');

// State validation: writes only into an in-progress, unexpired attempt.
const save = body(rpcs, 'save_placement_answer');
check(save.includes("raise exception 'attempt is not in progress'"), 'save rejects non-active attempts');
check(save.includes("raise exception 'attempt expired'") && save.includes('now() > v_attempt.deadline'),
  'save rejects answers past the server deadline');
check(save.includes("raise exception 'question was not asked in this attempt'"),
  'save rejects questions that were never asked');

// Server-side grading: the client answer is graded via the internal helper,
// and the client answer can never SET a score/correctness value.
check(save.includes('placement_grade_answer('), 'grading happens server-side');
check(!/is_correct\s*=\s*p_|is_correct\s*=\s*p_answer/i.test(save),
  'client input can never set is_correct directly');

// No correctness oracle: get_next's payloads never include key/explanation
// fields. (Internal correctness *counting* for adaptation is fine - it
// never reaches the client.)
const next = body(rpcs, 'get_next_placement_question');
check(!next.includes("'answer_key'") && !next.includes("'explanation'") && !next.includes("'is_correct'"),
  'get_next payload leaks no keys, explanations, or correctness fields');
check(next.includes('placement_questions q2') || next.includes('from public.placement_questions'),
  'questions are served from the bank');

// Keys are exposed only to staff and only after submit.
const get = body(rpcs, 'get_placement_attempt');
check(get.includes("v_is_staff and v_attempt.status <> 'in_progress' then q.answer_key"),
  'answer keys reach staff only for finished attempts');

// Idempotency + duplicate protection.
const submit = body(rpcs, 'submit_placement_attempt');
check(submit.includes("pg_advisory_xact_lock(hashtext('placement_submit:'"), 'submit takes an advisory lock');
check(submit.includes("v_attempt.status in ('submitted','reviewed')"), 'submit replays for already-finished attempts');
const start = body(rpcs, 'start_placement_attempt');
check(start.includes("pg_advisory_xact_lock(hashtext('placement_start:'"), 'start takes an advisory lock');
check(start.includes('status = \'in_progress\''), 'start resumes the active attempt (no duplicates)');
check(start.includes('attempt limit reached'), 'start enforces the attempts cap');

// Review validation: reason mandatory, rubric bounds, level bounds.
const review = body(rpcs, 'submit_placement_review');
check(review.includes("raise exception 'a reason is required'"), 'review reason is mandatory');
check(review.includes('final level must be between 1 and 6'), 'final level bounds validated');
check(review.includes('placement_validate_rubric(p_writing_scores') && review.includes('placement_validate_rubric(p_speaking_scores'),
  'rubric scores validated server-side');
const rubric = body(rpcs, 'placement_validate_rubric');
check(rubric.includes('between 0 and 3'), 'rubric dimensions bounded 0..3');
check(rubric.includes('missing rubric dimension'), 'all rubric dimensions required');

// Expiry is enforced on access, not just by the client timer.
check(next.includes('perform public.submit_placement_attempt(p_attempt_id)'),
  'get_next finalizes stale attempts with computed evidence (no discard)');
check(!next.includes("set status = 'expired'"),
  'get_next no longer marks attempts expired without a result');

// Internals are revoked from clients.
for (const fn of ['placement_grade_answer', 'placement_validate_rubric', 'placement_attempt_progress', 'placement_estimated_level', 'placement_grade_writing']) {
  check(rpcs.includes(`revoke all on function public.${fn}`), `${fn} revoked from clients`);
}
// Public RPCs are granted to authenticated only.
check(rpcs.includes('grant execute on function public.submit_placement_review(bigint, smallint, text, jsonb, jsonb, boolean) to authenticated'),
  'review RPC granted to authenticated');
check(!/grant execute on function public\.\w+ to anon/.test(rpcs), 'nothing granted to anon');

// The schema layer holds no write policies at all (defence in depth).
const schema = readFileSync(
  `${root}/supabase/migrations/20261121000000_placement_test_schema.sql`, 'utf8'
).replace(/--.*$/gm, '');
check(!/create policy placement_\w+[\s\S]{0,400}?for (insert|update|delete)/.test(schema),
  'no client-writable policies on placement tables');

console.log(failures === 0 ? 'ASCII-START placement-security ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
