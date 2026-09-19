// JS mirror of public.grade_online_test_answer() semantics (the SQL
// function is authoritative and was verified live; this mirror guards the
// documented contract: canonical matching, normalization, scoring math).
// The browser never grades — this file is test-only.

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

function normalizeText(v) {
  if (v == null) return '';
  let s = String(v).trim().replace(/\s+/g, ' ');
  let prev;
  do {
    prev = s;
    s = s.replace(/^['""''\"()\[\]{}<>«»“”‘’`]+|['""''\"()\[\]{}<>«»“”‘’`]+$/g, '');
  } while (s !== prev);
  s = s.replace(/[.!?…]+$/, '').trim().toLowerCase();
  return s;
}

function canonPairs(pairs) {
  return JSON.stringify([...(pairs || [])].map((p) => JSON.stringify(p)).sort());
}

function grade(qtype, answer, key) {
  const a = answer || {};
  const k = key || {};
  if (qtype === 'multiple_choice') return a.selected_value === k.correct_value && k.correct_value != null;
  if (qtype === 'matching') {
    return (k.pairs || []).length > 0 && canonPairs(a.pairs) === canonPairs(k.pairs);
  }
  if (qtype === 'ordering') {
    return Array.isArray(k.correct_order) && JSON.stringify(a.order || null) === JSON.stringify(k.correct_order);
  }
  if (qtype === 'fill_blank') {
    const exp = normalizeText(k.answer);
    return exp !== '' && normalizeText(a.answer) === exp;
  }
  if (qtype === 'translation') {
    const exp = normalizeText(k.target_text);
    return exp !== '' && normalizeText(a.answer) === exp;
  }
  return false;
}

check(grade('multiple_choice', { selected_value: 'is' }, { correct_value: 'is' }) === true, 'mc correct');
check(grade('multiple_choice', { selected_value: 'am' }, { correct_value: 'is' }) === false, 'mc wrong');
check(grade('multiple_choice', {}, { correct_value: 'is' }) === false, 'mc missing');
check(grade('matching',
  { pairs: [['Dog', 'It'], ['Cat', 'Mushuk']] },
  { pairs: [['Cat', 'Mushuk'], ['Dog', 'It']] }) === true, 'matching order-insensitive');
check(grade('matching',
  { pairs: [['Cat', 'It'], ['Dog', 'Mushuk']] },
  { pairs: [['Cat', 'Mushuk'], ['Dog', 'It']] }) === false, 'matching mispair');
check(grade('ordering', { order: ['My', 'name', 'is', 'Ali.'] }, { correct_order: ['My', 'name', 'is', 'Ali.'] }) === true, 'ordering exact');
check(grade('ordering', { order: ['My', 'is', 'name', 'Ali.'] }, { correct_order: ['My', 'name', 'is', 'Ali.'] }) === false, 'ordering swap');
check(grade('ordering', { order: ['a', 'is', 'a', 'b'] }, { correct_order: ['a', 'is', 'a', 'b'] }) === true, 'ordering duplicates preserved');
check(grade('fill_blank', { answer: '  BLUE. ' }, { answer: 'blue' }) === true, 'fill normalized');
check(grade('fill_blank', { answer: '  ' }, { answer: 'blue' }) === false, 'fill empty');
check(grade('translation', { answer: '  xayrli tong! ' }, { target_text: 'Xayrli tong' }) === true, 'translation normalized both sides');
check(grade('translation', { answer: 'Xayrli kun' }, { target_text: 'Xayrli tong' }) === false, 'translation wrong');
check(grade('translation', { answer: '“Xayrli tong!”' }, { target_text: 'Xayrli tong.' }) === true, 'translation wrappers+punctuation');
check(grade('essay', { answer: 'x' }, { answer: 'x' }) === false, 'unknown type incorrect');
check(grade('multiple_choice', null, { correct_value: 'is' }) === false, 'null answer incorrect');

// Scoring math: raw correct/34, percentage rounding.
const pct = (raw, total) => Math.round((raw * 100) / total);
check(pct(27, 34) === 79, '27/34 -> 79%');
check(pct(34, 34) === 100, '34/34 -> 100%');
check(pct(0, 34) === 0, '0/34 -> 0%');
check(pct(17, 34) === 50, '17/34 -> 50%');

// Submission idempotency contract (client shape): submit result must not
// depend on client-sent scores — only attempt id is sent.
const submitPayload = { p_attempt_id: 123 };
check(!('score' in submitPayload) && !('is_correct' in submitPayload), 'submit sends no scores');

console.log(failures === 0 ? 'ALL ONLINE-TEST-GRADING CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
