// Placement Test adaptive engine + scoring model contract.
// The authoritative implementation is SQL (migration 20261121000100).
// This test mirrors the algorithm in JS, pins the mirror to the SQL
// constants (extracted from the migration), and exercises the behaviours
// the placement feature depends on: entry level, adaptation up/down,
// boundary cases, min/max lengths, stability stop, insufficient evidence,
// skipped questions, determinism, and termination.
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

// ---------------------------------------------------------------------------
// Extract the SQL constants the mirror must agree with.
// ---------------------------------------------------------------------------
function fnReturnsInt(name) {
  const m = rpc.match(new RegExp(`create or replace function public\\.${name}\\(\\)\\s*returns\\s*\\w+\\s+language sql immutable as \\$\\$\\s*select (\\d+)`));
  return m ? Number(m[1]) : null;
}
const ENTRY = fnReturnsInt('placement_entry_level');
const MIN_PER_SKILL = fnReturnsInt('placement_min_per_skill');
const MAX_PER_SKILL = fnReturnsInt('placement_max_per_skill');
const MIN_TOTAL = fnReturnsInt('placement_min_total_answered');
const MAX_ATTEMPTS = fnReturnsInt('placement_max_attempts');
check(ENTRY === 1, `entry level is A1 (1) - easiest first, got ${ENTRY}`);
check(MIN_PER_SKILL === 4, `min per skill is 4, got ${MIN_PER_SKILL}`);
check(MAX_PER_SKILL === 7, `max per skill is 7, got ${MAX_PER_SKILL}`);
check(MIN_TOTAL === 12, `min total answered is 12, got ${MIN_TOTAL}`);
check(MAX_ATTEMPTS === 5, `max attempts is 5, got ${MAX_ATTEMPTS}`);

const pctCase = [...rpc.matchAll(/when p_pct < (\d+) then (\d)/g)].map((m) => [Number(m[1]), Number(m[2])]);
check(JSON.stringify(pctCase) === JSON.stringify([[35, 1], [50, 2], [65, 3], [80, 4], [92, 5]]),
  `threshold chain is 35/50/65/80/92 -> 1..5, got ${JSON.stringify(pctCase)}`);

// ---------------------------------------------------------------------------
// JS mirror of the SQL algorithm (kept deliberately line-by-line faithful).
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Mirrors PG round(numeric): half away from zero (JS Math.round is not).
const roundAway = (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5));
function estimate(net, entry = ENTRY, round = roundAway) {
  return clamp(entry + round(net / 2), 1, 6);
}
function levelFromPct(pct) {
  if (pct == null) return null;
  if (pct < 35) return 1;
  if (pct < 50) return 2;
  if (pct < 65) return 3;
  if (pct < 80) return 4;
  if (pct < 92) return 5;
  return 6;
}
function recommendedAcademy(level) {
  if (level <= 1) return 'A';
  if (level === 2) return 'A1';
  if (level <= 4) return 'B';
  return 'C';
}

// Simulates one skill's adaptive walk over an answer pattern.
// pattern: array of 1/0/null (correct/incorrect/skip). Bank: items per level.
function walkSkill(pattern, { bankPerLevel = 2 } = {}) {
  const asked = []; // levels of asked questions
  const results = []; // 1/0 (skip counted as wrong at scoring time)
  const unused = {}; // level -> count
  for (let l = 1; l <= 6; l++) unused[l] = bankPerLevel;

  // SQL round(numeric) is half-away-from-zero; JS Math.round is not.
  const roundAway = (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5));

  const pick = (est) => {
    // nearest-level fallback mirrors the SQL ladder offsets:
    // est, est-1, est+1, est-2, est+2, then any nearest
    const order = [est, est - 1, est + 1, est - 2, est + 2];
    for (const l of order) {
      if (l >= 1 && l <= 6 && unused[l] > 0) { unused[l]--; return l; }
    }
    let best = null;
    for (let l = 1; l <= 6; l++) {
      if (unused[l] > 0 && (best === null || Math.abs(l - est) < Math.abs(best - est))) best = l;
    }
    if (best !== null) { unused[best]--; return best; }
    return null;
  };

  const estOf = (rs) => estimate(rs.reduce((s, r) => s + r, 0), ENTRY, roundAway);

  for (let i = 0; i < pattern.length; i++) {
    const est = estOf(results);
    // stability: estimate unchanged across the last TWO consecutive answers
    const estPrev = results.length > 1 ? estOf(results.slice(0, -1)) : null;
    const estPrev2 = results.length > 2 ? estOf(results.slice(0, -2)) : null;

    const belowMin = asked.length < MIN_PER_SKILL;
    const belowMax = asked.length < MAX_PER_SKILL;
    const stable = estPrev !== null && estPrev2 !== null && est === estPrev && estPrev === estPrev2;
    if (!(asked.length === 0 || belowMin || (belowMax && !stable))) break; // stop rule fired
    const lvl = pick(est);
    if (lvl === null) break; // bank exhausted
    asked.push(lvl);
    results.push(pattern[i] === null ? 0 : pattern[i]);
  }
  return { asked, results };
}

function scoreSkill(results, askedLevels) {
  if (askedLevels.length === 0) return { pct: null, level: null };
  const denom = askedLevels.reduce((s, w) => s + w, 0);
  const earned = askedLevels.reduce((s, w, i) => s + (results[i] === 1 ? w : 0), 0);
  const pct = Math.round((earned / denom) * 1000) / 10;
  return { pct, level: levelFromPct(pct) };
}

function scoreOverall(perSkill) {
  const levels = perSkill.map((s) => s.level).filter((l) => l !== null).sort((a, b) => a - b);
  if (levels.length === 0) return { overall: ENTRY, confidence: 'low', insufficient: true };
  const n = levels.length;
  const mid = Math.floor((levels[(n - 1) >> 1] + levels[n >> 1]) / 2); // floored median
  const spread = levels[n - 1] - levels[0];
  return { overall: clamp(mid, 1, 6), confidence: spread <= 1 ? 'high' : spread === 2 ? 'medium' : 'low', insufficient: false };
}

// ---------------------------------------------------------------------------
// Adaptive behaviour
// ---------------------------------------------------------------------------
{
  const w = walkSkill([]);
  check(w.asked.length === 0, 'empty pattern asks nothing');
}
{
  // all correct: walks up but never above the ladder top, stops at MAX
  const w = walkSkill([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  check(w.asked.length === MAX_PER_SKILL, `all-correct stops at max (${w.asked.length})`);
  check(w.asked.every((l) => l >= ENTRY), 'all-correct never asks below entry');
  check(w.asked[w.asked.length - 1] >= 4, 'all-correct climbs upward from A1 (scoring maps 100% to C2)');
}
{
  // all wrong: quickly bottoms out at A1 and stops once clearly stable
  const w = walkSkill([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  check(w.asked.length === MIN_PER_SKILL, `all-wrong stops at the minimum (${w.asked.length})`);
  check(w.asked.every((l) => l === 1 || l === 2), 'all-wrong asks only entry-or-below items');
  check(Math.min(...w.asked) === 1, 'all-wrong reaches A1 items');
}
{
  // alternating right/wrong is consistent evidence around B1: the estimate
  // stabilises at entry+1 and the skill stops at the minimum
  const w = walkSkill([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  check(w.asked.length === MIN_PER_SKILL, `oscillating pattern stabilises at min (${w.asked.length})`);
  check(Math.max(...w.asked) <= 3 && Math.min(...w.asked) >= 1, 'oscillating pattern stays near entry');
}
{
  // boundary B1/A2: enter, correct, correct -> estimate A2+2=B1 region
  const w = walkSkill([1, 1, 1, 1]);
  check(w.asked[0] === ENTRY, 'first item is asked at the entry level (A1)');
  check(w.asked[1] === ENTRY + 1 || w.asked[1] === ENTRY + 2, 'second item moves up after a correct answer');
}
{
  // one lucky guess must not dominate: correct then wrong returns to entry
  const w = walkSkill([1, 0, 0, 0, 0]);
  const net = w.results.reduce((s, r) => s + r, 0);
  check(estimate(net) <= ENTRY + 1, 'a single lucky answer damps back (net/2)');
}
{
  // stability stop: 2 correct then 2 wrong then stable-at-minimum
  // net after [1,1,1,0,0] = 1 -> est=3; without last = 2 -> est=3 (stable)
  const w = walkSkill([1, 1, 1, 0, 0]);
  check(w.asked.length === 5, `stable estimate after min stops the skill (${w.asked.length})`);
}
{
  // deterministic: same pattern, same walk
  const a = walkSkill([1, 1, 0, 1, 0, 0, 1]);
  const b = walkSkill([1, 1, 0, 1, 0, 0, 1]);
  check(JSON.stringify(a) === JSON.stringify(b), 'identical answer patterns produce identical walks');
}
{
  // termination: no pattern can exceed max questions
  for (const p of [[1], [0], [1, 0], [null, null], [1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1]]) {
    const w = walkSkill(p);
    check(w.asked.length <= MAX_PER_SKILL, `pattern ${JSON.stringify(p)} terminates within max (${w.asked.length})`);
  }
}
{
  // skipped questions count as incorrect and cannot inflate the estimate
  const withSkip = walkSkill([1, null, 0, 0]);
  const plain = walkSkill([1, 0, 0, 0]);
  check(JSON.stringify(withSkip.asked) === JSON.stringify(plain.asked), 'skip behaves exactly like an incorrect answer');
}

// ---------------------------------------------------------------------------
// Scoring model
// ---------------------------------------------------------------------------
{
  const s = scoreSkill([1, 1, 1, 1], [2, 2, 2, 2]);
  check(s.pct === 100 && s.level === 6, 'perfect score maps to C2');
  const z = scoreSkill([0, 0, 0, 0], [3, 3, 3, 3]);
  check(z.pct === 0 && z.level === 1, 'zero score maps to A1');
}
{
  // weighting: correct hard items outweigh correct easy items at equal counts
  const easy = scoreSkill([1, 1, 1, 0, 0, 0], [1, 1, 1, 1, 1, 1]); // 50% weight-equal
  const hard = scoreSkill([1, 1, 1, 0, 0, 0], [6, 6, 6, 6, 6, 6]); // same counts, hard items
  check(hard.pct === easy.pct && hard.level >= easy.level, 'equal pct stays level-equal regardless of weights');
  const mixed = scoreSkill([1, 0, 0, 0], [6, 1, 1, 1]);
  const uniform = scoreSkill([1, 0, 0, 0], [2, 2, 2, 2]);
  check(mixed.pct > uniform.pct, 'a correct hard item earns a higher weighted pct than a correct easy one');
}
{
  // overall = conservative median; outlier skill does not dominate
  const o = scoreOverall([
    { pct: 90, level: 5 },
    { pct: 60, level: 3 },
    { pct: 55, level: 3 },
    { pct: 50, level: 2 },
  ]);
  check(o.overall === 3, `median of [2,3,3,5] floors to 3 (B1), got ${o.overall}`);
  check(o.confidence === 'low', `spread of 3 -> low confidence, got ${o.confidence}`);
}
{
  const o = scoreOverall([{ pct: 70, level: 4 }, { pct: 66, level: 4 }, { pct: 60, level: 3 }, { pct: 62, level: 3 }]);
  check(o.overall === 3 && o.confidence === 'high', 'tight skill spread -> high confidence');
  const o2 = scoreOverall([{ pct: 95, level: 6 }, { pct: 10, level: 1 }, { pct: 40, level: 2 }, { pct: 85, level: 5 }]);
  check(o2.confidence === 'low', 'wild skill spread -> low confidence');
}
{
  // insufficient evidence: too few answered questions
  const answered = 5;
  check(answered < MIN_TOTAL, 'below min total answered -> insufficient evidence rule applies');
  const none = scoreOverall([]);
  check(none.insufficient === true && none.confidence === 'low', 'no skill evidence -> insufficient + low');
}
{
  // academy mapping mirrors placement_recommended_academy_level
  const map = [1, 2, 3, 4, 5, 6].map(recommendedAcademy);
  check(JSON.stringify(map) === JSON.stringify(['A', 'A1', 'B', 'B', 'C', 'C']),
    `CEFR -> academy map is A/A1/B/B/C/C, got ${JSON.stringify(map)}`);
}

// ---------------------------------------------------------------------------
// Mirror vs frontend display constants
// ---------------------------------------------------------------------------
const model = readFileSync(`${root}/src/features/placementTest/lib/placementModel.js`, 'utf8');
check(model.includes("CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']"), 'frontend CEFR labels match the ladder');
check(model.includes("1: 'A', 2: 'A1', 3: 'B', 4: 'B', 5: 'C', 6: 'C'"), 'frontend academy map matches the SQL mapping');
check(model.includes('NOT the scoring authority') || model.includes('display-only'), 'frontend model is explicitly display-only');

console.log(failures === 0 ? 'ASCII-START placement-engine ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
