// engine.js
// Pure, testable Geography game engine - no React, no DOM, no network.
// GeographyPlay renders; this module decides pools, questions and score
// so a future server integration only replaces the scoring sink.
import { COUNTRIES, PLAY_DIFFICULTIES } from '../data/countries.js';

export const ROUND_LENGTH = 10;
export const BASE_POINTS = 100;
export const STREAK_BONUS_PER = 10;
export const STREAK_BONUS_CAP = 50;
export const SPEED_BONUS_FAST = 20; // answered within 5s
export const SPEED_BONUS_OK = 10; // answered within 10s
export const SPEED_FAST_SEC = 5;
export const SPEED_OK_SEC = 10;

export function flagUrl(iso2, width = 320) {
  const w = [160, 320, 640].includes(width) ? width : 320;
  return `https://flagcdn.com/w${w}/${String(iso2 || '').toLowerCase()}.png`;
}

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Difficulty filter. Unknown/empty selection falls back to the full set
// so the game never crashes on a thin pool.
export function filterPoolByDifficulty(records = COUNTRIES, difficulty = 'mixed') {
  const list = Array.isArray(records) ? records : [];
  if (!PLAY_DIFFICULTIES.includes(difficulty)) return [...list];
  if (difficulty === 'mixed') return [...list];
  const filtered = list.filter((r) => r.difficulty === difficulty);
  return filtered.length > 0 ? filtered : [...list];
}

// Answer dimensions the engine can quiz on. 'language' resolves to the
// record's primary language (languages[0]); the other keys are scalar
// fields. Returns null for unknown keys so callers can guard.
export function answerValue(record, answerKey) {
  if (!record) return null;
  if (answerKey === 'language' || answerKey === 'languages') {
    return Array.isArray(record.languages) && record.languages.length > 0 ? record.languages[0] : null;
  }
  const v = record[answerKey];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// All records in `dataset` whose answer dimension equals `value`.
// Relationships are many-to-many (Spanish -> many countries), so this
// returns an array - the future language->country / nationality->country
// modes must accept any listed record, never assume exactly one.
export function findCountriesByAnswer(dataset = COUNTRIES, answerKey, value) {
  const list = Array.isArray(dataset) ? dataset : [];
  if (answerKey === 'language' || answerKey === 'languages') {
    return list.filter((r) => Array.isArray(r.languages) && r.languages.includes(value));
  }
  return list.filter((r) => r[answerKey] === value);
}

// Pick up to `count` distractors for `target`, preferring same region,
// then same difficulty, then the rest of the pool. `keyFn` selects the
// answer dimension ('country', 'nationality', 'language', 'capital',
// 'region') so duplicates are judged in the displayed dimension.
// Never returns the target itself.
export function pickDistractors(target, pool, count = 3, keyFn = (r) => answerValue(r, 'country'), rand = Math.random) {
  const key = keyFn(target);
  const seen = new Set([key]);
  const out = [];
  const tiers = [
    pool.filter((r) => r.region === target.region),
    pool.filter((r) => r.difficulty === target.difficulty),
    pool,
  ];
  for (const tier of tiers) {
    for (const cand of shuffle(tier, rand)) {
      if (out.length >= count) break;
      if (cand.iso2 === target.iso2) continue;
      const k = keyFn(cand);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(cand);
    }
    if (out.length >= count) break;
  }
  return out;
}

// Build one 4-choice question. Always returns exactly 4 unique options
// with the correct answer present exactly once.
export function buildQuestion(target, pool, { answerKey = 'country', rand = Math.random } = {}) {
  const keyFn = (r) => answerValue(r, answerKey);
  const distractors = pickDistractors(target, pool, 3, keyFn, rand);
  const options = shuffle([keyFn(target), ...distractors.map(keyFn)], rand);
  return {
    iso2: target.iso2,
    country: target.country,
    nationality: target.nationality,
    languages: Array.isArray(target.languages) ? [...target.languages] : [],
    capital: target.capital,
    region: target.region,
    difficulty: target.difficulty,
    funFact: target.funFact,
    flagUrl: flagUrl(target.iso2),
    options,
    correct: keyFn(target),
  };
}

// Build a full round of `count` questions. Cycles the shuffled pool when
// it is smaller than the round so thin pools (hard/expert) still play.
export function buildRound(dataset = COUNTRIES, { count = ROUND_LENGTH, difficulty = 'mixed', answerKey = 'country', rand = Math.random } = {}) {
  const pool = filterPoolByDifficulty(dataset, difficulty);
  if (pool.length === 0) return [];
  const order = shuffle(pool, rand);
  const questions = [];
  for (let i = 0; i < count; i++) {
    const target = order[i % order.length];
    questions.push(buildQuestion(target, pool, { answerKey, rand }));
  }
  return questions;
}

// --- Scoring (local-only in v1; integration point for future server) ---
export function scoreAnswer({ isCorrect, streakBefore = 0, elapsedSec = null }) {
  if (!isCorrect) return { points: 0, isCorrect: false };
  let points = BASE_POINTS;
  points += Math.min(streakBefore * STREAK_BONUS_PER, STREAK_BONUS_CAP);
  if (elapsedSec != null) {
    if (elapsedSec <= SPEED_FAST_SEC) points += SPEED_BONUS_FAST;
    else if (elapsedSec <= SPEED_OK_SEC) points += SPEED_BONUS_OK;
  }
  return { points, isCorrect: true };
}

export function initialScoreState() {
  return { score: 0, correct: 0, total: 0, streak: 0, bestStreak: 0 };
}

// Fold one answered question into the running totals.
export function applyAnswer(state, { isCorrect, points = 0 }) {
  const streak = isCorrect ? state.streak + 1 : 0;
  return {
    score: state.score + (isCorrect ? points : 0),
    correct: state.correct + (isCorrect ? 1 : 0),
    total: state.total + 1,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
  };
}

export function accuracy(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

export function isRoundComplete(answeredCount, roundLength = ROUND_LENGTH) {
  return answeredCount >= roundLength;
}
