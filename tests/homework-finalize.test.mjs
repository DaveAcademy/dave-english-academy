// homework-finalize.test.mjs — automatic submission + 1-100 grading.
// Static migration/RPC checks + pure unit tests of the grade rule.
// Live behavioral matrix is verified separately against linked DB (temp
// objects, fully cleaned up).
// Run: node tests/homework-finalize.test.mjs

import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
function read(p) { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch { return ''; } }
console.log('ASCII-START homework-finalize');

// Mirror of the documented grade rule: round half away from zero, clamp 0-100.
// Zero correct → 0 (not 1). Zero max is rejected server-side (not graded).
function grade(earned, max) {
  if (!(max > 0)) return null;
  const raw = (100 * earned) / max;
  const sign = raw < 0 ? -1 : 1;
  const scaled = Math.abs(raw) * 10;
  const flr = Math.floor(scaled);
  const frac = scaled - flr;
  const roundedAbs = frac >= 5 ? (flr + 1) / 10 : flr / 10;
  const clamped = Math.min(100, Math.max(0, sign * roundedAbs));
  return Math.round(clamped);
}

console.log('=== A. Migration exists + core contract ===');
const MIG = 'supabase/migrations/20261108000000_homework_finalize_attempt.sql';
const mig = read(MIG);
assert(mig.length > 2000, 'migration exists and is substantial');
assert(mig.includes('create or replace function public.submit_homework_attempt(p_homework_id bigint)'), 'submit_homework_attempt(p_homework_id) created');
assert(mig.includes('security definer'), 'SECURITY DEFINER (session-scoped auth.uid())');
assert(mig.includes('profile_id = auth.uid()'), 'student resolved from auth.uid()');
// Finalize must not take a student identity argument (only homework id).
const fnStart = mig.indexOf('create or replace function public.submit_homework_attempt');
const fnSig = mig.slice(fnStart, mig.indexOf('returns', fnStart));
assert(fnSig.includes('p_homework_id bigint)') && !fnSig.includes('p_student_id'), 'finalize takes only p_homework_id (cannot finalize for others)');
assert(mig.includes('grant execute on function public.submit_homework_attempt(bigint) to authenticated'), 'authenticated-only grant');
assert(mig.includes('revoke execute on function public.submit_homework_attempt(bigint) from anon'), 'anon revoked');
assert(mig.includes('homework_status_score_range_check'), 'score range CHECK (0-100)');
assert(mig.includes('score >= 0 and score <= 100'), 'range bounds explicit');
assert(mig.includes('homework_question_finalized'), 'answer immutability helper exists');
assert(mig.includes('not public.homework_question_finalized(question_id, student_id)'), 'student insert/update RLS blocks finalized answers');
assert(mig.includes("feedback like 'Auto-finalized%'"), 'auto-finalized rows identified for idempotent replay');
assert(mig.includes('already graded by the teacher'), 'manual teacher grade is not overwritten');
assert(mig.includes('needs teacher review'), 'keyless content refuses auto-grade');
assert(mig.includes('Homework is not complete yet'), 'unanswered required questions rejected');
assert(mig.includes('auto_grade_homework_answer'), 'reuses existing server grader');
assert(mig.includes('on conflict (homework_id, student_id)'), 'single result row upsert (unique key)');
assert(mig.includes('round(100.0 * v_earned_points / v_max_points)'), 'grade formula from authoritative points');
assert(mig.includes('greatest(0, least(100,'), 'grade clamped to 0-100');
assert(!mig.includes('point_transactions'), 'no points/XP writes');
assert(!mig.includes('student_lesson_progress'), 'no lesson progress writes');
assert(!/^\s*(insert|update|delete)\s+into\s+public\.(payments|exams|game_sessions|online_test)/im.test(mig), 'no writes to unrelated systems');

console.log('=== B. Stage progression allows mixed scores ===');
assert(mig.includes('create or replace function public.check_homework_stage_completion'), 'stage completion updated in same migration');
assert(!mig.includes('bool_and(a.is_correct)'), 'all-correct gate removed (mixed answers can progress)');
assert(mig.includes('all questions answered'), 'completion means work done, not perfection');

console.log('=== C. Grade rule unit tests ===');
assert(grade(7, 7) === 100, 'all correct → 100');
assert(grade(0, 7) === 0, 'zero correct → 0 (not 1)');
assert(grade(6, 7) === Math.round((100 * 6) / 7) || grade(6, 7) === 86, `mixed 6/7 → ${grade(6, 7)}`);
assert(grade(1, 7) === 14, `1/7 rounds to 14 (got ${grade(1, 7)})`); // 14.285… → 14
assert(grade(5, 8) === 63, `5/8 = 62.5 → half-away → 63 (got ${grade(5, 8)})`);
assert(grade(3, 8) === 38, `3/8 = 37.5 → half-away → 38 (got ${grade(3, 8)})`);
assert(grade(1, 3) === 33, `1/3 = 33.33 → 33 (got ${grade(1, 3)})`);
assert(grade(2, 3) === 67, `2/3 = 66.67 → 67 (got ${grade(2, 3)})`);
assert(grade(0, 0) === null, 'zero max rejected (no NaN/Infinity)');
assert(grade(-1, 7) === 0, 'negative earned clamps to 0');
assert(Number.isInteger(grade(6, 7)), 'stored grade is integer');
assert(grade(7, 7) <= 100 && grade(0, 7) >= 0, 'bounds hold');

console.log('=== D. Client wiring ===');
const sb = read('src/lib/storageBridge.js');
assert(sb.includes("supabase.rpc('submit_homework_attempt'"), 'storageBridge RPC wrapper exists');
assert(sb.includes('export async function submitHomeworkAttempt'), 'submitHomeworkAttempt exported');
// Fake score/correctness must never be sent
const submitFn = sb.slice(sb.indexOf('export async function submitHomeworkAttempt'), sb.indexOf('export async function', sb.indexOf('export async function submitHomeworkAttempt') + 10));
assert(!submitFn.includes('score'), 'wrapper does not send score');
assert(!submitFn.includes('is_correct'), 'wrapper does not send is_correct');
assert(!submitFn.includes('points_earned'), 'wrapper does not send points');

const stages = read('src/features/homework/components/HomeworkStages.jsx');
assert(stages.includes('submitHomeworkAttempt'), 'stages imports finalize');
assert(stages.includes('allRequiredAnswered'), 'completeness derived from stored answers');
assert(stages.includes('DETERMINISTIC_TYPES'), 'keyless types tracked');
assert(stages.includes('finalizeAttempt'), 'auto-finalize path exists');
assert(stages.includes('onFinalized'), 'parent can refresh status after finalize');
assert(stages.includes('finalResult'), 'stored grade held in state for display');
assert(!stages.includes('setScore('), 'client never sets a score');

const qr = read('src/features/homework/components/QuestionRenderer.jsx');
assert(qr.includes('locked'), 'submit button can lock after finalization');

const prog = read('src/pages/portal/MyProgress.jsx');
assert(prog.includes('score}/100'), 'dashboard shows stored 1-100 grade');
assert(prog.includes('completedHomeworkIds'), 'completion count path untouched');

const mh = read('src/features/homework/pages/MyHomework.jsx');
assert(mh.includes('onFinalized'), 'homework list refreshes status after finalize');
assert(mh.includes('scoreOutOf') || mh.includes('score'), 'list still shows score when present');

const acad = read('src/lib/useAcademyData.js');
assert(acad.includes('refreshHomeworkStatus'), 'status refresh helper exported');
assert(acad.includes('getMyHomeworkCompletion') || read('src/pages/portal/MyProgress.jsx').includes('getMyHomeworkCompletion'), 'completion RPC consumer preserved');

console.log('=== E. Completion RPC not regressed ===');
const comp = read('supabase/migrations/20261107000000_homework_completion.sql');
assert(comp.includes('get_my_homework_completion'), 'completion migration still present');
assert(comp.includes("hs.status in ('Submitted', 'Graded')"), 'completion still honors Submitted/Graded');
assert(read('src/lib/storageBridge.js').includes('get_my_homework_completion'), 'client still calls completion RPC');

console.log(`RESULT failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
