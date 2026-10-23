// IQ & Brain M1 - attempt lifecycle, deadline/idempotency, deterministic
// scoring mirror, and frontend isolation.
// The SQL is authoritative; the functions below mirror the documented
// contract (same approach as tests/online-test-grading.test.mjs).
// Run: node tests/iq-brain-lifecycle-scoring.test.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
function read(p) {
  try { return readFileSync(resolve(root, p), 'utf8'); } catch { return ''; }
}
function body(fn, src) {
  const start = src.indexOf(`create or replace function public.${fn}`);
  if (start < 0) return '';
  const rest = src.slice(start);
  // Functions are dollar-quoted with either $$ or the $f$ alias.
  const end = rest.search(/\n(\$f\$|\$\$);/);
  return end < 0 ? rest : rest.slice(0, end);
}

const f = read('supabase/migrations/20261119000000_iq_brain_foundation.sql');
const rpc = read('supabase/migrations/20261119000100_iq_brain_rpcs.sql');
const rpccode = rpc.replace(/--.*$/gm, '');

console.log('ASCII-START iq-brain-lifecycle-scoring');

// ================= LIFECYCLE =================

check(/deadline\s+timestamptz not null/.test(f), 'attempt carries a NOT NULL deadline');
check(/now\(\) \+ make_interval\(secs => v_challenge\.time_limit_sec\)/.test(rpccode),
  'start sets the deadline server-side from the challenge time limit');
check(!/p_deadline/.test(rpccode), 'no RPC accepts a client deadline');
check(!/deadline\s*=>/.test(rpccode) && !/values \([^)]*deadline[^)]*\)/i.test(rpccode),
  'deadline is never taken from client input');

const startFn = body('start_iq_attempt', rpccode);
check(/challenge not available/.test(startFn), 'start validates the challenge is published');
check(/no active student for caller/.test(startFn), 'start requires an active student');
check(/attempt limit reached/.test(startFn), 'start enforces the 3-attempt cap');
check(/v_frozen/.test(startFn) && /insert into public\.iq_attempts/.test(startFn),
  'start freezes the question set into the attempt row');
check(/'in_progress'::text/.test(startFn), 'start reports in_progress with a fresh attempt');
check(/returning \* into v_row/.test(startFn), 'start creates the attempt row');
check(/no daily challenge today/.test(startFn), 'start refuses a daily challenge with no published set');

const saveFn = body('save_iq_answer', rpccode);
check(/'attempt expired'/.test(saveFn), 'save rejects writes after the deadline');
check(/a\.status = 'in_progress'/.test(saveFn), 'save only works on an active attempt');
check(/on conflict \(attempt_id, question_id\)/.test(saveFn), 'save upserts one row per question');
check(/is_correct = null/.test(saveFn), 'save never writes correctness');

const getFn = body('get_iq_attempt', rpccode);
check(/perform public\.finalize_iq_attempt\(v_attempt\.id\)/.test(getFn),
  'get auto-finalizes an expired in_progress attempt');
check(/now\(\) >= v_attempt\.deadline/.test(getFn), 'expiry decided by server time in get');

const finFn = body('finalize_iq_attempt', rpccode);
check(/if not found or v_attempt\.status <> 'in_progress' then/.test(finFn),
  'finalize runs exactly once (refuses a non-active attempt)');
check(/left join public\.iq_answers an/.test(finFn), 'finalize grades unanswered questions as missing');
check(/status = case when now\(\) >= a\.deadline then 'expired' else 'submitted' end/.test(finFn),
  'finalize distinguishes expired from submitted');
check(/duration_ms = greatest\(0/.test(finFn), 'finalize stores duration from server timestamps');
check(/category_scores = v_cat/.test(finFn) && /correct_count = v_correct/.test(finFn),
  'finalize stores category performance and correct count');
check(/performance_level = public\.iq_performance_level\(/.test(finFn),
  'finalize derives the performance level');

const subFn = body('submit_iq_attempt', rpccode);
check(/if v_attempt\.status = 'in_progress' then/.test(subFn), 'submit only grades an active attempt');
check(/pg_advisory_xact_lock\(hashtext\('iq_submit:/.test(subFn), 'submit serializes concurrent submits');
const lockAt = subFn.indexOf('pg_advisory_xact_lock');
const rereadAt = subFn.indexOf('select * into v_attempt', lockAt);
check(lockAt >= 0 && rereadAt > lockAt, 'submit re-reads status after acquiring the lock');
check(/public\.iq_attempt_payload\(p_attempt_id\)/.test(subFn),
  'replayed submit returns the stored result unchanged (idempotent)');

// Grader fail-closed: null / malformed answers are never correct.
const gradeFn = body('grade_iq_answer', rpccode);
check(/if p_key is null or p_answer is null/.test(gradeFn), 'grader fails closed on a null answer');
check(/else\s+v_ok := false;/.test(gradeFn), 'grader fails closed on an unknown answer shape');
check(/v_ok := coalesce\(v_ok, false\)/.test(gradeFn), 'grader never returns null correctness');

// ================= SCORING =================

// Mirror of the documented contract. Factors are kept in exact tenths so the
// mirror has no binary-float drift; round() on positive numerics in Postgres
// is half-away-from-zero, which floor(x + 0.5) matches on this domain.
const FACTOR_TENTHS = { 1: 6, 2: 8, 3: 10, 4: 13, 5: 16 };
function maxFor(points, difficulty) {
  const t = FACTOR_TENTHS[difficulty];
  if (t === undefined) throw new Error('bad difficulty');
  return Math.max(1, Math.floor((points * t) / 10 + 0.5));
}
function earnedFor(points, difficulty, correct) {
  return correct ? maxFor(points, difficulty) : 0;
}
function percentage(score, max) {
  if (!(max > 0)) return 0;
  return Math.round((score * 10000) / max) / 100;
}
function level(pct) {
  if (pct == null) return null;
  if (pct < 40) return 'Developing';
  if (pct < 60) return 'Starter Solver';
  if (pct < 80) return 'Problem Solver';
  if (pct < 93) return 'Strong Reasoner';
  return 'Top Reasoner';
}

// Every difficulty factor, exactly as specified.
check(maxFor(10, 1) === 6, 'difficulty 1 factor 0.6 -> 10pts = 6');
check(maxFor(10, 2) === 8, 'difficulty 2 factor 0.8 -> 10pts = 8');
check(maxFor(10, 3) === 10, 'difficulty 3 factor 1.0 -> 10pts = 10');
check(maxFor(10, 4) === 13, 'difficulty 4 factor 1.3 -> 10pts = 13');
check(maxFor(10, 5) === 16, 'difficulty 5 factor 1.6 -> 10pts = 16');
check(maxFor(5, 4) === 7, 'rounding half away from zero: 5*1.3 = 6.5 -> 7');
check(maxFor(1, 1) === 1, 'greatest(1, ...): a correct answer is never 0');
check(maxFor(1, 5) === 2, '1pt at difficulty 5 -> 2');
check(earnedFor(10, 3, false) === 0, 'incorrect answer earns 0');

// Deterministic across repeated evaluation.
const vec = [[10, 1, true], [10, 2, true], [10, 3, true], [10, 4, false], [10, 5, true]];
const once = vec.map(([p, d, c]) => earnedFor(p, d, c)).join(',');
const again = vec.map(([p, d, c]) => earnedFor(p, d, c)).join(',');
check(once === again, 'scoring is deterministic (same input, same output)');
const score = vec.reduce((s, [p, d, c]) => s + earnedFor(p, d, c), 0);
const max = vec.reduce((s, [p, d]) => s + maxFor(p, d), 0);
check(max === 53, `max_score for the fixture = 53 (got ${max})`);
check(score === 40, `fixture score = 40 (got ${score})`);
check(percentage(score, max) === 75.47, `percentage = 75.47 (got ${percentage(score, max)})`);
check(percentage(53, 53) === 100, 'a perfect run reports 100');
check(percentage(0, 53) === 0, 'all wrong reports 0');
check(percentage(10, 0) === 0, 'zero max never divides by zero');
check(level(39.99) === 'Developing' && level(40) === 'Starter Solver'
  && level(59.99) === 'Starter Solver' && level(60) === 'Problem Solver'
  && level(79.99) === 'Problem Solver' && level(80) === 'Strong Reasoner'
  && level(92.99) === 'Strong Reasoner' && level(93) === 'Top Reasoner'
  && level(100) === 'Top Reasoner', 'performance level bands');

// SQL contract for the same numbers.
check(/when 1 then 0\.6/.test(rpccode) && /when 2 then 0\.8/.test(rpccode)
  && /when 3 then 1\.0/.test(rpccode) && /when 4 then 1\.3/.test(rpccode)
  && /when 5 then 1\.6/.test(rpccode), 'difficulty factors declared exactly');
check(/greatest\(1, round\(r\.points \* v_factor\)\)/.test(finFn), 'max = greatest(1, round(points * factor))');
check(/v_speed constant numeric := 1\.0/.test(finFn), 'M1 speed factor is the fixed constant 1.0');
check(/round\(r\.points \* v_factor \* v_speed\)/.test(finFn),
  'earned multiplies by the speed factor (1.0 in M1, swappable later)');
check(/else 0 end/.test(finFn), 'incorrect answers score 0 in SQL');
check(/round\(v_score \* 100\.0 \/ v_max, 2\)/.test(finFn), 'percentage rounded to 2 decimals server-side');
check(/elapsed_ms/.test(saveFn) && /elapsed_ms\s+int/.test(f),
  'elapsed_ms captured (ready for a future speed bonus, no migration needed)');
check(/extract\(epoch from \(now\(\) - v_started\)\)/.test(saveFn),
  'elapsed_ms derived from server timestamps only');

// No IQ conversion formula anywhere.
check(!/\biq\s*score\b|\bvalidat(ed|ed)\s+iq\b|clinical|psychometric/i.test(rpc),
  'no clinical/psychometric IQ claim in the scoring SQL');
check(/'Challenge|performance_level|category_scores/.test(rpc),
  'reports performance level and category scores');
check(!/percentile|norm(ed|ative)?\s+distribution|age\s*-/i.test(rpc),
  'no normative/percentile curve');

// ================= CLIENT CANNOT MANIPULATE =================
// Only the 5 client-reachable RPCs matter: internal helpers (graders, level
// bands) are revoked from anon/authenticated and are not an attack surface.
const PUBLIC_RPCS = ['start_iq_attempt', 'get_iq_attempt', 'save_iq_answer',
  'submit_iq_attempt', 'list_my_iq_attempts'];
const pubRpcCode = PUBLIC_RPCS.map((n) => body(n, rpccode)).join('\n');
check(PUBLIC_RPCS.every((n) => body(n, rpccode).length > 0), 'all 5 public RPCs parsed');

const params = new Set();
for (const m of pubRpcCode.matchAll(/create or replace function public\.\w+\(([^)]*)\)/g)) {
  for (const p of m[1].split(',')) {
    const name = p.trim().split(/\s+/)[0];
    if (name.startsWith('p_')) params.add(name);
  }
}
const allowed = ['p_challenge_id', 'p_attempt_id', 'p_question_id', 'p_answer'];
const extra = [...params].filter((p) => !allowed.includes(p));
check(extra.length === 0, `RPCs accept only ids + raw answer (extra: ${extra.join(',') || 'none'})`);
check(!/p_score|p_points|p_is_correct|p_percentage|p_performance_level/.test(pubRpcCode),
  'no score-bearing parameter exists');
check(!/\bp_difficulty\b/.test(pubRpcCode), 'no client-supplied difficulty parameter exists');

// ================= ISOLATION =================
const iqDir = resolve(root, 'src/features/iqbrain');
check(existsSync(iqDir), 'IQ feature lives in src/features/iqbrain');
const iqFiles = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)$/.test(e.name)) iqFiles.push(p);
  }
})(iqDir);
check(iqFiles.length > 0, `IQ feature has source files (${iqFiles.length})`);
const forbidden = ['homework', 'payments', 'exams', 'groups', 'onlineTests', 'games/', 'rankings',
  'achievements', 'certificates'];
for (const file of iqFiles) {
  const src = readFileSync(file, 'utf8');
  for (const dep of forbidden) {
    check(!src.includes(dep), `${file.replace(root + '/', '')} does not import ${dep}`);
  }
  check(!/student_xp|point_transactions|game_points|is_admin\(\)/.test(src),
    `${file.replace(root + '/', '')} does not touch XP / points / ranking`);
}
check(!/iqbrain/.test(read('src/features/homework/pages/Homework.jsx') + read('src/features/onlineTests/pages/OnlineTestRunner.jsx')),
  'protected feature pages do not reference iqbrain');

const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((n) => n.startsWith('20261119'));
check(migrations.length === 3, `exactly 3 new IQ migrations (got ${migrations.length}: ${migrations.join(',')})`);

console.log(failures === 0 ? 'ALL IQ-BRAIN-LIFECYCLE-SCORING CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
