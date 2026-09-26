// gameMotion.js — Stage 11 motion design system (shared across 10 games)
// Durations: micro 150-250ms, standard 250-400ms, reward 400-700ms
// Prefer transform/opacity, respect prefers-reduced-motion.
// Hangman final loss: part 260ms + pause 420ms + drop 380ms + swing 650ms (already in Hangman.jsx)
// Other games use shared fadeIn/scaleIn/bounceIn + per-game correct/incorrect states.

export const MOTION = {
  micro: '150ms',
  standard: '300ms',
  reward: '500ms',
};
