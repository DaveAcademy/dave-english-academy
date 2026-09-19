// Online Test Uzbek-instruction contract:
// 1. en/uz onlineTest.json share identical key sets (no missing translations).
// 2. uz values carry no English instructional sentences.
// 3. Frozen item JSONs keep their English prompt.instruction source text
//    (content untouched), while UI sources never render prompt.instruction
//    (instructions come from locale keys instead).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const en = JSON.parse(readFileSync(`${root}/src/locales/en/onlineTest.json`, 'utf8'));
const uz = JSON.parse(readFileSync(`${root}/src/locales/uz/onlineTest.json`, 'utf8'));
const enKeys = Object.keys(en).sort();
const uzKeys = Object.keys(uz).sort();
check(JSON.stringify(enKeys) === JSON.stringify(uzKeys), `en/uz key parity (${enKeys.length} keys)`);
for (const k of ['instructionMultipleChoice', 'instructionMatching', 'instructionOrdering', 'instructionFill', 'instructionTranslateToUzbek', 'instructionTranslateToEnglish']) {
  check(typeof en[k] === 'string' && en[k].length > 0, `en has ${k}`);
  check(typeof uz[k] === 'string' && uz[k].length > 0, `uz has ${k}`);
}
const ENGLISH_SENTENCES = [
  'Choose the correct', 'Match each item', 'Put the words in the correct',
  'Fill in the blank', 'Translate into', 'Tap words below', 'Type your answer',
];
const uzText = JSON.stringify(uz);
for (const s of ENGLISH_SENTENCES) {
  check(!uzText.includes(s), `uz locale free of "${s}"`);
}

const runner = readFileSync(`${root}/src/features/onlineTests/pages/OnlineTestRunner.jsx`, 'utf8');
const inputs = readFileSync(`${root}/src/features/onlineTests/components/TestInputs.jsx`, 'utf8');
const codeOnly = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check(!/prompt\?\.instruction/.test(codeOnly(runner)), 'runner never renders prompt.instruction');
check(!/prompt\.instruction/.test(codeOnly(runner)), 'runner never renders prompt.instruction (direct)');
check(!/prompt\?\.instruction/.test(codeOnly(inputs)), 'inputs never render prompt.instruction');

for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const test = JSON.parse(readFileSync(`${root}/src/features/onlineTests/data/test${n}.json`, 'utf8'));
  // Frozen English source text intact per type: MC carries `question`,
  // all other types carry `instruction`. Counts: 18 MC + 16 instructed.
  const mc = test.items.filter((it) => it.qtype === 'multiple_choice');
  const rest = test.items.filter((it) => it.qtype !== 'multiple_choice');
  check(mc.length === 18 && mc.every((it) => typeof it.prompt?.question === 'string' && it.prompt.question.length > 0), `t${n} MC keeps English question (${mc.length})`);
  check(rest.length === 16 && rest.every((it) => typeof it.prompt?.instruction === 'string' && it.prompt.instruction.length > 0), `t${n} non-MC keeps English instruction source (${rest.length})`);
  check(test.items.length === 34, `t${n} still 34 items`);
}

console.log(failures === 0 ? 'ALL ONLINE-TEST-LOCALE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
