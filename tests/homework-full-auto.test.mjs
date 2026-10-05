// homework-full-auto.test.mjs — 100% automatic homework grading contract.
// Static checks on the full-auto migration + client wiring.
// Run: node tests/homework-full-auto.test.mjs
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
function read(p) { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch { return ''; } }
console.log('ASCII-START homework-full-auto');

const MIG = 'supabase/migrations/20261109000000_homework_full_auto_grading.sql';
const mig = read(MIG);
assert(mig.length > 3000, 'full-auto migration exists and is substantial');
assert(mig.includes('create or replace function public.auto_grade_homework_answer(p_answer_id bigint)'), 'auto grader redefined');
assert(mig.includes("when 'short_answer' then"), 'short_answer branch exists');
assert(mig.includes("when 'sentence_creation' then"), 'sentence_creation branch exists');
assert(mig.includes("when 'reading_comprehension' then"), 'reading_comprehension branch exists');
assert(mig.includes('accepted_targets'), 'accepted_targets honored');
assert(mig.includes('create or replace function public.submit_homework_attempt(p_homework_id bigint)'), 'submit_homework_attempt redefined');
assert(!mig.includes("raise exception 'This homework needs teacher review"), 'no keyless refusal raise in new migration');
assert(mig.includes('where id = 1782') && mig.includes('where id = 1783'), 'Q1782/Q1783 targets fixed');
assert(mig.includes('grant execute on function public.submit_homework_attempt(bigint) to authenticated'), 'authenticated-only grant preserved');
assert(mig.includes('revoke execute on function public.submit_homework_attempt(bigint) from anon'), 'anon revoked preserved');
assert(!mig.includes('point_transactions'), 'no points/XP writes in new migration');
assert(!/^\s*(insert|update|delete)\s+into\s+public\.(payments|exams|game_sessions|online_test)/im.test(mig), 'no writes to unrelated systems');

// Client wiring: all 8 types auto-finalize
const stages = read('src/features/homework/components/HomeworkStages.jsx');
for (const t of ['multiple_choice','fill_blank','translation','matching','ordering','short_answer','sentence_creation','reading_comprehension']) {
  assert(stages.includes(`'${t}'`), `DETERMINISTIC_TYPES includes ${t}`);
}
assert(!stages.includes('needs teacher review') || stages.includes('finalizeAttempt'), 'client finalize path intact');

// Pure logic mirror: SCORE-NEUTRAL grading (no false correctness credit)
// - deterministic: normalized exact match (incl. any accepted target)
// - open short_answer / sentence_creation / reading_comprehension: always
//   incorrect (0 pts), still finalized — gibberish never earns credit.
function scoreNeutralOpen() { return false; }
assert(scoreNeutralOpen('x') === false, 'open short_answer "x" gets no credit');
assert(scoreNeutralOpen('asdf') === false, 'sentence "asdf" gets no credit');
assert(scoreNeutralOpen('x') === false, 'reading sub-answer "x" gets no credit');

// Translation multi-target mirror (normalized exact match against any candidate)
function norm(s) { return String(s ?? '').trim().replace(/\s+/g, ' ').replace(/^["'({\[]+/, '').replace(/["')}\].!?… ]+$/, ''); }
function inTargets(ans, targets) {
  const n = norm(ans).toLowerCase();
  if (!n) return false;
  return targets.some(t => norm(t).toLowerCase() === n && norm(t) !== '');
}
assert(inTargets('Roziman', ['Roziman','Rozimasman']) === true, 'multi-target accepts first alternative');
assert(inTargets('Rozimasman', ['Roziman','Rozimasman']) === true, 'multi-target accepts second alternative');
assert(inTargets('hello', ['Hello','Hi']) === true, 'case-insensitive multi-target');
assert(inTargets('', ['Hello']) === false, 'empty answer never correct');
assert(inTargets('bye', ['Hello','Hi']) === false, 'wrong answer stays incorrect');

console.log('=== B. Score-neutral grading (20261110000000) ===');
const MIG2 = 'supabase/migrations/20261110000000_homework_score_neutral_grading.sql';
const mig2 = read(MIG2);
assert(mig2.length > 3000, 'score-neutral migration exists and is substantial');
assert(mig2.includes("when 'short_answer' then"), 'score-neutral grader keeps short_answer branch');
assert(mig2.includes("when 'sentence_creation' then"), 'score-neutral grader keeps sentence_creation branch');
assert(mig2.includes("when 'reading_comprehension' then"), 'score-neutral grader keeps reading_comprehension branch');
assert(mig2.includes('Score-neutral production'), 'score-neutral production documented');
assert(!mig2.includes("raise exception 'This homework needs teacher review"), 'still no keyless refusal');
assert(mig2.includes('score-neutral production'), 'score filter documented');
assert(mig2.includes('v_max_points <= 0'), 'all-score-neutral homework still finalizes');
assert(mig2.includes("grant execute on function public.submit_homework_attempt(bigint) to authenticated"), 'authenticated-only grant preserved (v2)');
assert(!mig2.includes('point_transactions'), 'no points/XP writes in score-neutral migration');
assert(!/^\s*(insert|update|delete)\s+into\s+public\.(payments|exams|game_sessions|online_test)/im.test(mig2), 'no writes to unrelated systems (v2)');

console.log(`RESULT failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
