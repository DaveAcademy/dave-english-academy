// Dictionary Phase 13: deterministic state actions over server states.
// No scores, no thresholds, no new RPCs.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const tabs = read('src/features/dictionary/components/DictionaryTabs.jsx');
check(tabs.includes(`const ACTION_PRIORITY = ['LAPSED', 'LEARNING', 'NEW', 'DEMONSTRATED', 'KNOWN']`), 'priority LAPSED>LEARNING>NEW>DEMONSTRATED>KNOWN');
check(tabs.includes(`NEW: 'learn'`) && tabs.includes(`LAPSED: 'review'`), 'states map to existing flows');
for (const k of ['actLearn', 'actPractice', 'actReview', 'actReviewAgain']) {
  check(tabs.includes(k), `action key ${k} used`);
}
for (const s of ['recoTitle', 'recoHeadline', 'recoAllGood', 'recoAllGoodHint']) {
  check(tabs.includes(s), `recommendation uses ${s}`);
}
check(tabs.includes('`reco_${priority.toLowerCase()}`'), 'per-state messages by state key');
check(tabs.includes('export function WordsTab({ me, t, onAction })'), 'words tab receives action callback');
check(!tabs.match(/Math\.max\(.*systems|score\s*=|weight/i), 'no numerical recommendation score');

const page = read('src/features/dictionary/pages/Dictionary.jsx');
check(page.includes('onAction={setTab}'), 'actions route to existing tabs');

const en = JSON.parse(read('src/locales/en/dictionary.json'));
const uz = JSON.parse(read('src/locales/uz/dictionary.json'));
const KEYS = ['recoTitle', 'recoHeadline', 'reco_lapsed', 'reco_learning', 'reco_new', 'reco_demonstrated', 'reco_known', 'recoAllGood', 'recoAllGoodHint', 'actLearn', 'actPractice', 'actReview', 'actReviewAgain'];
for (const k of KEYS) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en.${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz.${k}`);
}

console.log(failures === 0 ? 'ALL VOCAB-ACTION CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
