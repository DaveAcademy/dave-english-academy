// homework-pagination.test.mjs - lesson-hub list pagination (presentation only).
// No prod mutation: pure-helper unit tests + static checks over wiring.
// Run: node tests/homework-pagination.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  HOMEWORK_PAGE_SIZE,
  pageCount,
  paginate,
  pageRangeLabel,
} from '../src/features/homework/homeworkListPaging.js';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
function read(p) { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch { return ''; } }
console.log('ASCII-START homework-pagination');

console.log('=== A. Page math ===');
assert(HOMEWORK_PAGE_SIZE === 10, 'page size is 10');
assert(pageCount(100) === 10, '100 lessons -> 10 ranges');
assert(pageCount(98) === 10, '98 lessons -> 10 ranges (short final)');
assert(pageCount(0) === 1, 'empty list -> single range (no crash)');
assert(pageRangeLabel([{ curriculum_lessons: { lesson_number: 1 } }, { curriculum_lessons: { lesson_number: 10 } }], 0) === '1–10', 'number-span label 1–10');
assert(pageRangeLabel([{ curriculum_lessons: { lesson_number: 11 } }], 10).startsWith('11–'), 'label uses actual lesson numbers');
assert(pageRangeLabel([{ id: 1 }, { id: 2 }], 90) === '91–92', 'unnumbered falls back to positional labels');

console.log('=== B. Full sweep: no missing, no duplicates, order kept ===');
{
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, curriculum_lessons: { lesson_number: i + 1 } }));
  const items = mk(100);
  const seen = [];
  for (let p = 0; p < 10; p++) {
    const r = paginate(items, p);
    assert(r.items.length === 10, `range ${p} holds exactly 10`);
    assert(r.items[0].curriculum_lessons.lesson_number === p * 10 + 1, `range ${p} starts at lesson ${p * 10 + 1}`);
    seen.push(...r.items.map((x) => x.id));
  }
  assert(seen.length === 100 && new Set(seen).size === 100, 'all 100 reachable exactly once');
  assert(paginate(items, 99).page === 9, 'overflow page clamps to last range');
  assert(paginate(items, -1).page === 0, 'negative page clamps to first range');
}

console.log('=== C. Wiring (remote list, presentation only) ===');
const my = read('src/features/homework/pages/MyHomework.jsx');
assert(my.includes('visibleLessonItems'), 'list renders the paginated slice');
assert(my.includes('HOMEWORK_PAGE_SIZE'), 'page-size constant (no magic numbers)');
assert(my.includes('hw-lesson-range') && my.includes('homework:rangeLabel'), 'labeled range select (a11y)');
assert(my.includes('homework:rangePrev') && my.includes('homework:rangeNext'), 'prev/next range buttons');
assert(my.includes('disabled={lessonRange.page === 0}'), 'prev disabled on first range');
assert(my.includes('HomeworkStages'), 'seeded four-stage flow still mounted (grading architecture untouched)');
assert(my.includes('auto_grade_homework_answer') || read('src/lib/storageBridge.js').includes('autoGradeHomeworkAnswerById'), 'auto-grade path intact');
assert(!my.includes('HomeworkAutoQuiz') && !my.includes('submitHomeworkAutoStage'), 'no competing quiz engine in student UI');
const sb = read('src/lib/storageBridge.js');
assert(!sb.includes('getHomeworkAutoQuiz') && !sb.includes('homework_auto_stage_results'), 'no dormant-engine client calls');

console.log('=== D. Revoke migration (single grading path) ===');
const MIG = 'supabase/migrations/20261104000000_homework_revoke_dormant_quiz_rpcs.sql';
const mig = read(MIG);
assert(mig.length > 200, 'revoke migration exists');
assert(mig.includes('revoke execute on function public.get_homework_auto_quiz(bigint) from authenticated'), 'quiz RPC revoked from authenticated');
assert(mig.includes('revoke execute on function public.submit_homework_auto_stage(bigint, text, jsonb) from authenticated'), 'submit RPC revoked from authenticated');
assert(mig.includes('revoke execute on function public.get_homework_auto_quiz(bigint) from anon'), 'quiz RPC revoked from anon');
assert(!mig.includes('auto_grade_homework_answer') || !mig.includes('revoke execute on function public.auto_grade_homework_answer'), 'seeded grader untouched');
assert(!mig.includes('drop table') && !mig.includes('drop function'), 'revoke-only (no destructive DDL)');
assert(!mig.includes('point_transactions'), 'no points touched');

console.log('=== E. Locales ===');
for (const loc of ['src/locales/en/homework.json', 'src/locales/uz/homework.json']) {
  const t = read(loc);
  assert(t.includes('rangeLabel') && t.includes('rangePrev') && t.includes('rangeNext'), `${loc} has range keys`);
}

console.log(`RESULT failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
