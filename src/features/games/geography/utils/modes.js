// modes.js
// The only thing that differs between the two Geography modes: which
// field of a country record becomes the answer. Everything else
// (pool, distractors, scoring, UI) is shared via engine.js.
import { buildQuestion as engineBuildQuestion } from './engine.js';

export const MODES = {
  country: 'country',
  nationality: 'nationality',
};

export const MODE_ANSWER_KEY = {
  [MODES.country]: 'country',
  [MODES.nationality]: 'nationality',
};

export const MODE_PROMPT_KEY = {
  [MODES.country]: 'flagCountryPrompt',
  [MODES.nationality]: 'flagNationalityPrompt',
};

export function isValidMode(mode) {
  return mode === MODES.country || mode === MODES.nationality;
}

export function normalizeMode(mode, fallback = MODES.country) {
  return isValidMode(mode) ? mode : fallback;
}

// Map one country record to { prompt helpers, options, correct }.
// Prompt text itself is resolved via i18n `promptKey` in the UI.
export function buildModeQuestion(target, pool, mode, rand = Math.random) {
  const safeMode = normalizeMode(mode);
  const answerKey = MODE_ANSWER_KEY[safeMode];
  const q = engineBuildQuestion(target, pool, { answerKey, rand });
  return { ...q, mode: safeMode, promptKey: MODE_PROMPT_KEY[safeMode] };
}
