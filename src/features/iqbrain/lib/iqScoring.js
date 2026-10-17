// iqScoring.js - display-only helpers. The database owns every score,
// correctness flag and performance level; nothing here decides a result and
// nothing here is ever sent back to the server.
//
// No IQ conversion: the app reports Challenge Score / Category Performance /
// Performance Level, never a clinically validated IQ number, and never ties
// IQ results to the academy's English Level or to game tiers.

// Five-tier labels, matching the academy's existing difficulty vocabulary.
export const DIFFICULTY_LABELS = {
  1: 'veryEasy',
  2: 'easy',
  3: 'medium',
  4: 'hard',
  5: 'veryHard',
};

export function difficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] || 'medium';
}

// Stable translation keys + accent tones for the performance bands the
// server computes (iq_performance_level).
export const PERFORMANCE_LEVELS = [
  { label: 'Developing', slug: 'developing', tone: 'neutral' },
  { label: 'Starter Solver', slug: 'starterSolver', tone: 'info' },
  { label: 'Problem Solver', slug: 'problemSolver', tone: 'brand' },
  { label: 'Strong Reasoner', slug: 'strongReasoner', tone: 'success' },
  { label: 'Top Reasoner', slug: 'topReasoner', tone: 'success' },
];

export function performanceTone(level) {
  const hit = PERFORMANCE_LEVELS.find((l) => l.label === level);
  return hit ? hit.tone : 'neutral';
}

export function performanceKey(level) {
  const hit = PERFORMANCE_LEVELS.find((l) => l.label === level);
  return hit ? hit.slug : 'developing';
}

// Safe display formatting for server-provided numbers.
export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function formatScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : '0';
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const ATTEMPTS_ALLOWED = 3;
