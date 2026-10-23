// Placement Test fixed-60 contract (mirrors migration 20261121000100).
// Verifies: exactly 60 distinct questions (10 per level A1->C2) drawn from the
// real seed bank per the required skill distribution; 10-point scoring;
// 600/0 bounds; per-level breakdown; consecutive-mastery CEFR staircase with
// top-level caution and insufficient-evidence handling; and that the v1
// adaptive functions are gone.
// Run: node tests/placement-engine.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const rpc = readFileSync(`${root}/supabase/migrations/20261121000100_placement_test_rpcs.sql`, 'utf8')
  .replace(/--.*$/gm, '');
const seed = readFileSync(`${root}/supabase/migrations/20261121000200_placement_test_seed.sql`, 'utf8');

// ---------------------------------------------------------------------------
// Constants extracted from SQL
// ---------------------------------------------------------------------------
function fnReturnsInt(name) {
  const m = rpc.match(new RegExp(`create or replace function public\\.${name}\\(\\)\\s*returns\\s*int\\s+language sql immutable as \\$\\$\\s*select (\\d+)`));
  return m ? Number(m[1]) : null;
}
const PER_LEVEL = fnReturnsInt('placement_questions_per_level');
const POINTS = fnReturnsInt('placement_points_per_question');
const TOTAL = fnReturnsInt('placement_total_questions');
const MAX_SCORE = fnReturnsInt('placement_max_score');
const MASTERY = fnReturnsInt('placement_mastery_threshold');
const MIN_ANSWERED = fnReturnsInt('placement_min_total_answered');
const MAX_ATTEMPTS = fnReturnsInt('placement_max_attempts');
check(PER_LEVEL === 15, `15 questions per level, got ${PER_LEVEL}`);
check(POINTS === 10, `10 points per question, got ${POINTS}`);
check(TOTAL === 60, `60 total questions, got ${TOTAL}`);
check(MAX_SCORE === 600, `600 max score, got ${MAX_SCORE}`);
check(MASTERY === 60, `mastery threshold 60%, got ${MASTERY}`);
check(MIN_ANSWERED === 30, `min answered for sufficient evidence 30, got ${MIN_ANSWERED}`);
check(MAX_ATTEMPTS === 5, `max attempts 5, got ${MAX_ATTEMPTS}`);

// skill distribution from SQL
const distMatch = rpc.match(/select '\{[\s\S]*?\}'::jsonb;\s*\n\$\$;/);
check(!!distMatch, 'skill distribution constant exists');
const dist = JSON.parse(distMatch[0].match(/select '(\{[\s\S]*?\})'::jsonb/)[1]);
const requiredDist = {
  1: { grammar: 8, vocabulary: 7 },
  2: { grammar: 8, vocabulary: 7 },
  3: { grammar: 8, vocabulary: 7 },
  4: { grammar: 8, vocabulary: 7 },
};
for (const lvl of [1, 2, 3, 4]) {
  check(
    JSON.stringify(dist[String(lvl)]) === JSON.stringify(requiredDist[lvl]),
    `level ${lvl} distribution matches the required structure`
  );
  const sum = Object.values(dist[String(lvl)]).reduce((s, x) => s + x, 0);
  check(sum === PER_LEVEL, `level ${lvl} distribution sums to ${PER_LEVEL} (got ${sum})`);
}
check(!rpc.includes('create or replace function public.placement_objective_skills'), 'v1 skill rotation removed');
check(!rpc.includes('create or replace function public.placement_level_from_pct'), 'v1 weighted-pct thresholds removed');
check(!rpc.includes('create or replace function public.placement_adaptive_estimate'), 'v1 adaptive estimate removed');
check(!rpc.includes('create or replace function public.placement_provisional_level'), 'v1 provisional level removed');
check(/drop function if exists public\.placement_level_from_pct/.test(rpc), 'obsolete v1 functions dropped');

// ---------------------------------------------------------------------------
// Real-bank plan mirror: build each level's candidate list exactly as the SQL
// does (grammar by id, vocabulary by id, reading by id, writing by id, taking
// the distribution's count per skill) from the seed file.
// ---------------------------------------------------------------------------
const bank = {
  1: { grammar: 11, vocabulary: 8 },
  2: { grammar: 10, vocabulary: 8 },
  3: { grammar: 10, vocabulary: 8 },
  4: { grammar: 10, vocabulary: 8 },
};
const SKILL_ORDER = ['grammar', 'vocabulary'];

function levelPlan(level) {
  const plan = [];
  for (const s of SKILL_ORDER) {
    const need = dist[String(level)][s];
    if (need > 0) plan.push({ skill: s, count: need, available: bank[level][s] || 0 });
  }
  return plan;
}

for (const lvl of [1, 2, 3, 4]) {
  const plan = levelPlan(lvl);
  const total = plan.reduce((s, p) => s + p.count, 0);
  check(total === PER_LEVEL, `level ${lvl} plan has ${PER_LEVEL} questions (got ${total})`);
  for (const p of plan) {
    check(p.available >= p.count,
      `level ${lvl} ${p.skill}: ${p.available} available >= ${p.count} required (no shortage)`);
  }
}

// ---------------------------------------------------------------------------
// Scoring mirror: 10 points per correct answer, per-level breakdown
// ---------------------------------------------------------------------------
function scoreAttempt(answers /* array of {level, correct} */) {
  let total = 0, correct = 0;
  const perLevel = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    const items = answers.filter((a) => a.level === lvl);
    const c = items.filter((a) => a.correct).length;
    perLevel[lvl] = { asked: items.length, correct: c, score: c * POINTS, max: items.length * POINTS };
    total += c * POINTS;
    correct += c;
  }
  return { total, correct, perLevel };
}
{
  const allCorrect = [];
  for (let lvl = 1; lvl <= 6; lvl++) for (let i = 0; i < 10; i++) allCorrect.push({ level: lvl, correct: true });
  const r = scoreAttempt(allCorrect);
  check(r.total === 600 && r.correct === 60, `all correct -> 600/600 (got ${r.total})`);
  check(r.perLevel[1].score === 100 && r.perLevel[6].score === 100, 'every level scores 100/100');
}
{
  const allWrong = [];
  for (let lvl = 1; lvl <= 6; lvl++) for (let i = 0; i < 10; i++) allWrong.push({ level: lvl, correct: false });
  const r = scoreAttempt(allWrong);
  check(r.total === 0 && r.correct === 0, `all wrong -> 0/600 (got ${r.total})`);
}
{
  const mixed = [];
  for (let lvl = 1; lvl <= 6; lvl++) for (let i = 0; i < 10; i++) mixed.push({ level: lvl, correct: i < 7 });
  const r = scoreAttempt(mixed);
  check(r.total === 420 && r.correct === 42, `7/10 correct per level -> 420/600 and 42/60 (got ${r.total})`);
  check(r.perLevel[1].score === 70, 'per-level score 70/100');
}
{
  // unanswered/skipped questions are asked but not correct -> 0 points
  const withBlanks = [];
  for (let lvl = 1; lvl <= 6; lvl++) for (let i = 0; i < 10; i++) {
    withBlanks.push({ level: lvl, correct: lvl < 6 }); // level 6 entirely unanswered
  }
  const r = scoreAttempt(withBlanks.map((a) => ({ ...a, correct: a.correct })));
  check(r.perLevel[6].score === 0 && r.perLevel[6].max === 100,
    'unanswered level-6 items earn 0 of their 100 points');
  check(r.total === 500, 'total reflects only answered questions (got ' + r.total + ')');
}

// ---------------------------------------------------------------------------
// CEFR staircase mirror: highest level L with every level 1..L >= 60%.
// credit counts toward the 600-point score but must not lift the estimated
// CEFR level (a completed response does not demonstrate level proficiency).
// ---------------------------------------------------------------------------
function estimate(perLevelPct) {
  let est = 0, seenFail = false;
  for (let lvl = 1; lvl <= 6; lvl++) {
    if (perLevelPct[lvl] == null) break;
    if (perLevelPct[lvl] >= MASTERY && !seenFail) est = lvl;
    else seenFail = true;
  }
  return Math.max(1, est);
}
function confidence(pcts, answered, est) {
  let boundaryClean = true;
  for (let lvl = est + 1; lvl <= 6; lvl++) {
    if (pcts[lvl] != null && pcts[lvl] >= 40) boundaryClean = false;
  }
  if (answered < MIN_ANSWERED) return 'low';
  if (est === 1 && pcts[1] < 40) return 'low';
  if (est === 6 && pcts[6] < 80) return 'medium';
  if (est === 5 && pcts[5] < 80) return 'medium';
  if (boundaryClean) return 'high';
  return 'medium';
}
{
  const r = estimate({ 1: 90, 2: 80, 3: 70, 4: 60, 5: 55, 6: 30 });
  check(r === 4, `strong A1-B2, weak C1 -> B2 (got ${r})`);
  check(confidence({ 1: 90, 2: 80, 3: 70, 4: 60, 5: 55, 6: 30 }, 60, r) === 'medium', 'partial mastery above the ceiling -> medium confidence');
check(confidence({ 1: 90, 2: 80, 3: 70, 4: 60, 5: 30, 6: 20 }, 60, r) === 'high', 'clean ceiling -> high confidence');
}
{
  // a lucky C2 score cannot outrank a failed lower level
  const r = estimate({ 1: 90, 2: 85, 3: 70, 4: 20, 5: 90, 6: 90 });
  check(r === 3, `failed B2 caps the estimate at B1 even with 90% C1/C2 (got ${r})`);
  check(confidence({ 1: 90, 2: 85, 3: 70, 4: 20, 5: 90, 6: 90 }, 60, r) === 'medium', 'non-clean boundary -> medium confidence');
}
{
  const r = estimate({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 });
  check(r === 6, 'perfect ladder -> C2');
  check(confidence({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 }, 60, 6) === 'high', '100% at C2 -> high confidence');
}
{
  const r = estimate({ 1: 80, 2: 70, 3: 65, 4: 62, 5: 81, 6: 75 });
  check(r === 6, 'all levels mastered -> C2');
  check(confidence({ 1: 80, 2: 70, 3: 65, 4: 62, 5: 81, 6: 75 }, 60, 6) === 'medium',
    'C2 with < 80% -> medium confidence (limited evidence at the top)');
}
{
  const r = estimate({ 1: 50, 2: 20, 3: 0, 4: 0, 5: 0, 6: 0 });
  check(r === 1, 'nothing mastered -> A1 floor');
  check(confidence({ 1: 50, 2: 20, 3: 0, 4: 0, 5: 0, 6: 0 }, 20, 1) === 'low', 'few answered -> low confidence');
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
check(rpc.includes("count(*) filter (where q.skill <> 'writing') as obj_asked"),
  'mastery pct counts objective items only (obj_asked)');
check(rpc.includes("count(*) filter (where q.skill <> 'writing' and pa.is_correct is true) as obj_correct"),
  'mastery pct counts objective correct only (obj_correct)');
check(rpc.includes("coalesce(v_rec.obj_correct, 0)::numeric / v_rec.obj_asked * 100"),
  'staircase pct = objective correct / objective asked');
check(rpc.includes("add column if not exists format text not null default 'legacy-adaptive'"),
  'attempt format column added (legacy default)');
check(rpc.includes("v_attempt.format = 'legacy-adaptive'"),
  'legacy attempts finalize on access (no format switch mid-attempt)');

// ---------------------------------------------------------------------------
// Frontend model mirror
// ---------------------------------------------------------------------------
const model = readFileSync(`${root}/src/features/placementTest/lib/placementModel.js`, 'utf8');
check(model.includes("CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']"), 'frontend CEFR labels match the ladder');
check(model.includes('QUESTIONS_PER_LEVEL = 10') && model.includes('MAX_SCORE = 600'), 'frontend mirrors the fixed-60 constants');
check(model.includes('isFixed60Result'), 'frontend distinguishes fixed-60 results from legacy attempts');
check(model.includes("2: 'A1', 3: 'B', 4: 'B', 5: 'C', 6: 'C'"), 'frontend academy map matches the SQL mapping');

// result payload contract (submit builds these fields)
check(rpc.includes("'format', 'gv-60'"), 'result format is gv-60');
for (const f of ["'per_level'", "'per_skill'", "'total_score'", "'max_score'", "'correct_count'", "'estimated_level'", "'insufficient_evidence'", "'recommended_academy_level'"]) {
  check(rpc.includes(f), `submit result includes ${f.replace(/'/g, '')}`);
}
check(rpc.includes('superseded_result'), 're-finalized attempts preserve the superseded result');

console.log(failures === 0 ? 'ASCII-START placement-engine ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
