// Homework evidence trust (Phase 8): grade forgery blocked at RLS,
// vacuous-truth closed in auto-grading, subjective types stay manual.
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

const MIG = 'supabase/migrations/20261018000020_homework_evidence_trust.sql';
check(existsSync(`${root}/${MIG}`), 'trust migration exists');
const mig = read(MIG);
check(mig.includes('homework_answers_student_update'), 'student update policy replaced');
for (const c of ['is_correct is null', 'auto_graded = false', 'points_earned = 0', 'graded_at is null', 'graded_by is null']) {
  check(mig.includes(c), `with-check requires ${c}`);
}
check(mig.includes('normalize_translation_answer') && mig.includes(`<> ''`), 'translation non-empty key guard');
check(mig.includes(`nullif(v_question.question_data->>'answer', '') is not null`), 'fill_blank non-empty key guard');
check(mig.includes('sentence_creation') && mig.includes('v_is_correct := null'), 'subjective types stay manual');
for (const bad of ['drop table', '\ndelete from', 'truncate', 'alter table public.homework_answers drop']) {
  check(!mig.toLowerCase().includes(bad), `no ${bad.trim()}`);
}
check(mig.includes('grant execute on function public.auto_grade_homework_answer(bigint) to authenticated'), 'grading grants');

// Client path resets grades on submit (only server/teacher may set them).
const bridge = read('src/lib/storageBridge.js');
const submit = bridge.slice(bridge.indexOf('export async function submitHomeworkAnswer'), bridge.indexOf('export async function listHomeworkAnswers'));
for (const c of ['is_correct: null', 'auto_graded: false', 'points_earned: 0', 'graded_at: null', 'graded_by: null']) {
  check(submit.includes(c), `submit resets ${c}`);
}
check(bridge.includes('callerIsStaff') && bridge.includes(`throw new Error('Manual grading requires a teacher or admin session.')`), 'manual grade staff-gated');

// Evidence RPC consumes only graded mapped answers (unchanged contract).
const ev = read('supabase/migrations/20261018000016_vocab_evidence_rpc.sql');
check(ev.includes('ha.is_correct is not null'), 'evidence needs graded answers');
check(ev.includes('hq.vocabulary_id is not null'), 'evidence needs mapped questions');

console.log(failures === 0 ? 'ALL HOMEWORK-EVIDENCE CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
