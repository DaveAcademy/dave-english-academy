// Section-example contract: one static example per stage, identical across
// tests (present + future), distinct from every real item, never scored,
// English sample material with localized labels only.
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
const SUFFIX = ['Vocabulary', 'Grammar', 'Sentences', 'Writing'];
for (const s of SUFFIX) {
  check(typeof en[`sample${s}Q`] === 'string' && en[`sample${s}Q`].length > 0, `en sample ${s} Q`);
  check(typeof en[`sample${s}A`] === 'string' && en[`sample${s}A`].length > 0, `en sample ${s} A`);
  // Sample material itself stays English in both locales (only labels localize).
  check(uz[`sample${s}Q`] === en[`sample${s}Q`], `uz sample ${s} Q identical (English material)`);
  check(uz[`sample${s}A`] === en[`sample${s}A`], `uz sample ${s} A identical (English material)`);
}

// Sample (Q,A) pairs must never coincide with a real (prompt,key) pair.
// (Single common words like "is" inevitably occur inside keys; what
// matters is that no real item pairs this Q with this A.)
const corpus = [1, 2, 3, 4, 5, 6, 7, 8]
  .map((n) => readFileSync(`${root}/src/features/onlineTests/data/test${n}.json`, 'utf8'))
  .join('\n');
const testJsons = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
  JSON.parse(readFileSync(`${root}/src/features/onlineTests/data/test${n}.json`, 'utf8')));
for (const s of SUFFIX) {
  const q = en[`sample${s}Q`];
  const a = en[`sample${s}A`];
  check(!corpus.includes(q), `sample ${s} Q distinct from all real items`);
  let clash = false;
  for (const t of testJsons) {
    for (const it of t.items) {
      if (JSON.stringify(it.prompt).includes(q) && JSON.stringify(it.key).includes(a)) clash = true;
    }
  }
  check(!clash, `sample ${s} Q+A pair reveals no real item`);
}

// ExampleBox carries no scoring/grading logic and renders before questions.
const boxSrc = readFileSync(`${root}/src/features/onlineTests/components/ExampleBox.jsx`, 'utf8');
const boxCode = boxSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check(!/points|score|is_correct|grade/i.test(boxCode), 'ExampleBox has no scoring logic');
const runner = readFileSync(`${root}/src/features/onlineTests/pages/OnlineTestRunner.jsx`, 'utf8');
check(runner.includes('ExampleBox'), 'runner renders ExampleBox');

console.log(failures === 0 ? 'ALL ONLINE-TEST-EXAMPLE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
