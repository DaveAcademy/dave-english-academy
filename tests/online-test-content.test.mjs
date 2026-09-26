// Online Test content contract (tests 1-2): 34 frozen items each, valid
// shapes, no key leakage into prompt_data, no duplicates within or across
// tests. Source: data/test{N}.json, the same files content migrations are
// generated from.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => JSON.parse(readFileSync(`${root}/src/features/onlineTests/data/test${n}.json`, 'utf8')));

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const EXPECTED_RANGE = { 1: [1, 10], 2: [11, 20], 3: [21, 30], 4: [31, 40], 5: [41, 50], 6: [51, 60], 7: [61, 70], 8: [71, 80], 9: [81, 90], 10: [91, 100] };
const allPrompts = new Set();
for (const test of TESTS) {
const T = `t${test.test_number}`;
check(test.lesson_from === EXPECTED_RANGE[test.test_number][0] && test.lesson_to === EXPECTED_RANGE[test.test_number][1], `${T} covers lessons ${test.lesson_from}-${test.lesson_to}`);
check(test.items.length === 34, `${T} 34 items (got ${test.items.length})`);
const byStage = {};
for (const it of test.items) byStage[it.stage] = (byStage[it.stage] || 0) + 1;
check(byStage.vocabulary === 10, `${T} vocabulary x10`);
check(byStage.grammar === 10, `${T} grammar x10`);
check(byStage.sentences === 8, `${T} sentences x8`);
check(byStage.writing === 6, `${T} writing x6`);

const STAGES = ['vocabulary', 'grammar', 'sentences', 'writing'];
const QTYPES = ['multiple_choice', 'matching', 'ordering', 'fill_blank', 'translation'];
const seenPos = new Set();
const seenPrompt = new Set();
const seenLessons = new Set();
for (const it of test.items) {
  const id = `${T} ${it.stage}#${it.position}`;
  check(STAGES.includes(it.stage) && QTYPES.includes(it.qtype), `${id} valid stage/qtype`);
  check(!seenPos.has(id), `${id} unique position`);
  seenPos.add(id);
  const ptext = JSON.stringify(it.prompt);
  check(!seenPrompt.has(ptext), `${id} prompt not duplicated`);
  seenPrompt.add(ptext);
  check(!allPrompts.has(ptext), `${id} prompt not reused across tests`);
  allPrompts.add(ptext);
  const lesson = Number((it.source_ref || '').match(/^L(\d+)/)?.[1]);
  check(lesson >= test.lesson_from && lesson <= test.lesson_to, `${id} source in range`);
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
  if (!seenLessons.has(lesson)) seenLessons.add(lesson);
}
{
const missing = [];
// Full-range coverage enforced for all Tests 1-10 (rebalance 2026-10:
// every lesson 1-100 represented, 3-4 items per lesson).
for (let n = test.lesson_from; n <= test.lesson_to; n++) if (!seenLessons.has(n)) missing.push(n);
check(missing.length === 0, `${T} every lesson ${test.lesson_from}-${test.lesson_to} represented${missing.length ? ' (missing ' + missing.join(',') + ')' : ''}`);
const perLesson = {};
for (const it of test.items) {
  const ln = Number((it.source_ref || '').match(/^L(\d+)/)?.[1]);
  perLesson[ln] = (perLesson[ln] || 0) + 1;
}
const unbalanced = Object.entries(perLesson).filter(([, c]) => c < 3 || c > 4);
check(unbalanced.length === 0, `${T} 3-4 items per lesson${unbalanced.length ? ' (off: ' + unbalanced.map(([l, c]) => `L${l}=${c}`).join(',') + ')' : ''}`);
}
}

// Bank-level contract: exactly 10 tests, 340 items, 34 per test,
// 10/10/8/6 per test, 1 point each.
check(TESTS.length === 10, `10 tests (got ${TESTS.length})`);
{
const all = TESTS.flatMap((t) => t.items);
check(all.length === 340, `340 total items (got ${all.length})`);
const perTest = {};
for (const t of TESTS) perTest[t.test_number] = t.items.length;
check(Object.keys(perTest).length === 10 && Object.values(perTest).every((n) => n === 34), '34 items per test');
const stageTotals = {};
for (const it of all) stageTotals[it.stage] = (stageTotals[it.stage] || 0) + 1;
check(stageTotals.vocabulary === 100 && stageTotals.grammar === 100 && stageTotals.sentences === 80 && stageTotals.writing === 60, `bank stage totals 100/100/80/60 (got ${JSON.stringify(stageTotals)})`);
const lessons = new Set();
for (const t of TESTS) for (let n = t.lesson_from; n <= t.lesson_to; n++) lessons.add(n);
check(lessons.size === 100, `all lessons 1-100 covered (got ${lessons.size})`);
}

console.log(failures === 0 ? 'ALL ONLINE-TEST-CONTENT CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
