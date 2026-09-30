// modes.js
// The only thing that differs between Geography modes: which field of
// a country record becomes the answer. Everything else (pool,
// distractors, scoring, UI) is shared via engine.js. Only 'country' and
// 'nationality' have play-screen UI (Phase 1); the rest of
// QUESTION_TYPES is data-architecture for Phase 2/3, engine-tested but
// intentionally without gameplay or routes yet.
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

// Future question types: { answerKey, promptKey, live }. Only entries
// with live:true are exposed in the UI; the rest validate that the
// dataset + engine can generate them without mixing answer categories.
export const QUESTION_TYPES = {
  flag_country: { answerKey: 'country', promptKey: 'flagCountryPrompt', live: true },
  flag_nationality: { answerKey: 'nationality', promptKey: 'flagNationalityPrompt', live: true },
  flag_language: { answerKey: 'language', promptKey: 'flagLanguagePrompt', live: false },
  country_capital: { answerKey: 'capital', promptKey: 'countryCapitalPrompt', live: false },
  country_continent: { answerKey: 'region', promptKey: 'countryContinentPrompt', live: false },
  language_country: { answerKey: 'country', promptKey: 'languageCountryPrompt', live: false },
  nationality_country: { answerKey: 'country', promptKey: 'nationalityCountryPrompt', live: false },
};

export function liveQuestionTypes() {
  return Object.fromEntries(Object.entries(QUESTION_TYPES).filter(([, v]) => v.live));
}

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
