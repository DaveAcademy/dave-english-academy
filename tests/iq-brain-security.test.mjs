// IQ & Brain M1 - security: answer-key isolation, RLS, ownership, teacher
// visibility, grants, and the absence of any per-answer correctness oracle.
// Static checks over the M1 migrations.
// Run: node tests/iq-brain-security.test.mjs

import { readFileSync } from 'node:fs';
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

const f = read('supabase/migrations/20261119000000_iq_brain_foundation.sql');
const rpc = read('supabase/migrations/20261119000100_iq_brain_rpcs.sql');
const fcode = f.replace(/--.*$/gm, '');
const rpccode = rpc.replace(/--.*$/gm, '');

console.log('ASCII-START iq-brain-security');

// ---- C1: no student SELECT on the answer-key-bearing table ----
function policies(table, src) {
  return [...src.matchAll(new RegExp(`create policy (\\w+) on public\\.${table}([\\s\\S]*?);`, 'g'))]
    .map((m) => ({ name: m[1], clause: m[2].replace(/\s+/g, ' ').trim() }));
}
const qPolicies = policies('iq_questions', fcode);
check(qPolicies.length === 1, `iq_questions has exactly 1 policy (got ${qPolicies.length}: ${qPolicies.map((p) => p.name).join(',')})`);
check(qPolicies.some((p) => p.name === 'iq_questions_admin_all'), 'iq_questions admin-only policy present');
check(!qPolicies.some((p) => /for select/i.test(p.clause)),
  'iq_questions has NO SELECT policy for students');
check(!qPolicies.some((p) => /is_teacher\(\)/.test(p.clause)),
  'iq_questions has NO teacher SELECT policy (keys stay admin-only)');

// ---- Students hold zero write policies on score-bearing tables ----
for (const t of ['iq_attempts', 'iq_answers']) {
  const pols = policies(t, fcode);
  const writers = pols.filter((p) => /^\s*for (insert|update|delete|all)\b/i.test(p.clause));
  check(pols.length === 3, `${t} has exactly 3 policies (got ${pols.length}: ${pols.map((p) => p.name).join(',')})`);
  check(writers.length === 1 && /admin/i.test(writers[0]?.name || ''),
    `${t}: the only write policy is admin (got ${writers.map((w) => w.name).join(',') || 'none'})`);
  check(pols.some((p) => /is_teacher\(\)/.test(p.clause)), `${t}: teacher read policy present`);
  check(pols.some((p) => /profile_id = auth\.uid\(\)/.test(p.clause)), `${t}: self read scoped by auth.uid()`);
}
check(!/create policy \w+ on public\.iq_attempts[\s\S]{0,80}?for insert/i.test(fcode),
  'no student INSERT policy on iq_attempts');
check(!/create policy \w+ on public\.iq_answers[\s\S]{0,80}?for insert/i.test(fcode),
  'no student INSERT policy on iq_answers');
check(!/create policy \w+ on public\.iq_(attempts|answers)[\s\S]{0,80}?for update/i.test(fcode),
  'no client UPDATE policy on attempts/answers');

// ---- Keyless content delivery ----
function body(fn, src) {
  const start = src.indexOf(`create or replace function public.${fn}`);
  if (start < 0) return '';
  const rest = src.slice(start);
  // Functions are dollar-quoted with either $$ or the $f$ alias.
  const end = rest.search(/\n(\$f\$|\$\$);/);
  return end < 0 ? rest : rest.slice(0, end);
}
const payload = body('iq_attempt_payload', rpccode);
const getFn = body('get_iq_attempt', rpccode);
check(payload.length > 0 && getFn.length > 0, 'payload and get functions present');
check(!/answer_key/.test(payload), 'iq_attempt_payload never references answer_key');
check(!/answer_key/.test(getFn), 'get_iq_attempt never references answer_key');
check(!/answer_key/.test(body('start_iq_attempt', rpccode)), 'start_iq_attempt never references answer_key');
check(!/answer_key/.test(body('save_iq_answer', rpccode)), 'save_iq_answer never references answer_key');
check(/'items'/.test(payload) && /'prompt'/.test(payload) && /'stimulus'/.test(payload),
  'payload projects permitted question content');
check(/if v_attempt\.status = 'in_progress' then/.test(payload)
  && /'explanations', v_explanations/.test(payload),
  'explanations are part of the payload');
const inProgressBranch = payload.slice(payload.indexOf("if v_attempt.status = 'in_progress' then"),
  payload.indexOf('else', payload.indexOf("if v_attempt.status = 'in_progress' then")));
check(!/is_correct/.test(inProgressBranch),
  'in_progress branch exposes no is_correct / points_earned');
check(/'explanations', v_explanations/.test(payload)
  && /select coalesce\(jsonb_object_agg\(q\.id::text, q\.explanation\)/.test(payload),
  'explanations released only in the graded (non in_progress) branch');

// ---- No per-answer correctness oracle ----
const granted = [...rpccode.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to authenticated/gi)]
  .map((m) => m[1])
  .sort();
const expectedGranted = ['get_iq_attempt', 'list_my_iq_attempts', 'save_iq_answer',
  'start_iq_attempt', 'submit_iq_attempt'].sort();
check(JSON.stringify(granted) === JSON.stringify(expectedGranted),
  `exactly 5 public RPCs granted (got ${granted.join(',')})`);
check(!granted.includes('grade_iq_answer'), 'grade_iq_answer not granted to clients');
check(!granted.includes('finalize_iq_attempt'), 'finalizer not granted to clients');
check(!granted.includes('iq_attempt_payload'), 'payload builder not granted to clients');
check(!granted.includes('enforce_iq_attempt_limit'), 'retry-cap trigger not granted to clients');
check(!/function public\w*(\w*answer\w*)\(/i.test(rpccode.replace(body('grade_iq_answer', rpccode), '')) ||
  !/grant execute[\s\S]{0,60}answer/i.test(rpccode),
  'no granted function whose name promises an answer verdict');
check(/is_correct = null/.test(body('save_iq_answer', rpccode)),
  'save_iq_answer stores the raw answer with is_correct = null');
check(!/grade_iq_answer/.test(body('save_iq_answer', rpccode)),
  'save_iq_answer does not grade');
check(/grade_iq_answer/.test(body('finalize_iq_attempt', rpccode)),
  'grading happens only inside the finalizer');
check(/revoke all on function public\.grade_iq_answer\(text, jsonb, jsonb\) from anon, authenticated/.test(rpccode),
  'grader revoked from anon and authenticated');

// ---- Grants on the five public RPCs ----
for (const [fn, args] of [
  ['start_iq_attempt', 'bigint'],
  ['get_iq_attempt', 'bigint'],
  ['save_iq_answer', 'bigint, bigint, jsonb'],
  ['submit_iq_attempt', 'bigint'],
  ['list_my_iq_attempts', 'bigint'],
]) {
  check(new RegExp(`revoke execute on function public\\.${fn}\\(${args.replace(/, /g, ', ')}\\) from public`).test(rpccode),
    `${fn}: revoked from public`);
  check(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from anon`).test(rpccode),
    `${fn}: revoked from anon`);
  check(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`).test(rpccode),
    `${fn}: granted to authenticated`);
}
for (const fn of ['iq_difficulty_factor', 'iq_performance_level', 'grade_iq_answer',
  'finalize_iq_attempt', 'iq_attempt_payload']) {
  check(new RegExp(`revoke (execute|all) on function public\\.${fn}\\([^)]*\\) from (public|anon, authenticated)`).test(rpccode),
    `${fn}: no client execute`);
}

// ---- Ownership ----
for (const fn of ['start_iq_attempt', 'get_iq_attempt', 'save_iq_answer', 'submit_iq_attempt']) {
  const b = body(fn, rpccode);
  check(/security definer/.test(b) && /set search_path = 'public'/.test(b),
    `${fn}: SECURITY DEFINER + pinned search_path`);
  check(/auth\.uid\(\)/.test(b), `${fn}: student derived from auth.uid()`);
  check(!/p_student_id|p_score|p_points|p_difficulty|p_status|p_is_correct|p_deadline|p_question_ids/i.test(b),
    `${fn}: accepts no client-supplied identity/score/status`);
}
const save = body('save_iq_answer', rpccode);
check(/a\.student_id = v_student_id/.test(save), 'save: ownership filter on student_id');
check(/a\.status = 'in_progress'/.test(save), 'save: only on an active attempt');
check(/now\(\) >= v_deadline/.test(save) && /'attempt expired'/.test(save),
  'save: rejects writes after the server deadline');
check(/p_question_id::text/.test(save), 'save: rejects questions outside the frozen set');
check(/extract\(epoch from \(now\(\) - v_started\)\)/.test(save),
  'save: elapsed_ms measured from server timestamps only');

const get = body('get_iq_attempt', rpccode);
check(/v_owner is distinct from v_caller_student/.test(get), 'get: resolves owner vs caller');
check(/public\.is_teacher\(\) or public\.is_admin\(\)/.test(get),
  'get: staff access reuses the verified is_teacher()/is_admin() model');
check(/raise exception 'attempt not found'/.test(get),
  'get: non-owner non-staff gets attempt-not-found (no probing)');

const sub = body('submit_iq_attempt', rpccode);
check(/a\.student_id = v_student_id/.test(sub), 'submit: ownership filter on student_id');
check(/pg_advisory_xact_lock\(hashtext\('iq_submit:/.test(sub), 'submit: advisory lock around finalize');
check(/public\.iq_attempt_payload\(p_attempt_id\)/.test(sub), 'submit: returns the same keyless payload shape');

// ---- Teacher visibility reuses existing authorization, no second system ----
check(!/create or replace function public\.is_(admin|teacher|staff|teacher_of)/i.test(f + rpc),
  'no new authorization helper invented (is_teacher()/is_admin() reused)');
check(/for select to authenticated using \(public\.is_teacher\(\)\)/.test(fcode),
  'teacher read policy uses the academy is_teacher() helper');
check(/public\.is_admin\(\)/.test(fcode), 'admin policies use the academy is_admin() helper');
check(/join public\.students s on s\.id = a\.student_id\s*\n\s*where a\.id = attempt_id and s\.profile_id = auth\.uid\(\)/.test(fcode),
  'iq_answers self read goes through the owning attempt -> students.profile_id');

// ---- RLS enabled ----
for (const t of ['iq_questions', 'iq_challenges', 'iq_attempts', 'iq_answers', 'iq_daily_challenges']) {
  check(new RegExp(`alter table public\\.${t} enable row level security`).test(f),
    `RLS enabled on ${t}`);
}

console.log(failures === 0 ? 'ALL IQ-BRAIN-SECURITY CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
