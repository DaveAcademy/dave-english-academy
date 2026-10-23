// Design-uplift locale contract: every UI string added by the 10/10 design
// pass must exist, be non-empty, and keep identical interpolation
// placeholders in both English and Uzbek. Run with:
// node tests/design-uplift-locale.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const NEW_KEYS = {
  onlineTest: ['matchingTapHint', 'bestResult', 'attemptsCount', 'previousBest', 'newBestBadge', 'reviewSuggestion'],
  exams: ['awaitingTeacher', 'inClassNote', 'feedbackShowMore', 'feedbackShowLess', 'bestScoreLabel'],
  homework: ['lessonModelNote', 'teacherModelNote', 'reviewFinalNote', 'completedDetail', 'completedNext', 'stagesProgressLabel'],
};
for (const [ns, keys] of Object.entries(NEW_KEYS)) {
  const en = JSON.parse(readFileSync(`${root}/src/locales/en/${ns}.json`, 'utf8'));
  const uz = JSON.parse(readFileSync(`${root}/src/locales/uz/${ns}.json`, 'utf8'));
  for (const k of keys) {
    const okEn = typeof en[k] === 'string' && en[k].trim().length > 0;
    const okUz = typeof uz[k] === 'string' && uz[k].trim().length > 0;
    check(okEn, `${ns}:en has ${k}`);
    check(okUz, `${ns}:uz has ${k}`);
    if (okEn && okUz) {
      check(en[k] !== uz[k], `${ns}:${k} differs across locales`);
      check(placeholders(en[k]) === placeholders(uz[k]), `${ns}:${k} placeholders match (${placeholders(en[k]) || 'none'})`);
    }
  }
}
console.log(failures === 0 ? 'ALL DESIGN-UPLIFT-LOCALE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
