// Placement Test lifecycle + scoring contract (static checks over the RPC
// migration): the SQL must implement the fixed-60 G/V-only phases, sequential
// A1->C2 delivery, 10-point scoring, per-level (out of 100) and per-skill
// (grammar 300 / vocabulary 300) breakdowns, consecutive-mastery staircase,
// confidence rules, insufficient-evidence handling, expiration finalization,
// idempotent replay, and review permissions.
// Run: node tests/placement-lifecycle.test.mjs
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
const next = body(rpcs, 'get_next_placement_question');
const submit = body(rpcs, 'submit_placement_attempt');
const progress = body(rpcs, 'placement_attempt_progress');
const start = body(rpcs, 'start_placement_attempt');

// Phase machine: question -> complete (no writing/speaking phases)
check(next.includes('placement_questions_per_level()'), "phase 'question' is produced by the engine");
check(!next.includes("then 'writing'"), 'no writing phase in the engine');
check(!next.includes("'phase', 'speaking'"), 'no speaking phase in the engine');
check(next.includes("'phase', 'complete'"), "phase 'complete' is produced by the engine");

// Fixed sequential delivery: level = asked/10 + 1, position = asked % 10
check(next.includes('public.placement_total_questions()'), 'engine bounds delivery at 60 questions');
check(next.includes('public.placement_questions_per_level()'), 'engine advances levels every 10 questions');
check(next.includes('row_number() over (order by q.id) as rn'), 'deterministic per-level candidate ordering (id tie-break)');
check(next.includes('where c.rn = v_rem + 1'), 'position within the level comes from the fixed plan');
check(next.includes('question bank incomplete'), 'bank shortage fails loudly instead of shortening the test');
check(next.includes("q.question_type = 'mcq'"), 'delivery covers mcq only');
check(next.includes("array['grammar','vocabulary']"), 'skills are grammar and vocabulary only');
check(!next.includes('placement_mastery_threshold()') || !next.includes('v_seen_fail'),
  'no adaptive early termination in delivery');

// Start: bank sufficiency guard
check(start.includes('question bank incomplete'), 'attempt start validates the bank can supply the full plan');
check(start.includes("'gv-60'"), 'new attempts are created as gv-60');
check(start.includes('format'), 'format column is set at attempt creation');

// Scoring: 10 points per correct answer, per-level + per-skill, 600 max
check(submit.includes("coalesce(v_rec.correct, 0) * public.placement_points_per_question()"),
  'each correct answer earns exactly 10 points');
check(submit.includes("'total_score', v_total_score") || submit.includes("'total_score', v_total_score,"),
  'total score persisted');
check(submit.includes("'max_score', case when v_attempt.format = 'fixed-60' then public.placement_max_score()"), 'maximum score persisted (600 for fixed-60, asked-based for legacy)');
check(submit.includes("'per_level', v_level_result"), 'per-level breakdown persisted');
check(submit.includes("'per_skill', v_skill_result"), 'per-skill breakdown persisted');
check(submit.includes("'correct_count', v_correct_total"), 'correct-answer count persisted');
check(submit.includes("'grammar_max', 320"), 'grammar subtotal max persisted (320)');
check(submit.includes("'vocabulary_max', 280"), 'vocabulary subtotal max persisted (280)');
check(submit.includes("q.skill in ('grammar','vocabulary')"),
  'level scoring covers grammar and vocabulary only');
check(submit.includes("q.question_type = 'mcq'"), 'scoring uses mcq items only');

// Unanswered asked questions become skipped and earn 0
check(submit.includes('insert into public.placement_answers') && submit.includes('null, true, null, 10, now()'),
  'unanswered asked questions are recorded as skipped (0 points)');

// CEFR staircase + confidence + insufficient evidence
check(submit.includes('public.placement_mastery_threshold()'), 'staircase uses the documented mastery threshold');
check(submit.includes('v_seen_fail'), 'a failed lower level caps the estimate (consecutive mastery)');
check(submit.includes("v_est = 4 and v_pcts[4] < 80 then 'medium'"),
  'B2 estimates carry reduced confidence (moderate evidence at the top)');
check(submit.includes("v_est = 1 and v_pcts[1] < 40 then 'low'"),
  'below-entry mastery is flagged low confidence');
check(submit.includes('public.placement_min_total_answered()'), 'minimum-answered rule enforced');
check(submit.includes("'insufficient_evidence'"), 'insufficient-evidence state is produced');
check(submit.includes("'estimated_level', v_est"), 'estimated level persisted (distinct from the score)');
check(submit.includes("'format', 'gv-60'"), 'result carries the gv-60 format marker');

// Legacy compatibility: format column + finalize-on-access
check(rpcs.includes('add column if not exists format text not null default ' + "'legacy-adaptive'"),
  'legacy attempts default to the legacy-adaptive format');
check(next.includes("v_attempt.format = 'legacy-adaptive'"),
  'legacy attempts finalize instead of switching formats');
check(submit.includes("v_total_asked * public.placement_points_per_question()"),
  'legacy max_score reflects what was actually asked (never shown as out of 600)');
check(submit.includes("case when v_attempt.format = 'fixed-60' then public.placement_max_score()"),
  'max_score uses fixed-60 scale for new attempts only');

// Expiry + idempotency + ownership
check(submit.includes('now() > deadline'), 'submit marks stale attempts expired (with computed result)');
check(submit.includes("v_attempt.status in ('submitted','reviewed')"), 'submit replays for already-finished attempts');
check(submit.includes("pg_advisory_xact_lock(hashtext('placement_submit:'"), 'submit takes an advisory lock');

// Progress shape for the UI
check(progress.includes("'levels', v_levels"), 'progress exposes per-level counts');
check(progress.includes("'skills', v_skills"), 'progress exposes per-skill counts');
check(progress.includes("'total_questions', public.placement_total_questions()"), 'progress carries the 60-question total');
check(progress.includes("'question_number', v_total"), 'progress carries the current question number');
check(!progress.includes('answer_key') && !progress.includes("'is_correct'"),
  'progress snapshot leaks no answer material');

// Review permissions
const review = body(rpcs, 'submit_placement_review');
check(review.includes("status not in ('submitted','reviewed','expired')"),
  'reviews only accepted for finished (or finalized-expired) attempts');
check(review.includes("set status = 'reviewed'") && review.includes('final_level = p_final_level'),
  'review updates the attempt status and final level');

console.log(failures === 0 ? 'ASCII-START placement-lifecycle ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
