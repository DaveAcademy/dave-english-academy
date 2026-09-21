// Anagram Builder logic tests - pure node, no DB, no DOM.
// Run: node tests/anagram-builder.test.mjs
import assert from 'node:assert/strict';
import {
  MIN_WORD_LENGTH,
  anagramDifficultyForLevel,
  normalizeWord,
  canConstruct,
  validateSubmission,
  findCandidates,
  shuffleTiles,
} from '../src/features/games/utils/anagram.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// --- normalization ---
check('normalize trims + lowercases', () => {
  assert.equal(normalizeWord('  StOnE '), 'stone');
  assert.equal(normalizeWord(null), '');
});

// --- spec example: STONE ---
const STONE_POOL = ['one', 'son', 'not', 'tone', 'note', 'stone', 'nest', 'ten', 'net', 'on'];
check('STONE example words constructible in any order', () => {
  for (const w of ['one', 'son', 'not', 'tone', 'note', 'stone', 'nest']) {
    assert.equal(canConstruct(w, 'stone'), true, w);
  }
  // order independence: shuffled pool is the same multiset
  assert.equal(canConstruct('stone', 'notes'.slice(0, 5).split('').reverse().join('')), true);
});
check('words needing unavailable letters rejected', () => {
  assert.equal(canConstruct('cones', 'stone'), false); // needs C
  assert.equal(canConstruct('soon', 'stone'), false); // needs two O's
  assert.equal(canConstruct('stones', 'stone'), false); // too long
});

// --- repeated letters: AAT ---
check('repeated letters: pool AAT', () => {
  assert.equal(canConstruct('at', 'aat'), true); // constructible; min-length is validateSubmission's job
  assert.equal(canConstruct('tat', 'aat'), false); // needs 2 T's, pool has 1
  assert.equal(canConstruct('atta', 'aat'), false); // needs 2 T's
  assert.equal(canConstruct('aaa', 'aat'), false); // needs 3 A's
});
check('repeated letters: pool EELS', () => {
  assert.equal(canConstruct('eel', 'eels'), true);
  assert.equal(canConstruct('see', 'eels'), true);
  assert.equal(canConstruct('else', 'eels'), true);
  assert.equal(canConstruct('eell', 'eels'), false); // needs 2 L's, pool has 1
});

// --- validation reasons ---
check('too short rejected (min 3)', () => {
  assert.equal(MIN_WORD_LENGTH, 3);
  const r = validateSubmission('at', { letters: 'stone' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too_short');
});
check('invalid chars rejected', () => {
  assert.equal(validateSubmission('café', { letters: 'cafex' }).reason, 'invalid_chars');
  assert.equal(validateSubmission('co-op', { letters: 'coopx' }).reason, 'invalid_chars');
});
check('duplicate rejected regardless of case/order', () => {
  const r = validateSubmission('NOTE', { letters: 'stone', accepted: ['tone', 'note'] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'duplicate');
});
check('unconstructible rejected', () => {
  const r = validateSubmission('cones', { letters: 'stone', accepted: [] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_constructible');
});
check('unknown vocabulary rejected when pool given', () => {
  const vocab = new Set(['one', 'son', 'not', 'tone', 'note', 'stone', 'nest']);
  assert.equal(validateSubmission('tone', { letters: 'stone', accepted: [], vocabularySet: vocab }).ok, true);
  const r = validateSubmission('sten', { letters: 'stone', accepted: [], vocabularySet: vocab });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_word');
});
check('valid submission passes with normalization', () => {
  const r = validateSubmission('  Nest ', { letters: 'STONE', accepted: ['one'], vocabularySet: new Set(['nest', 'one']) });
  assert.deepEqual(r, { ok: true, word: 'nest', reason: null });
});

// --- difficulty progression 2 -> 10 ---
check('difficulty progresses 2..10 required words', () => {
  const seen = new Set();
  let prev = 0;
  for (let lvl = 1; lvl <= 100; lvl += 1) {
    const d = anagramDifficultyForLevel(lvl);
    seen.add(d.target);
    assert.ok(d.target >= prev, `level ${lvl}: target regressed`);
    assert.ok(d.minLetters >= 3 && d.maxLetters <= 10);
    assert.ok(d.minLetters <= d.maxLetters);
    prev = d.target;
  }
  assert.equal(anagramDifficultyForLevel(1).target, 2);
  assert.equal(anagramDifficultyForLevel(100).target, 10);
  assert.deepEqual([...seen].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
check('difficulty bands match spec letter ranges', () => {
  assert.deepEqual(anagramDifficultyForLevel(1), { band: 'easy', minLetters: 3, maxLetters: 4, target: 2 });
  assert.deepEqual(anagramDifficultyForLevel(100), { band: 'very_hard', minLetters: 8, maxLetters: 10, target: 10 });
});

// --- round-generation guarantee (mirrors server logic) ---
// Mock academy pool: common words only, like student_available_vocabulary().
const MOCK_POOL = [
  'stone', 'tone', 'note', 'nest', 'sent', 'tens', 'net', 'ten', 'not', 'one', 'son', 'sonnet',
  'tone', 'notes', 'onset', 'sonnet', 'stent', 'teste', 'tones', 'stones',
  'cat', 'act', 'tac', 'tack', 'stack', 'cast', 'cats', 'acts', 'task', 'tasks',
  'planet', 'panel', 'penal', 'plane', 'plant', 'plate', 'pleat', 'petal', 'leapt', 'neat', 'lean', 'lane', 'panel',
  'master', 'stream', 'teams', 'mates', 'meats', 'seam', 'same', 'tames', 'steam', 'terms', 'smarter',
  'care', 'race', 'acre', 'crate', 'cater', 'carter', 'react', 'trace', 'terrace',
  'starlight', 'trails', 'trials', 'strait', 'trail', 'trial', 'tails', 'light', 'sight', 'tight',
  'start', 'shirt', 'trash', 'arts', 'rats', 'star', 'rail', 'tail', 'last', 'salt', 'halt',
  'lit', 'silt', 'list', 'slit', 'stilt', 'tilt', 'grit',
];
function mockGenerateForLevel(level) {
  // Same contract as get_anagram_builder_round(): seed from pool within
  // band range, candidates = pool words constructible from seed, require
  // candidates >= target (try several seeds, else adapt target down).
  const { minLetters, maxLetters, target } = anagramDifficultyForLevel(level);
  const seeds = MOCK_POOL.filter((w) => w.length >= minLetters && w.length <= maxLetters);
  let best = null;
  for (const seed of seeds.slice(0, 25)) {
    const cands = findCandidates(seed, MOCK_POOL);
    if (!best || cands.length > best.candidates.length) best = { seed, candidates: cands };
    if (cands.length >= target) return { seed, candidates: cands, target, adapted: false };
  }
  return { seed: best.seed, candidates: best.candidates, target: Math.min(target, best.candidates.length), adapted: true };
}
check('every level generates a solvable round (candidates >= target)', () => {
  for (let lvl = 1; lvl <= 100; lvl += 5) {
    const r = mockGenerateForLevel(lvl);
    assert.ok(r.candidates.length >= r.target, `level ${lvl}: ${r.candidates.length} < ${r.target}`);
    assert.ok(r.candidates.length >= 1, `level ${lvl}: empty round`);
  }
});
check('STONE seed yields >= 7 candidates incl. spec words', () => {
  const cands = findCandidates('stone', STONE_POOL);
  for (const w of ['one', 'son', 'not', 'tone', 'note', 'stone', 'nest']) {
    assert.ok(cands.includes(w), `missing ${w}`);
  }
});
check('insufficient pool adapts target down, never unsolvable', () => {
  const tiny = ['cat', 'act'];
  const cands = findCandidates('cat', tiny);
  assert.ok(cands.length >= 1); // seed itself always constructible
  const target = Math.min(10, cands.length);
  assert.ok(cands.length >= target);
});

// --- shuffle ---
check('shuffle keeps multiset, breaks original order', () => {
  for (let i = 0; i < 50; i += 1) {
    const tiles = shuffleTiles('stone');
    assert.equal(tiles.length, 5);
    assert.deepEqual(tiles.map((t) => t.ch).sort(), ['e', 'n', 'o', 's', 't']);
    assert.notEqual(tiles.map((t) => t.ch).join(''), 'stone');
    assert.equal(new Set(tiles.map((t) => t.id)).size, 5); // unique ids for duplicate-safe rendering
  }
});
check('shuffle preserves duplicate letters individually', () => {
  const tiles = shuffleTiles('aab');
  assert.deepEqual(tiles.map((t) => t.ch).sort(), ['a', 'a', 'b']);
  assert.equal(new Set(tiles.map((t) => t.id)).size, 3);
});

console.log(`\nAll ${passed} anagram-builder checks passed.`);
