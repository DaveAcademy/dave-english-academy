// IQ & Brain M1 - schema, foreign keys, indexes, retry cap, isolation.
// Static checks over the three M1 migrations (no live DB in this harness;
// behavioral verification runs against a linked DB, as with the online-test
// suite).
// Run: node tests/iq-brain-schema.test.mjs

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
function read(p) {
  try { return readFileSync(resolve(root, p), 'utf8'); } catch { return ''; }
}

const M1 = 'supabase/migrations/20261119000000_iq_brain_foundation.sql';
const M2 = 'supabase/migrations/20261119000100_iq_brain_rpcs.sql';
const M3 = 'supabase/migrations/20261119000200_iq_brain_seed_content.sql';

console.log('ASCII-START iq-brain-schema');

// ---- Migration presence + ordering ----
check(existsSync(resolve(root, M1)), 'M1 foundation migration exists');
check(existsSync(resolve(root, M2)), 'M2 RPC migration exists');
check(existsSync(resolve(root, M3)), 'M3 seed migration exists');
const base = (p) => p.slice(p.lastIndexOf('/') + 1);
check(base(M1) < base(M2) && base(M2) < base(M3), 'M1 < M2 < M3 timestamp order');
check(base(M1).slice(0, 14) > '20261118000000',
  'sorts after latest pre-existing migration 20261118000000');

const f = read(M1);
const fcode = f.replace(/--.*$/gm, '');
const rpc = read(M2);
const rpccode = rpc.replace(/--.*$/gm, '');
const seed = read(M3);
const all = f + rpc + seed;
const allCode = fcode + rpccode + seed.replace(/--.*$/gm, '');

// ---- Exactly five tables ----
const tableRe = /create table (?:if not exists )?public\.(iq_[a-z_]+)/gi;
const tables = [...all.matchAll(tableRe)].map((m) => m[1]);
const expected = ['iq_questions', 'iq_challenges', 'iq_attempts', 'iq_answers', 'iq_daily_challenges'];
check(tables.length === 5, `exactly 5 create table statements (got ${tables.length}: ${tables.join(',')})`);
for (const t of expected) check(tables.includes(t), `table ${t} created`);
check(tables.every((t) => expected.includes(t)),
  `no sixth IQ table (unexpected: ${tables.filter((t) => !expected.includes(t)).join(',') || 'none'})`);
check(!/create table[^;]*\biq_student_progress\b/i.test(all), 'iq_student_progress deferred (C3) - not created');

// ---- Foreign keys ----
check(/challenge_id\s+bigint not null references public\.iq_challenges \(id\)/.test(f),
  'iq_attempts.challenge_id -> iq_challenges');
check(/student_id\s+bigint not null references public\.students \(id\)/.test(f),
  'iq_attempts.student_id -> students');
check(/attempt_id\s+bigint not null references public\.iq_attempts \(id\) on delete cascade/.test(f),
  'iq_answers.attempt_id -> iq_attempts (cascade)');
check(/question_id\s+bigint not null references public\.iq_questions \(id\) on delete restrict/.test(f),
  'iq_answers.question_id -> iq_questions (restrict, history kept)');

// ---- Indexes / constraints ----
for (const idx of [
  'iq_attempts_one_active',
  'iq_attempts_daily_one',
  'iq_attempts_student_recent',
  'iq_attempts_challenge_student',
  'iq_challenges_slug',
  'iq_questions_pick',
]) check(new RegExp(`create (?:unique )?index ${idx}\\b`).test(f), `index ${idx} exists`);

check(/primary key \(attempt_id, question_id\)/.test(f), 'iq_answers composite primary key');
check(/create unique index iq_attempts_one_active[\s\S]{0,120}?where status = 'in_progress'/.test(f),
  'one active attempt per student per challenge');
check(/create unique index iq_attempts_daily_one[\s\S]{0,120}?where scheduled_date is not null/.test(f),
  'one attempt per student per date (daily)');

// ---- Retry cap: max 3 attempts, enforced in the database ----
check(/create or replace function public\.enforce_iq_attempt_limit\(\)/.test(f),
  'retry-cap trigger function exists');
check(/v_cap constant int := 3/.test(f), 'retry cap is 3');
check(/pg_advisory_xact_lock\(/.test(f), 'retry cap takes an advisory lock (race-safe)');
check(/before insert on public\.iq_attempts[\s\S]{0,160}?execute function public\.enforce_iq_attempt_limit\(\)/.test(f),
  'retry cap enforced by BEFORE INSERT trigger, not by app logic');
check(/raise exception 'attempt limit reached'/.test(rpccode),
  'start_iq_attempt also rejects at the cap');
check(/select count\(\*\) into v_used/.test(fcode), 'cap count computed server-side in trigger');
check(/select count\(\*\) into v_used/.test(rpccode), 'cap count computed server-side in start');

// ---- Column contract ----
for (const col of [
  'deadline\\s+timestamptz not null',
  'question_ids\\s+jsonb not null',
  'score\\s+int',
  'max_score\\s+int',
  'percentage\\s+numeric\\(5, 2\\)',
  'category_scores\\s+jsonb not null',
  'performance_level\\s+text',
  'duration_ms\\s+int',
]) check(new RegExp(col).test(f), `iq_attempts column: ${col.replace(/\\s+/, ' ')}`);

check(/status\s+text not null default 'in_progress'\s+check \(status in \('in_progress', 'submitted', 'expired'\)\)/.test(f),
  'lifecycle CHECK covers in_progress/submitted/expired');
check(/jsonb_typeof\(question_ids\) = 'array'/.test(f), 'question_ids must be a json array');
check(/jsonb_typeof\(answer_key\) = 'object'/.test(f), 'answer_key must be a json object');
check(/difficulty\s+smallint not null check \(difficulty between 1 and 5\)/.test(f),
  'numeric difficulty 1-5');
check(/category\s+text not null check \(category in\s+\('logic', 'number_patterns', 'visual_patterns', 'spatial', 'memory'\)\)/.test(f),
  'C2: content categories only (no daily/iq_challenge category)');
check(/kind\s+text not null check \(kind in \('iq_challenge', 'practice', 'daily'\)\)/.test(f),
  'C2: challenge kind is separate from category');
check(/challenge_date\s+date primary key/.test(f), 'iq_daily_challenges keyed by date');
check(/Asia\/Tashkent/.test(f), 'daily date uses the academy Asia/Tashkent convention');

// ---- RLS enabled on all five ----
for (const t of expected) {
  check(new RegExp(`alter table public\\.${t} enable row level security`).test(f),
    `RLS enabled on ${t}`);
}

// ---- Isolation: no writes to, and no coupling with, protected systems ----
const protectedTables = [
  'homework', 'homework_status', 'payments', 'payment_schedule', 'exams', 'exam_scores',
  'groups', 'group_students', 'attendance', 'lessons', 'student_lesson_progress',
  'point_transactions', 'game_sessions', 'game_rounds', 'game_points_transactions',
  'student_xp_transactions', 'student_learning_events', 'student_achievements',
  'achievement_definitions', 'online_tests', 'online_test_items',
  'online_test_attempts', 'online_test_answers', 'certificates', 'chat_messages',
  'ranking', 'leaderboard', 'class_score',
];
for (const t of protectedTables) {
  const re = new RegExp(`\\b${t}\\b`, 'i');
  check(!re.test(allCode), `no reference to protected table/system: ${t}`);
}
check(!/\binsert into public\.students\b|\bupdate public\.students\b|\bdelete from public\.students\b/i.test(allCode),
  'students table never written');
check(!/\bpoints\s*=/.test(fcode), 'students.points never written');
check(!/\bstudent_xp_transactions\b|\baward_xp_for_event\b|\bevaluate_achievements\b/.test(allCode),
  'no XP / achievement coupling');
check(!/\bgame_type_difficulty\b|\bsubmit_game_round\b|\bgame_level_progress\b/.test(allCode),
  'no Game Tier / game round coupling');

// ---- Seed content: small and separated ----
const seedQuestions = (seed.match(/^\('(logic|number_patterns|visual_patterns|spatial|memory)'/gm) || []).length;
check(seedQuestions === 10, `seed contains 10 questions (got ${seedQuestions})`);
check(seedQuestions <= 20, 'seed stays small (<= 20 questions)');
check(/iq-m1-seed/.test(seed), 'seed rows are tagged for identification');
check((seed.match(/\('[a-z-]+', '(iq_challenge|practice|daily)'/g) || []).length === 3,
  'seed defines exactly 3 challenges');
check(/'iq-challenge', 'iq_challenge'/.test(seed), 'M1 verification challenge present');

console.log(failures === 0 ? 'ALL IQ-BRAIN-SCHEMA CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
