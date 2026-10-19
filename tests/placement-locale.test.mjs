// Placement Test localization contract:
// 1. en/uz placement.json share identical key sets.
// 2. uz values carry no English instructional sentences.
// 3. nav keys for both surfaces exist in en and uz.
// 4. The placement namespace is registered in i18n for both languages.
// 5. Every placement.<key> referenced in the feature source resolves.
// Run: node tests/placement-locale.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const flat = (o, pre = '') =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? flat(v, pre + k + '.') : [pre + k]));

const en = JSON.parse(readFileSync(`${root}/src/locales/en/placement.json`, 'utf8'));
const uz = JSON.parse(readFileSync(`${root}/src/locales/uz/placement.json`, 'utf8'));
const enKeys = flat(en).sort();
const uzKeys = flat(uz).sort();
check(enKeys.length > 80, `en has a full key set (${enKeys.length} keys)`);
check(JSON.stringify(enKeys) === JSON.stringify(uzKeys),
  `en/uz key parity (${enKeys.length} keys)`);

const ENGLISH_SENTENCES = [
  'Find your current', 'Start the test', 'Write your answer here',
  'Type your answer', 'Choose the correct', 'You cannot see correct answers',
  'Could not load', 'Confirm placement', 'Back to list', 'Search students',
];
const uzText = JSON.stringify(uz);
for (const s of ENGLISH_SENTENCES) {
  check(!uzText.includes(s), `uz locale free of "${s}"`);
}
// Literal CEFR tokens are fine (they are exam terminology), but the uz
// instructions must be Uzbek.
check(uzText.includes('Darajani aniqlash testi'), 'uz title is Uzbek');

// Nav keys in both languages
for (const lang of ['en', 'uz']) {
  const nav = JSON.parse(readFileSync(`${root}/src/locales/${lang}/nav.json`, 'utf8'));
  for (const k of ['placementFull', 'placementShort', 'placementReview', 'placementReviewShort']) {
    check(typeof nav[k] === 'string' && nav[k].length > 0, `${lang} nav has ${k}`);
  }
}

// Namespace registered in i18n
const i18n = readFileSync(`${root}/src/i18n/index.js`, 'utf8');
check(i18n.includes("import enPlacement from '../locales/en/placement.json'"), 'en placement import registered');
check(i18n.includes("import uzPlacement from '../locales/uz/placement.json'"), 'uz placement import registered');
check(i18n.includes('placement: enPlacement'), 'en placement resource registered');
check(i18n.includes('placement: uzPlacement'), 'uz placement resource registered');

// Every placement key referenced in feature source resolves.
const pagesDir = `${root}/src/features/placementTest`;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.jsx') || f.name.endsWith('.js')) files.push(p);
  }
})(pagesDir);
const referenced = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/t\(\s*[`'"]placement:([\w.]+)[`'"]/g)) referenced.add(m[1]);
  for (const m of src.matchAll(/t\(\s*[`'"]placement:\$\{[^}]+\}[`'"]/g)) referenced.add('<dynamic>');
  for (const m of src.matchAll(/`placement:\$\{([^}]+)\}`/g)) referenced.add('dynamic:' + m[1]);
}
const dynamic = [...referenced].filter((k) => k.startsWith('dynamic:'));
const staticKeys = [...referenced].filter((k) => !k.startsWith('dynamic:'));
check(!referenced.has('<dynamic>') || dynamic.length > 0, 'dynamic key patterns enumerated');
for (const k of staticKeys) {
  check(enKeys.includes(k), `referenced key placement:${k} exists in en`);
}
// Dynamic keys must resolve through a closed set.
const dynamicAllowed = {
  'skillNames.${question.skill}': ['skillNames.grammar', 'skillNames.vocabulary', 'skillNames.reading', 'skillNames.listening'],
  'skillNames.${skill}': ['skillNames.grammar', 'skillNames.vocabulary', 'skillNames.reading', 'skillNames.listening', 'skillNames.writing', 'skillNames.speaking'],
  'rubric.${dim}': ['rubric.task_completion', 'rubric.grammar_control', 'rubric.vocabulary_range', 'rubric.coherence', 'rubric.intelligibility', 'rubric.fluency_coherence'],
};
for (const d of dynamic) {
  const allowed = dynamicAllowed[d];
  check(!!allowed, `dynamic pattern "${d}" has a closed allowed set`);
  if (allowed) for (const a of allowed) check(enKeys.includes(a), `dynamic expansion ${a} exists in en`);
}

console.log(failures === 0 ? 'ASCII-START placement-locale ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
