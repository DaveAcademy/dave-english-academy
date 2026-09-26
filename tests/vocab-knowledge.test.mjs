// Vocabulary mastery facets: KNOWN = meaning (EN<->UZ) AND usage (correct
// EN production). Retention no longer gates KNOWN. SRS untouched.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const MIG = 'supabase/migrations/20261018000022_vocab_mastery_facets.sql';
check(existsSync(`${root}/${MIG}`), 'mastery migration exists');
const mig = read(MIG);
const code = mig.replace(/--[^\n]*/g, ' ').replace(/'([^']|'')*'/g, "''");
check(mig.includes('vocabulary_knowledge_for('), 'helper replaced with facets');
for (const st of [`'NEW'`, `'LEARNING'`, `'DEMONSTRATED'`, `'KNOWN'`, `'LAPSED'`]) {
  check(mig.includes(st), `state ${st}`);
}
// Teacher definition: meaning (EN<->UZ) AND usage (correct EN production).
check(code.includes('hw_usage') && code.includes('test_usage'), 'usage facet exists');
check(code.includes('hw_meaning') && code.includes('test_meaning'), 'meaning facet exists');
check(!code.match(/interval_days[^;]*>= 30/), 'no retention gate on KNOWN');
check(!code.match(/then\s+""\s*$/m) && !code.includes('MASTERED'), 'no MASTERED shortcut (SRS untouched, not consulted)');
// Example 1+2: single facet is never KNOWN (KNOWN requires the AND).
check(mig.includes(`then 'KNOWN'`), 'KNOWN branch exists');
// Example 4: LAPSED override preserved.
check(mig.includes(`= 'LAPSED'`), 'LAPSED override preserved');
// DEMONSTRATED/LEARNING/NEW preserved; multi-system rule intact.
check(mig.includes('>= 2') && mig.includes(`then 'DEMONSTRATED'`), 'two-system DEMONSTRATED preserved');
check(mig.includes(`then 'NEW'`) && mig.includes(`else 'LEARNING'`), 'NEW/LEARNING preserved');
// Priority: LAPSED first, KNOWN before DEMONSTRATED, NEW before LEARNING.
const iLapsed = mig.indexOf(`= 'LAPSED'`);
const iKnown = mig.indexOf(`then 'KNOWN'`);
const iDemo = mig.indexOf(`then 'DEMONSTRATED'`);
const iNew = mig.indexOf(`then 'NEW'`);
const iLearning = mig.indexOf(`else 'LEARNING'`);
check(iLapsed > 0 && iLapsed < iKnown, 'lapse overrides before KNOWN');
check(iKnown < iDemo, 'KNOWN before DEMONSTRATED');
check(iDemo < iNew && iNew < iLearning, 'NEW before LEARNING default');
// Security posture unchanged: helper locked, auth/grants live in wrapper.
check(code.includes('revoke execute on function public.vocabulary_knowledge_for(bigint)'), 'helper lock preserved');
check(!code.match(/grant execute/i), 'no new grants');
const wrap = read('supabase/migrations/20261018000018_vocab_knowledge_count_rank.sql');
check(wrap.includes('profile_id = auth.uid()'), 'self-only via auth.uid (wrapper)');
check(wrap.includes('grant execute on function public.get_my_vocabulary_knowledge() to authenticated'), 'wrapper grants intact');
// Read-only, exams out, hint caveat documented upstream.
for (const bad of ['\ninsert into', '\nupdate ', '\ndelete from', 'drop table', 'alter table', 'create table', 'point_transactions', 'student_xp', 'exam_scores']) {
  check(!code.toLowerCase().includes(bad), `clean (no ${bad.trim()})`);
}

console.log(failures === 0 ? 'ALL VOCAB-MASTERY CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
