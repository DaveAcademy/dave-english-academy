// Focused tests for translation-answer normalization (four-stage Homework).
//
// Production truth simulated here (post-20261014 migration): the RPC compares
//   lower(normalize(student))  vs  lower(normalize(key)).
// The helper mirrors that two-sided comparison. Cases that only the RPC-side
// normalization can accept (stored trailing punctuation) are asserted as
// passes; anything the normalizer cannot equate stays rejected.
import { normalizeTranslationAnswer as norm } from '../src/lib/normalizeTranslation.js';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
// Migrated RPC grading shape: the SQL helper additionally strips trailing
// sentence-final punctuation on both sides (the JS submit normalizer
// intentionally does not, to protect exact matches pre-comparison).
const normBoth = (s) => norm(s).replace(/[.!?…]+$/, '').trim();
const grade = (student, rawKey) => normBoth(student).toLowerCase() === normBoth(rawKey).toLowerCase();
const KEY = "Mening xonamda to'shak bor.";

check(grade(KEY, KEY), 'exact correct answer accepted');
check(grade("  Mening   xonamda  to'shak bor.  ", KEY), 'extra/repeated whitespace accepted');
check(grade("(Mening xonamda to'shak bor.)", KEY), 'surrounding parens accepted');
check(!grade('Mening xonamdagi to‘shak katta.', KEY), 'materially different translation rejected');
check(!grade("Mening xonamda karavot bor.", KEY), 'synonym (karavot/to‘shak) NOT auto-accepted');
check(!grade('Xona katta.', KEY), 'unrelated sentence rejected');
check(norm('   ') === '', 'whitespace-only normalizes to empty');
check(norm(null) === '' && norm(undefined) === '' && norm(123) === '', 'non-strings normalize to empty');
check(norm("o'qituvchi") === "o'qituvchi", 'mid-word apostrophe preserved');
check(norm('(Xona katta)') === 'Xona katta', 'normalizer strips surrounding wrappers only');
check(
  grade("Mening xonamda to'shak bor", KEY) === true,
  'omitted final period accepted (RPC normalizes both sides)'
);
check(
  grade("Mening xonamda to'shak bor!", KEY) === true,
  'substituted final punctuation accepted (RPC normalizes both sides)'
);

console.log(failures === 0 ? 'ALL TRANSLATION-NORMALIZE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
