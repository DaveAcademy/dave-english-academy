// Placement Test lifecycle + scoring contract (static checks over the RPC
// migration, mirroring the iq-brain lifecycle test approach): the SQL must
// implement the documented phases, section rotation, stop rules, weighted
// scoring, conservative median, confidence bands, and insufficient-evidence
// handling. The behavioral JS mirror lives in placement-engine.test.mjs.
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
const provisional = body(rpcs, 'placement_provisional_level');

// Phase machine
for (const phase of ["'question'", "'writing'", "'speaking'", "'complete'", "'expired'"]) {
  check(next.includes(`'phase', ${phase}`) || next.includes(`'phase', ${phase.replace(/'/g, '')}`) || next.includes(phase),
    `phase ${phase} is produced by the engine`);
}

// Fixed section rotation order
check(next.includes("array['grammar','vocabulary','reading','listening']") ||
      next.includes('placement_objective_skills()'),
  'objective skills rotate in a fixed order');
const skillsFn = body(rpcs, 'placement_objective_skills');
check(skillsFn.includes("array['grammar','vocabulary','reading','listening']"),
  'rotation order is grammar -> vocabulary -> reading -> listening');

// Adaptive constants used in selection
check(next.includes('placement_adaptive_estimate'), 'per-skill estimates drive selection');
check(next.includes('placement_min_per_skill()') && next.includes('placement_max_per_skill()'),
  'min/max per-skill question counts enforced');
check(next.includes('order by q2.id'), 'question selection is deterministic (id tie-break)');
check(next.includes('abs(q2.cefr_level - v_est)') || next.includes('abs(cefr_level -'),
  'nearest-level fallback when a level runs dry');

// Re-entrancy: unanswered last question is re-served
check(next.includes('not exists') && next.includes('pa.question_id = q.id'),
  'engine re-serves the last unanswered question on resume');

// Objective phase must complete before writing; writing before speaking
check(next.indexOf("q.skill = 'writing'") < next.indexOf("q.skill = 'speaking'"),
  'writing phase precedes speaking phase');
check(provisional.includes('placement_attempt_progress') || provisional.includes('estimate'),
  'writing/speaking prompts are chosen at the provisional level');

// Termination: the engine can always reach 'complete'
check(next.includes("'phase', 'complete'"), "engine terminates with phase 'complete'");

// --- Scoring ---
check(submit.includes('sum(pa.weight) filter (where pa.is_correct is true)'),
  'skill scores are difficulty-weighted (sum of weights for correct items)');
check(submit.includes('filter (where pa.skipped is true), 0) as denom_skipped'),
  'skipped items contribute weight to the denominator only');
check(submit.includes('placement_level_from_pct'), 'skill levels come from the threshold mapping');
check(submit.includes('select v_attempt.id, q.id, null, true, null, q.weight, now()'),
  'unanswered asked questions are recorded as skipped at submit');

// Conservative median overall
check(submit.includes('floor(avg(e))'), 'overall level is a floored (conservative) median');
check(submit.includes('when v_spread <= 1 then \'high\'') && submit.includes("when v_spread = 2 then 'medium'"),
  'confidence bands follow the skill spread');

// Insufficient evidence
check(submit.includes('placement_min_total_answered()'), 'minimum answered threshold enforced');
check(submit.includes("'insufficient_evidence'"), 'insufficient-evidence state is produced');
check(submit.includes("when v_insufficient then 'insufficient_evidence' else 'pending' end"),
  'review status reflects insufficient evidence');

// Evidence payload explains the result
for (const field of ['strongest_skill', 'weakest_skill', 'recommended_academy_level', 'total_asked', 'total_answered', 'total_skipped', 'method']) {
  check(submit.includes(`'${field}'`), `result evidence includes ${field}`);
}
check(submit.includes('skipped counts as incorrect'), 'scoring method is documented in the result payload');

// Skipped counts as incorrect: a skipped item earns no weight
check(submit.includes('filter (where pa.is_correct is true), 0) as earned'),
  'skipped/wrong items earn no weight');

// Progress is informational only (aggregates, no per-answer material)
check(!progress.includes("'answer_key'") && !progress.includes("'is_correct'"),
  'progress snapshot leaks no answer material');

// Deadline + expiry on submit
check(submit.includes("now() > deadline"), 'submit marks stale attempts expired');

// Review lifecycle
check(submit.length > 0 && rpcs.includes('submit_placement_review'),
  'review RPC exists');
const review = body(rpcs, 'submit_placement_review');
check(review.includes("status not in ('submitted','reviewed')"),
  'reviews only accepted for finished attempts');
check(review.includes("set status = 'reviewed'") && review.includes('final_level = p_final_level'),
  'confirmed review updates attempt status and final level');

console.log(failures === 0 ? 'ASCII-START placement-lifecycle ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
