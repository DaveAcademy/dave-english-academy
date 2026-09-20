// Vocabulary knowledge Phase 3: derived NEW/LEARNING/DEMONSTRATED/KNOWN/
// LAPSED read model over Phase 2 evidence + live SRS rows.
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

const MIG = 'supabase/migrations/20261018000017_vocab_knowledge_states.sql';
check(existsSync(`${root}/${MIG}`), 'knowledge migration exists');
const mig = read(MIG);
const code = mig.replace(/--[^\n]*/g, ' ').replace(/'([^']|'')*'/g, "''");
check(mig.includes('get_my_vocabulary_knowledge()'), 'RPC name');
check(mig.includes('profile_id = auth.uid()'), 'self-only via auth.uid');
check(!mig.match(/p_student_id/), 'no cross-student parameter');
for (const st of [`'NEW'`, `'LEARNING'`, `'DEMONSTRATED'`, `'KNOWN'`, `'LAPSED'`]) {
  check(mig.includes(st), `state ${st}`);
}
check(mig.includes('get_my_vocabulary_evidence()'), 'builds on Phase 2 evidence');
check(mig.includes('interval_days') && mig.includes('>= 30'), 'retention via SRS interval');
check(mig.includes(`= 'MASTERED'`), 'MASTERED feeds KNOWN');
check(mig.includes('>= 2'), 'two-system independence rule');
check(mig.includes('grant execute on function public.get_my_vocabulary_knowledge() to authenticated'), 'grants');
for (const bad of ['words_known', 'point_transactions', 'student_xp', 'game_points', 'rank(']) {
  check(!code.toLowerCase().includes(bad), `no ${bad}`);
}
for (const bad of ['\ninsert into', '\nupdate ', '\ndelete from', 'drop table', 'alter table', 'create table']) {
  check(!code.toLowerCase().includes(bad), `read-only (no ${bad.trim()})`);
}
check(!code.includes('exam_scores'), 'exams excluded');
check(code.includes('hint-blind') || mig.includes('hint-blind'), 'hint limitation documented');

// Transition priority: LAPSED-override first, then MASTERED, then
// retention-KNOWN, then DEMONSTRATED, with NEW before the LEARNING default.
const iLapsed = mig.indexOf(`= 'LAPSED'`);
const iMasteredKnown = mig.indexOf(`= 'MASTERED' then 'KNOWN'`);
const iKnown = mig.indexOf(`then 'KNOWN'`, iMasteredKnown + 1);
const iDemo = mig.indexOf(`then 'DEMONSTRATED'`);
const iNew = mig.indexOf(`then 'NEW'`);
const iLearning = mig.indexOf(`else 'LEARNING'`);
check(iLapsed > 0 && iLapsed < iMasteredKnown, 'lapse overrides before KNOWN');
check(iMasteredKnown < iKnown && iKnown < iDemo, 'KNOWN before DEMONSTRATED');
check(iDemo < iNew && iNew < iLearning, 'NEW before LEARNING default');

console.log(failures === 0 ? 'ALL VOCAB-KNOWLEDGE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
