// Geography engine tests - pure node, no DB, no DOM.
// Run: node tests/geography-engine.test.mjs
import assert from 'node:assert/strict';
import { COUNTRIES, COUNTRY_DIFFICULTIES, isValidRecord } from '../src/features/games/geography/data/countries.js';
import {
  ROUND_LENGTH,
  filterPoolByDifficulty,
  pickDistractors,
  buildQuestion,
  buildRound,
  scoreAnswer,
  initialScoreState,
  applyAnswer,
  accuracy,
  isRoundComplete,
  answerValue,
  findCountriesByAnswer,
} from '../src/features/games/geography/utils/engine.js';
import { MODES, QUESTION_TYPES, liveQuestionTypes, isValidMode, normalizeMode, buildModeQuestion } from '../src/features/games/geography/utils/modes.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Deterministic rand for stable tests.
function seededRand(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// --- Dataset ---
check('dataset has exactly 100 records', () => {
  assert.equal(COUNTRIES.length, 100);
});
check('difficulty distribution is 30/35/25/10', () => {
  const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
  for (const r of COUNTRIES) counts[r.difficulty] += 1;
  assert.deepEqual(counts, { easy: 30, medium: 35, hard: 25, expert: 10 });
});
check('every record valid (iso2/country/nationality/languages/capital/region/difficulty/funFact)', () => {
  for (const r of COUNTRIES) assert.equal(isValidRecord(r), true, JSON.stringify(r));
});
check('language arrays have no duplicates', () => {
  for (const r of COUNTRIES) assert.equal(new Set(r.languages).size, r.languages.length, r.iso2);
});
check('multilingual countries represented correctly', () => {
  const by = Object.fromEntries(COUNTRIES.map((r) => [r.country, r.languages]));
  assert.deepEqual(by['Canada'], ['English', 'French']);
  assert.ok(by['Switzerland'].length >= 3);
  assert.ok(by['Belgium'].length === 3);
  assert.ok(by['South Africa'].length >= 3);
  assert.ok(by['India'].length >= 2);
});
check('continent coverage across all six regions', () => {
  const regions = new Set(COUNTRIES.map((r) => r.region));
  for (const c of ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']) {
    assert.ok(regions.has(c), `missing ${c}`);
  }
});
check('no duplicate iso2 or country names', () => {
  const iso = new Set(COUNTRIES.map((r) => r.iso2));
  const names = new Set(COUNTRIES.map((r) => r.country));
  assert.equal(iso.size, COUNTRIES.length);
  assert.equal(names.size, COUNTRIES.length);
});
check('irregular nationalities are explicit', () => {
  const by = Object.fromEntries(COUNTRIES.map((r) => [r.country, r.nationality]));
  assert.equal(by['Spain'], 'Spanish');
  assert.equal(by['Germany'], 'German');
  assert.equal(by['Netherlands'], 'Dutch');
  assert.equal(by['Greece'], 'Greek');
  assert.equal(by['France'], 'French');
});
check('difficulty values valid', () => {
  for (const r of COUNTRIES) assert.ok(COUNTRY_DIFFICULTIES.includes(r.difficulty));
});

// --- Question generation, both modes ---
for (const mode of [MODES.country, MODES.nationality]) {
  const answerKey = mode === MODES.country ? 'country' : 'nationality';
  check(`${mode}: exactly 4 choices, 1 correct, no dupes`, () => {
    const rand = seededRand();
    for (const target of COUNTRIES.slice(0, 12)) {
      const q = buildModeQuestion(target, COUNTRIES, mode, rand);
      assert.equal(q.options.length, 4);
      assert.equal(q.mode, mode);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.options.filter((o) => o === q.correct).length, 1);
      assert.equal(q.correct, target[answerKey]);
      assert.ok(!q.options.some((o) => o == null || o === ''));
    }
  });
}
check('country mode answers are country names only', () => {
  const nationalities = new Set(COUNTRIES.map((r) => r.nationality));
  const rand = seededRand(7);
  for (const t of COUNTRIES.slice(0, 10)) {
    const q = buildModeQuestion(t, COUNTRIES, MODES.country, rand);
    for (const o of q.options) assert.ok(!nationalities.has(o) || COUNTRIES.some((r) => r.country === o), o);
    assert.equal(q.correct, t.country);
  }
});
check('nationality mode answers are nationalities only', () => {
  const countries = new Set(COUNTRIES.map((r) => r.country));
  const rand = seededRand(9);
  for (const t of COUNTRIES.slice(0, 10)) {
    const q = buildModeQuestion(t, COUNTRIES, MODES.nationality, rand);
    assert.equal(q.correct, t.nationality);
    for (const o of q.options) assert.ok(!countries.has(o) || COUNTRIES.some((r) => r.nationality === o), o);
  }
});
check('distractors exclude target', () => {
  const target = COUNTRIES[0];
  const d = pickDistractors(target, COUNTRIES, 3, (r) => r.country, seededRand(3));
  assert.equal(d.length, 3);
  assert.ok(d.every((r) => r.iso2 !== target.iso2));
  assert.equal(new Set(d.map((r) => r.country)).size, 3);
});

// --- Difficulty ---
check('easy/medium/mixed filters work', () => {
  const easy = filterPoolByDifficulty(COUNTRIES, 'easy');
  const medium = filterPoolByDifficulty(COUNTRIES, 'medium');
  const mixed = filterPoolByDifficulty(COUNTRIES, 'mixed');
  assert.ok(easy.length > 0 && easy.every((r) => r.difficulty === 'easy'));
  assert.ok(medium.length > 0 && medium.every((r) => r.difficulty === 'medium'));
  assert.equal(mixed.length, COUNTRIES.length);
});
check('unknown difficulty falls back to full pool', () => {
  assert.equal(filterPoolByDifficulty(COUNTRIES, 'nope').length, COUNTRIES.length);
});
check('thin pool still builds a full round without crashing', () => {
  const hard = filterPoolByDifficulty(COUNTRIES, 'hard');
  void hard;
  const tiny = COUNTRIES.slice(0, 2); // only 2 records: fewer than 4 choices
  const round = buildRound(tiny, { count: 4, difficulty: 'mixed', rand: seededRand(5) });
  assert.equal(round.length, 4);
  for (const q of round) assert.ok(q.options.length <= 4 && q.options.includes(q.correct));
});

// --- Scoring ---
check('correct: base + streak + speed bonus', () => {
  assert.equal(scoreAnswer({ isCorrect: true, streakBefore: 0, elapsedSec: 3 }).points, 120);
  assert.equal(scoreAnswer({ isCorrect: true, streakBefore: 2, elapsedSec: 8 }).points, 130);
  assert.equal(scoreAnswer({ isCorrect: true, streakBefore: 10, elapsedSec: 30 }).points, 150); // streak cap
  assert.equal(scoreAnswer({ isCorrect: false }).points, 0);
});
check('score/streak progression + reset + best streak', () => {
  let s = initialScoreState();
  s = applyAnswer(s, { isCorrect: true, points: 120 });
  s = applyAnswer(s, { isCorrect: true, points: 130 });
  assert.deepEqual([s.score, s.correct, s.total, s.streak, s.bestStreak], [250, 2, 2, 2, 2]);
  s = applyAnswer(s, { isCorrect: false });
  assert.deepEqual([s.streak, s.bestStreak, s.total], [0, 2, 3]);
});
check('accuracy', () => {
  assert.equal(accuracy(7, 10), 70);
  assert.equal(accuracy(0, 0), 0);
});

// --- Round ---
check('10-question round + completion', () => {
  const round = buildRound(COUNTRIES, { count: ROUND_LENGTH, difficulty: 'mixed', answerKey: 'country', rand: seededRand(11) });
  assert.equal(round.length, ROUND_LENGTH);
  assert.ok(!isRoundComplete(9));
  assert.ok(isRoundComplete(10));
  const isos = round.map((q) => q.iso2);
  assert.equal(new Set(isos).size, ROUND_LENGTH); // full pool: no repeats
});
check('mode validation', () => {
  assert.equal(isValidMode('country'), true);
  assert.equal(isValidMode('nationality'), true);
  assert.equal(isValidMode('bogus'), false);
  assert.equal(normalizeMode('bogus'), 'country');
  assert.equal(buildQuestion(COUNTRIES[0], COUNTRIES, { answerKey: 'country', rand: seededRand(1) }).options.length, 4);
});

// --- Future dimensions (Phase 2/3 architecture, no UI yet) ---
check('answerValue resolves all dimensions', () => {
  const ch = COUNTRIES.find((r) => r.iso2 === 'CH');
  assert.equal(answerValue(ch, 'country'), 'Switzerland');
  assert.equal(answerValue(ch, 'nationality'), 'Swiss');
  assert.equal(answerValue(ch, 'language'), 'German');
  assert.equal(answerValue(ch, 'capital'), 'Bern');
  assert.equal(answerValue(ch, 'region'), 'Europe');
  assert.equal(answerValue(ch, 'bogus'), null);
});
check('all future question types generate pure 4-choice questions', () => {
  const pools = {
    language: new Set(COUNTRIES.map((r) => r.languages[0])),
    capital: new Set(COUNTRIES.map((r) => r.capital)),
    region: new Set(COUNTRIES.map((r) => r.region)),
    country: new Set(COUNTRIES.map((r) => r.country)),
    nationality: new Set(COUNTRIES.map((r) => r.nationality)),
  };
  for (const [type, spec] of Object.entries(QUESTION_TYPES)) {
    const rand = seededRand(type.length);
    for (const target of COUNTRIES.slice(0, 8)) {
      const q = buildQuestion(target, COUNTRIES, { answerKey: spec.answerKey, rand });
      assert.equal(q.options.length, 4, type);
      assert.equal(new Set(q.options).size, 4, type);
      assert.equal(q.options.filter((o) => o === q.correct).length, 1, type);
      assert.equal(q.correct, answerValue(target, spec.answerKey), type);
      for (const o of q.options) assert.ok(pools[spec.answerKey].has(o), `${type}: ${o}`);
    }
  }
});
check('only Phase 1 types are live', () => {
  assert.deepEqual(Object.keys(liveQuestionTypes()).sort(), ['flag_country', 'flag_nationality']);
});
check('many-to-many lookups return all matching countries', () => {
  const spanish = findCountriesByAnswer(COUNTRIES, 'language', 'Spanish');
  assert.ok(spanish.length > 5, `spanish=${spanish.length}`);
  assert.ok(spanish.every((r) => r.languages.includes('Spanish')));
  const german = findCountriesByAnswer(COUNTRIES, 'language', 'German').map((r) => r.iso2).sort();
  assert.ok(german.includes('DE') && german.includes('AT') && german.includes('CH'), german.join(','));
  const dutch = findCountriesByAnswer(COUNTRIES, 'nationality', 'Dutch');
  assert.equal(dutch.length, 1);
  assert.equal(dutch[0].iso2, 'NL');
  assert.equal(findCountriesByAnswer(COUNTRIES, 'capital', 'Tashkent')[0].iso2, 'UZ');
  assert.ok(findCountriesByAnswer(COUNTRIES, 'region', 'Oceania').length >= 4);
});

console.log(`\n${passed} checks passed.`);
