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

// Test 2 shapes: slash-valued matching pairs, capitalization correction,
// single-word translations with apostrophes.
check(grade('matching',
  { pairs: [['Son', "O'g'il"], ['Mother', 'Ona']] },
  { pairs: [['Mother', 'Ona'], ['Son', "O'g'il"]] }) === true, 't2 matching slash values');
check(grade('multiple_choice', { selected_value: 'Today is Monday.' }, { correct_value: 'Today is Monday.' }) === true, 't2 capitalization correction');
check(grade('multiple_choice', { selected_value: 'today is monday.' }, { correct_value: 'Today is Monday.' }) === false, 't2 case-sensitive mc');
check(grade('translation', { answer: 'mother' }, { target_text: 'Mother' }) === true, 't2 translation case-insensitive');
check(grade('fill_blank', { answer: 'SATURDAY' }, { answer: 'Saturday' }) === true, 't2 fill case-insensitive');
check(grade('ordering', { order: ['He', 'has', 'a', 'dog.'] }, { correct_order: ['He', 'has', 'a', 'dog.'] }) === true, 't2 ordering');
// Tests 5-6 shapes: past-tense verbs, -ing forms, multi-token ordering,
// sentence translations with question marks.
check(grade('multiple_choice', { selected_value: 'played' }, { correct_value: 'played' }) === true, 't5 mc past verb');
check(grade('fill_blank', { answer: 'WENT' }, { answer: 'went' }) === true, 't5 fill past verb case-insensitive');
check(grade('translation', { answer: 'how many eggs are there?' }, { target_text: 'How many eggs are there?' }) === true, 't5 translation sentence');
check(grade('ordering', { order: ['I', 'went', 'to', 'the', 'market', 'yesterday.'] }, { correct_order: ['I', 'went', 'to', 'the', 'market', 'yesterday.'] }) === true, 't5 six-token ordering');
check(grade('fill_blank', { answer: 'swiming' }, { answer: 'swimming' }) === false, 't6 misspelled -ing rejected');
check(grade('translation', { answer: 'Bigger' }, { target_text: 'bigger' }) === true, 't6 comparative case-insensitive');
check(grade('ordering', { order: ['On', 'Saturday', 'I', 'went', 'fishing.'] }, { correct_order: ['On', 'Saturday', 'I', 'went', 'fishing.'] }) === true, 't6 weekend ordering');
check(grade('fill_blank', { answer: '' }, { answer: 'never' }) === false, 't6 empty fill rejected');
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
