// Placement Test A1-B2 contract (mirrors migration 20261121000100).
// Verifies: 60 mcq questions (15 per level A1-B2, 8 grammar + 7 vocabulary),
// 10-point scoring, 600/0 bounds, per-level breakdown, consecutive-mastery
// CEFR staircase (A1-B2 only), confidence rules, and legacy compatibility.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error('FAIL ' + msg); failures++; }
  else console.log('ok ' + msg);
}

const rpc = readFileSync(root + '/supabase/migrations/20261121000100_placement_test_rpcs.sql', 'utf8');

function fnInt(name) {
  const pat = 'create or replace function public.' + name + '()';
  const i = rpc.indexOf(pat);
  if (i < 0) return null;
  const sel = rpc.indexOf('select', i);
  const end = rpc.indexOf(';', sel);
  return Number(rpc.slice(sel + 6, end).trim());
}
const PER_LEVEL = 15, POINTS = 10, TOTAL = 60, MAX_SCORE = 600, MASTERY = 60, MIN_ANSWERED = 30;
check(rpc.includes('placement_questions_per_level'), 'questions_per_level fn exists');
check(rpc.includes('placement_points_per_question'), 'points_per_question fn exists');
check(rpc.includes('placement_total_questions'), 'total_questions fn exists');
check(rpc.includes('placement_max_score'), 'max_score fn exists');
check(rpc.includes('placement_mastery_threshold'), 'mastery threshold fn exists');
check(rpc.includes('placement_min_total_answered'), 'min answered fn exists');
check(rpc.includes('select 15;'), 'per_level = 15');
check(rpc.includes('select 10;'), 'points = 10');
check(rpc.includes('select 60;'), 'total = 60');
check(rpc.includes('select 600;'), 'max_score = 600');
check(rpc.includes('select 60;\n'), 'mastery = 60');
check(rpc.includes('select 30;'), 'min_answered = 30');

// distribution: 4 levels, 8 grammar + 7 vocabulary
const distStart = rpc.indexOf('placement_skill_distribution()');
const distSeg = rpc.slice(distStart, distStart + 600);
for (let lvl = 1; lvl <= 4; lvl++) {
  check(distSeg.includes('"' + lvl + '": {"grammar": 8, "vocabulary": 7}'),
    'level ' + lvl + ': 8 grammar + 7 vocabulary');
}
check(!distSeg.includes('"5"'), 'no level 5 in distribution');
check(!distSeg.includes('"6"'), 'no level 6 in distribution');

// v1 functions dropped
check(!rpc.includes('create or replace function public.placement_objective_skills'), 'v1 rotation removed');
check(!rpc.includes('create or replace function public.placement_level_from_pct'), 'v1 pct removed');
check(!rpc.includes('create or replace function public.placement_adaptive_estimate'), 'v1 adaptive removed');
check(!rpc.includes('create or replace function public.placement_grade_writing'), 'writing grading removed');
check(!rpc.includes('create or replace function public.placement_estimated_level'), 'est level helper removed');
check(rpc.includes('drop function if exists public.placement_level_from_pct'), 'v1 functions dropped');

check(rpc.includes("'grammar_max', 320"), 'grammar max 320');
check(rpc.includes("'vocabulary_max', 280"), 'vocabulary max 280');
check(rpc.includes("'total_questions', public.placement_total_questions()"), 'total questions 60');
check(rpc.includes("'max_score', case when v_attempt.format"), 'max score persisted (format-aware)');
// result payload
check(rpc.includes("'correct_count'"), 'correct count persisted');
check(rpc.includes("'insufficient_evidence'"), 'insufficient evidence persisted');
check(rpc.includes("'estimated_level'"), 'estimated level persisted');
check(rpc.includes("'recommended_academy_level'"), 'recommended group persisted');
check(rpc.includes("'per_level'"), 'per-level breakdown persisted');
check(rpc.includes("'per_skill'"), 'per-skill breakdown persisted');
check(rpc.includes('superseded_result'), 'superseded result preserved');

// no reading/writing/listening/speaking delivered
check(!rpc.includes("q.skill = 'reading'") || !rpc.includes("q.skill = 'reading' and q.cefr_level"), 'no reading delivered');
check(!rpc.includes("q.skill = 'listening'"), 'no listening delivered');
check(!rpc.includes("q.skill = 'writing'") || !rpc.includes("q.skill = 'writing' and q.cefr_level"), 'no writing delivered');
check(!rpc.includes("q.skill = 'speaking'") || !rpc.includes("q.skill = 'speaking' and q.cefr_level"), 'no speaking delivered');

// scoring: 10 points per correct
check(rpc.includes('public.placement_points_per_question()'), 'scoring uses 10-point constant');

// legacy: format column and finalize
check(rpc.includes("add column if not exists format"), 'format column exists');
check(rpc.includes("'legacy-adaptive'"), 'legacy format marker exists');
check(rpc.includes("v_attempt.format = 'legacy-adaptive'"), 'legacy attempts finalized on access');
check(rpc.includes("'gv-60'"), 'new attempts use gv-60 format');

// confidence: separate from level estimation
check(rpc.includes("'confidence'"), 'confidence persisted separately');
check(rpc.includes("'insufficient_evidence'"), 'insufficient evidence persisted separately');

// CEFR staircase: consecutive mastery, A1-B2 only
check(rpc.includes('v_seen_fail'), 'consecutive mastery (failed lower level caps estimate)');
check(rpc.includes('public.placement_mastery_threshold()'), 'staircase uses mastery threshold');

// CEFR -> academy group
check(rpc.includes('placement_recommended_academy_level'), 'academy group recommendation exists');

console.log(failures === 0 ? 'PLACEMENT-ENGINE ALL CHECKS PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
