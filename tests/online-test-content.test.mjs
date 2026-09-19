// Online Test 1 content contract: 34 frozen items, valid shapes, no key
// leakage into prompt_data, no duplicates. Source: data/test1.json, the
// same file the content migration is generated from.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const test = JSON.parse(readFileSync(root + '/src/features/onlineTests/data/test1.json', 'utf8'));

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

check(test.test_number === 1 && test.lesson_from === 1 && test.lesson_to === 10, 'test 1 covers lessons 1-10');
check(test.items.length === 34, `34 items (got ${test.items.length})`);
const byStage = {};
for (const it of test.items) byStage[it.stage] = (byStage[it.stage] || 0) + 1;
check(byStage.vocabulary === 10, 'vocabulary x10');
check(byStage.grammar === 10, 'grammar x10');
check(byStage.sentences === 8, 'sentences x8');
check(byStage.writing === 6, 'writing x6');

const STAGES = ['vocabulary', 'grammar', 'sentences', 'writing'];
const QTYPES = ['multiple_choice', 'matching', 'ordering', 'fill_blank', 'translation'];
const seenPos = new Set();
const seenPrompt = new Set();
for (const it of test.items) {
  const id = `${it.stage}#${it.position}`;
  check(STAGES.includes(it.stage) && QTYPES.includes(it.qtype), `${id} valid stage/qtype`);
  check(!seenPos.has(id), `${id} unique position`);
  seenPos.add(id);
  const ptext = JSON.stringify(it.prompt);
  check(!seenPrompt.has(ptext), `${id} prompt not duplicated`);
  seenPrompt.add(ptext);
  check(/^L(10|[1-9])\b/.test(it.source_ref || ''), `${id} source_ref in L1-L10`);
  const k = it.key || {};
  if (it.qtype === 'multiple_choice') {
    check(typeof k.correct_value === 'string' && (it.prompt.options || []).includes(k.correct_value), `${id} mc key is one of options`);
    check((it.prompt.options || []).length >= 2, `${id} mc has options`);
  }
  if (it.qtype === 'matching') {
    check(k.pairs.length === it.prompt.left.length && k.pairs.length === it.prompt.right.length, `${id} matching pairs cover both sides`);
  }
  if (it.qtype === 'ordering') {
    check(JSON.stringify([...it.prompt.tokens].sort()) === JSON.stringify([...k.correct_order].sort()), `${id} ordering tokens match key multiset`);
  }
  if (it.qtype === 'fill_blank') {
    check(typeof k.answer === 'string' && k.answer.trim().length > 0, `${id} fill has single answer`);
  }
  if (it.qtype === 'translation') {
    check(typeof k.target_text === 'string' && k.target_text.trim().length > 0, `${id} translation has target`);
  }
  // Prompt must carry render data only — never key field names. (Ordering
  // tokens are inherently reorderable; the server shuffles them per attempt.)
  for (const kf of ['correct_value', 'target_text', 'correct_order', 'pairs']) {
    check(!(kf in it.prompt), `${id} prompt has no .${kf}`);
  }
  if (it.qtype === 'fill_blank' || it.qtype === 'translation') {
    check(!('answer' in it.prompt), `${id} prompt has no .answer`);
  }
}

console.log(failures === 0 ? 'ALL ONLINE-TEST-CONTENT CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
