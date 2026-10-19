// Placement Test schema contract (static checks over the migration SQL).
// Behavioral verification runs against a linked database; this file pins
// the structural contract: tables, constraints, indexes, RLS policies, and
// subsystem isolation.
// Run: node tests/placement-schema.test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const schema = readFileSync(
  `${root}/supabase/migrations/20261121000000_placement_test_schema.sql`, 'utf8'
).replace(/--.*$/gm, '');

// Tables
for (const t of ['placement_questions', 'placement_attempts', 'placement_answers', 'placement_reviews']) {
  check(schema.includes(`create table public.${t} (`), `table ${t} exists`);
}

// RLS enabled everywhere
for (const t of ['placement_questions', 'placement_attempts', 'placement_answers', 'placement_reviews']) {
  check(schema.includes(`alter table public.${t} enable row level security`), `RLS enabled on ${t}`);
}

// Questions: admin-only surface, no student/teacher policy at all
check(/create policy placement_questions_admin_all[\s\S]*?is_admin\(\)/.test(schema),
  'placement_questions is admin-only (is_admin policy)');
check(!/create policy placement_questions_(student|teacher)/.test(schema),
  'no student/teacher SELECT policy on placement_questions (answer keys protected)');

// Attempts: owner + scoped teacher + admin
check(/create policy placement_attempts_self_read[\s\S]*?s\.profile_id = auth\.uid\(\)/.test(schema),
  'students read only their own attempts (profile_id ownership)');
check(/create policy placement_attempts_teacher_read[\s\S]*?teacher_group_assignments tga[\s\S]*?tga\.level = s\.level/.test(schema),
  'teacher attempts read is scoped by teacher_group_assignments level');
check(/create policy placement_attempts_admin_all/.test(schema), 'admins read all attempts');

// Answers: same visibility contract
check(/create policy placement_answers_self_read/.test(schema), 'answers owner-read policy');
check(/create policy placement_answers_teacher_read[\s\S]*?teacher_group_assignments/.test(schema),
  'answers teacher-read is level-scoped');
check(/create policy placement_answers_admin_all/.test(schema), 'answers admin-read policy');

// Reviews: same visibility contract
check(/create policy placement_reviews_teacher_read[\s\S]*?teacher_group_assignments/.test(schema),
  'reviews teacher-read is level-scoped');
check(/create policy placement_reviews_admin_all/.test(schema), 'reviews admin-read policy');

// No write policies anywhere - all writes go through SECURITY DEFINER RPCs
check(!/create policy placement_\w+[\s\S]{0,400}?for (insert|update|delete)/.test(schema),
  'no INSERT/UPDATE/DELETE RLS policies (writes are RPC-only)');

// Constraints
check(schema.includes("skill in ('grammar','vocabulary','reading','listening','writing','speaking')"),
  'question skill check constraint covers all six skills');
check(schema.includes('cefr_level smallint not null check (cefr_level between 1 and 6)'),
  'CEFR level constrained to 1..6');
check(schema.includes("question_type in ('mcq','gap_fill','prompt')"), 'question_type constrained');
check(schema.includes("status in ('in_progress','submitted','reviewed','expired')"),
  'attempt status constrained to the lifecycle');
check(schema.includes("check (status in ('draft','published','retired'))"), 'question status lifecycle');
check(schema.includes('placement_questions_key_required'),
  'answer keys required for objective types, forbidden for prompts');

// One active attempt per student
check(schema.includes('create unique index placement_attempts_one_active'),
  'partial unique index enforces one active attempt per student');
check(schema.includes("where status = 'in_progress'"), 'active-attempt index is partial on in_progress');

// FKs and ownership
check(schema.includes('references public.students (id) on delete cascade'),
  'attempts cascade from students');
check(schema.includes('references public.placement_questions (id) on delete restrict'),
  'answers restrict question deletion (grading evidence preserved)');
check(schema.includes('reason text not null check (length(btrim(reason)) > 0)'),
  'review reason is mandatory');

// Deadline is server-controlled
check(schema.includes('deadline timestamptz not null'), 'attempt deadline is non-null (server-set)');

// Subsystem isolation: no FKs into other subsystems
for (const banned of ['exams', 'homework', 'games', 'payments', 'attendance']) {
  check(!new RegExp(`references public\\.${banned}`).test(schema),
    `no FK into ${banned} (isolated subsystem)`);
}

// Question bank seed: coverage of all six levels per objective skill,
// prompts have no keys, and every embedded JSON literal parses.
const seed = readFileSync(
  `${root}/supabase/migrations/20261121000200_placement_test_seed.sql`, 'utf8'
);
const skillLevel = {};
for (const m of seed.matchAll(/\('(grammar|vocabulary|reading|listening|writing|speaking)', (\d), '(mcq|gap_fill|prompt)'/g)) {
  const key = `${m[1]}:${m[2]}`;
  skillLevel[key] = (skillLevel[key] || 0) + 1;
}
for (const skill of ['grammar', 'vocabulary', 'reading', 'listening']) {
  for (let lvl = 1; lvl <= 6; lvl++) {
    check((skillLevel[`${skill}:${lvl}`] || 0) >= 2,
      `${skill} level ${lvl} has >= 2 published items (${skillLevel[`${skill}:${lvl}`] || 0})`);
  }
}
for (const skill of ['writing', 'speaking']) {
  for (let lvl = 1; lvl <= 6; lvl++) {
    check((skillLevel[`${skill}:${lvl}`] || 0) >= 1, `${skill} level ${lvl} has a prompt`);
  }
}
// Every prompt JSON literal must be valid JSON
const jsonLiterals = [...seed.matchAll(/\$j\$([\s\S]*?)\$j\$/g)].map((m) => m[1]);
check(jsonLiterals.length >= 100, `seed embeds ${jsonLiterals.length} JSON literals`);
let badJson = 0;
for (const j of jsonLiterals) {
  try { JSON.parse(j); } catch { badJson++; }
}
check(badJson === 0, `all seed JSON literals parse (${badJson} invalid)`);
// mcq items must have options; listening items must have audio_text; no key leaks in prompts
for (const j of jsonLiterals) {
  const o = JSON.parse(j);
  if (o.options) check(Array.isArray(o.options) && o.options.length >= 3, 'mcq options array well-formed');
  if (o.audio_text) check(typeof o.audio_text === 'string' && o.audio_text.length > 10, 'listening audio text present');
  check(!('answer_key' in o) && !('is_correct' in o), 'prompt JSON carries no answer material');
}

// Deterministic selection helper exists
check(/placement_questions_skill_level_idx[\s\S]*?on public\.placement_questions \(skill, cefr_level, id\)/.test(schema),
  'index supports deterministic per-level selection');

console.log(failures === 0 ? 'ASCII-START placement-schema ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
