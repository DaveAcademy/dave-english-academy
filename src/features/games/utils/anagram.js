// anagram.js
// Pure client-side helpers for Anagram Builder (find hidden words from a
// shuffled letter pool). All functions are pure and UI-free so they are
// unit-testable in node (tests/anagram-builder.test.mjs).
//
// These helpers are UX-only conveniences: instant feedback while typing.
// The authoritative grade is computed server-side by submit_game_round()
// ('anagram_builder' branch), which re-checks every rule below against
// the round's stored letters and student_available_vocabulary(). Nothing
// returned here is trusted for scoring.
// Difficulty bands MUST stay in sync with
// public.game_level_to_anagram_range() in
// supabase/migrations/20261005000000_anagram_builder_game.sql.

export const MIN_WORD_LENGTH = 3;

// Spec progression: Easy 3-4 letters / 2 words, Normal 4-5 / 3-4,
// Medium 5-6 / 5-6, Hard 6-8 / 7-8, Very Hard 8-10 / up to 10.
export function anagramDifficultyForLevel(level) {
  const lvl = Math.max(1, Math.min(100, Number(level) || 1));
  if (lvl <= 4) return { band: 'easy', minLetters: 3, maxLetters: 4, target: 2 };
  if (lvl <= 9) return { band: 'normal', minLetters: 4, maxLetters: 5, target: 3 };
  if (lvl <= 14) return { band: 'normal', minLetters: 4, maxLetters: 5, target: 4 };
  if (lvl <= 24) return { band: 'medium', minLetters: 5, maxLetters: 6, target: 5 };
  if (lvl <= 34) return { band: 'medium', minLetters: 5, maxLetters: 6, target: 6 };
  if (lvl <= 49) return { band: 'hard', minLetters: 6, maxLetters: 7, target: 7 };
  if (lvl <= 69) return { band: 'hard', minLetters: 7, maxLetters: 8, target: 8 };
  if (lvl <= 89) return { band: 'very_hard', minLetters: 8, maxLetters: 9, target: 9 };
  return { band: 'very_hard', minLetters: 8, maxLetters: 10, target: 10 };
}

// Consistent normalization shared by every check: trim + lowercase.
export function normalizeWord(value) {
  return String(value ?? '').trim().toLowerCase();
}

function countLetters(word) {
  const counts = new Map();
  for (const ch of word) counts.set(ch, (counts.get(ch) || 0) + 1);
  return counts;
}

// Multiset check: each letter may be used at most as many times as it
// appears in the pool. Handles repeated letters (e.g. pool "AAT" allows
// "at"/"tat" but rejects a word needing two T's... i.e. "tattoo").
export function canConstruct(word, letters) {
  const need = countLetters(normalizeWord(word));
  const have = countLetters(normalizeWord(letters));
  if (need.size === 0) return false;
  for (const [ch, n] of need) {
    if ((have.get(ch) || 0) < n) return false;
  }
  return true;
}

// Validate one submission. Reasons (for i18n feedback):
// empty | too_short | invalid_chars | duplicate | not_constructible | unknown_word
export function validateSubmission(rawWord, { letters, accepted = [], vocabularySet = null }) {
  const word = normalizeWord(rawWord);
  if (!word) return { ok: false, word, reason: 'empty' };
  if (word.length < MIN_WORD_LENGTH) return { ok: false, word, reason: 'too_short' };
  if (!/^[a-z]+$/.test(word)) return { ok: false, word, reason: 'invalid_chars' };
  if (accepted.map(normalizeWord).includes(word)) return { ok: false, word, reason: 'duplicate' };
  if (!canConstruct(word, letters)) return { ok: false, word, reason: 'not_constructible' };
  // vocabularySet is the student's own available-vocabulary pool (the same
  // approved source the server validates against) - when provided, unknown
  // words are rejected locally for instant feedback.
  if (vocabularySet && !vocabularySet.has(word)) return { ok: false, word, reason: 'unknown_word' };
  return { ok: true, word, reason: null };
}

// All pool words (normalized strings) constructible from the letters,
// min length enforced. Used by tests to prove the solvable-round
// guarantee (candidates >= target); the game page deliberately never
// calls this to list answers - it only validates submissions.
export function findCandidates(letters, words) {
  const pool = normalizeWord(letters);
  const out = [];
  for (const w of words || []) {
    const word = normalizeWord(w);
    if (word.length >= MIN_WORD_LENGTH && canConstruct(word, pool)) out.push(word);
  }
  return [...new Set(out)];
}

// Fisher-Yates shuffle of display tiles. Tiles carry stable ids so
// duplicate letters render as individual tiles. Never returns tiles in
// the exact original order (single swap fallback, same as WordBuilder).
export function shuffleTiles(letters, rng = Math.random) {
  const tiles = normalizeWord(letters).split('').map((ch, i) => ({ id: `${i}-${ch}`, ch }));
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  if (tiles.length > 1 && tiles.map((t) => t.ch).join('') === normalizeWord(letters)) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }
  return tiles;
}
