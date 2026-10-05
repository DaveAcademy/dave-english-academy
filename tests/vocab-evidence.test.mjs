// Vocabulary evidence Phase 2: aggregation RPC is a self-only read model.
// No knowledge labels, no XP, no writes.
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

const MIG = 'supabase/migrations/20261018000016_vocab_evidence_rpc.sql';
check(existsSync(`${root}/${MIG}`), 'evidence migration exists');
const mig = read(MIG);
const code = mig.replace(/--[^\n]*/g, ' ').replace(/'([^']|'')*'/g, "''"); // code only: no comments, no string literals
check(mig.includes('get_my_vocabulary_evidence()'), 'RPC name');
check(mig.includes('profile_id = auth.uid()'), 'self-only via auth.uid');
check(!mig.match(/p_student_id/), 'no cross-student parameter');
for (const src of ['student_dictionary_words', 'game_word_history', 'homework_answers', 'online_test_answers', 'latest_tests']) {
  check(mig.includes(src), `reads ${src}`);
}
check(!code.includes('exam_scores'), 'exams produce no word evidence');
for (const bad of ['words_known', 'words-known', 'demonstrated', 'ranking', 'point_transactions', 'student_xp']) {
  check(!code.toLowerCase().includes(bad), `no ${bad}`);
}
for (const bad of ['\ninsert into', '\nupdate ', '\ndelete from', 'drop table', 'alter table']) {
  check(!code.toLowerCase().includes(bad), `read-only (no ${bad.trim()})`);
}
check(mig.includes('ha.is_correct is not null'), 'pending homework excluded');
check(mig.includes("status = 'submitted'"), 'only submitted attempts');
check(mig.includes('hint'), 'hint limitation documented');
check(mig.includes('grant execute on function public.get_my_vocabulary_evidence() to authenticated'), 'grants');

console.log(failures === 0 ? 'ALL VOCAB-EVIDENCE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
