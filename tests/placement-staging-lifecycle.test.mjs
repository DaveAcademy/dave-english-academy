// Placement Test STAGING lifecycle verification.
// Runs the complete student-to-teacher workflow against the ISOLATED staging
// Supabase project (dave-english-academy-homework-test) using synthetic
// accounts only. Sessions are emulated the way Supabase test helpers do:
//   begin; set local role authenticated; set local request.jwt.claims = '...'; <call>; commit;
// which exercises the REAL RLS policies and SECURITY DEFINER RPC grants.
// Skipped unless explicitly enabled:
//   PLACEMENT_STAGING=1 node tests/placement-staging-lifecycle.test.mjs
// Requires only a Supabase access token in ~/.supabase/access-token for the
// Management API. Never points at production (hard ref guard below).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (!process.env.PLACEMENT_STAGING) {
  console.log('SKIP placement-staging-lifecycle (PLACEMENT_STAGING not set)');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const ACCESS_TOKEN = existsSync(`${homedir()}/.supabase/access-token`)
  ? readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim()
  : null;
const STAGING_REF = 'houmgtsywbxtgsccrkpi'; // dave-english-academy-homework-test
if (!ACCESS_TOKEN) {
  console.error('SKIP placement-staging-lifecycle (no Supabase access token)');
  process.exit(0);
}

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`mgmt ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// --- session emulation -----------------------------------------------------
// Each call runs in its own transaction: claims are set with SET LOCAL (no
// leakage into the pooled session), the RPC is executed inside a DO block
// whose EXCEPTION handler captures errors as data (so a raised exception
// neither aborts the transaction nor leaks an open transaction back to the
// pool), and the result/error comes back as the last statement's rows.
function sessionSql(sub, stmt) {
  const claims = sub
    ? JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated' }).replace(/'/g, "''")
    : '';
  return [
    'begin;',
    sub ? 'set local role authenticated;' : 'set local role anon;',
    `set local request.jwt.claims = '${claims}';`,
    'drop table if exists _rpc_result;',
    'create temp table _rpc_result(result jsonb, err text) on commit drop;',
    `do $outer$ begin begin insert into _rpc_result(result) select ${stmt}; exception when datatype_mismatch then begin perform ${stmt}; exception when others then insert into _rpc_result(err) values (sqlerrm); end; when others then insert into _rpc_result(err) values (sqlerrm); end; end $outer$;`,
    'select * from _rpc_result;',
    'commit;',
  ].join('\n');
}

async function asUser(sub, stmt) {
  const rows = await mgmtQuery(sessionSql(sub, stmt));
  const row = rows[0] || {};
  if (row.err) return { ok: false, error: row.err };
  return { ok: true, json: row.result ?? null };
}

function sqlArg(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return `'${v}'`; // unknown literal -> coerces to bigint/smallint/etc
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

// RPC returning jsonb -> parsed object.
async function rpc(sub, fn, body = {}) {
  const args = Object.entries(body).map(([k, v]) => `${k} => ${sqlArg(v)}`).join(', ');
  return asUser(sub, `public.${fn}(${args})`);
}
const ERR = (r) => (r.ok ? 'NO-ERROR' : (r.error || '').slice(0, 140));
// Table select under RLS -> array of rows (as jsonb).
async function selectRows(sub, table, where = 'true') {
  const r = await asUser(
    sub,
    `coalesce((select jsonb_agg(to_jsonb(x)) from public.${table} x where ${where}), '[]'::jsonb)`
  );
  return r.ok ? r.json : [];
}

// --- synthetic accounts (fixed ids, idempotent teardown before setup) ------
const PW = 'Placement-Test-2026!';
const S1 = '5b3a1c00-0000-4000-8000-0000000000a1';
const S2 = '5b3a1c00-0000-4000-8000-0000000000a2';
const T1 = '5b3a1c00-0000-4000-8000-0000000000b1';
const EMAILS = `'placement-test-s1@example.com','placement-test-s2@example.com','placement-test-t1@example.com','placement-test-signup@example.com'`;
const hashRows = await mgmtQuery(`select extensions.crypt('${PW}', extensions.gen_salt('bf')) as h`);
const PASSWORD_HASH = hashRows[0].h;

await mgmtQuery(`
  delete from public.placement_attempts where student_id in (
    select id from public.students where profile_id in ('${S1}','${S2}'));
  delete from public.students where profile_id in ('${S1}','${S2}');
  delete from public.teacher_group_assignments where teacher_id = '${T1}';
  delete from public.profiles where id in ('${S1}','${S2}','${T1}');
  delete from auth.users where id in ('${S1}','${S2}','${T1}')
    or email in (${EMAILS});
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_user_meta_data, aud, role)
  values
    ('${S1}', 'placement-test-s1@example.com', '${PASSWORD_HASH}', now(), now(), now(),
      '{"role":"student","full_name":"Placement Test Student One"}', 'authenticated', 'authenticated'),
    ('${S2}', 'placement-test-s2@example.com', '${PASSWORD_HASH}', now(), now(), now(),
      '{"role":"student","full_name":"Placement Test Student Two"}', 'authenticated', 'authenticated'),
    ('${T1}', 'placement-test-t1@example.com', '${PASSWORD_HASH}', now(), now(), now(),
      '{"role":"teacher","full_name":"Placement Test Teacher"}', 'authenticated', 'authenticated');
`);
const students = await mgmtQuery(`
  delete from public.students where profile_id in ('${S1}','${S2}');
  insert into public.students (profile_id, real_name, level, payment_deadline, monthly_fee)
  values
    ('${S1}', 'Placement Test Student One', 'A', 5, 0),
    ('${S2}', 'Placement Test Student Two', 'B', 5, 0)
  returning id, level;
`);
const S1_ID = students[0].id;
const S2_ID = students[1].id;
await mgmtQuery(`
  delete from public.teacher_group_assignments where teacher_id = '${T1}';
  insert into public.teacher_group_assignments (teacher_id, level) values ('${T1}', 'A');
`);
check(S1_ID > 0 && S2_ID > 0, 'synthetic students created');

// ============================================================================
// 14. Anon callers are rejected everywhere.
// ============================================================================
{
  const r = await rpc(null, 'start_placement_attempt');
  check(!r.ok && /not authenticated/i.test(r.error), `anon start rejected (${ERR(r)})`);
  const r2 = await rpc(null, 'get_placement_attempt', { p_attempt_id: 999999999 });
  check(!r2.ok, `anon get rejected (${ERR(r2)})`);
}

// ============================================================================
// 1-2. Student starts an attempt; double-start resumes, never duplicates.
// ============================================================================
const start1 = await rpc(S1, 'start_placement_attempt');
check(start1.ok && start1.json.resumed === false, `attempt created (${ERR(start1)})`);
const attemptId = start1.json.attempt_id;
const start1b = await rpc(S1, 'start_placement_attempt');
check(start1b.ok && start1b.json.resumed === true && start1b.json.attempt_id === attemptId,
  'double-start resumes the same attempt');
let s2AttemptId = null; // set in the expiry block
let s2Attempt2Id = null; // set in the expiry block

// ============================================================================
// 3-4. Adaptive engine serves keyless questions; rotation + bounds.
// ============================================================================
const served = []; // {id, skill, cefr}
const asked = new Set();
const bySkill = {};
let listenedSkipped = 0;

async function serveAndAnswerOne() {
  const r = await rpc(S1, 'get_next_placement_question', { p_attempt_id: attemptId });
  if (!r.ok) throw new Error(`get_next failed: ${ERR(r)}`);
  return r.json;
}

let writingServed = null;
let leakChecks = 0;
for (let i = 0; i < 60; i++) {
  const p = await serveAndAnswerOne();
  if (p.phase === 'writing') { writingServed = p.question; break; }
  if (p.phase !== 'question') throw new Error(`unexpected phase ${p.phase}`);
  const rawQ = JSON.stringify(p);
  check(!rawQ.includes('answer_key') && !rawQ.includes('explanation') && !rawQ.includes('"is_correct"'),
    `get_next ${i} leaks no keys/correctness`);
  leakChecks++;
  const q = p.question;
  check(!asked.has(q.id), `question ${q.id} served only once`);
  asked.add(q.id);
  served.push({ id: q.id, skill: q.skill, cefr: q.cefr_level, type: q.question_type });
  bySkill[q.skill] = bySkill[q.skill] || { asked: 0, correct: 0, wrong: 0 };
  bySkill[q.skill].asked++;

  // privileged fetch of the answer key (harness only - students can't)
  const keys = await mgmtQuery(
    `select answer_key, accepted_answers, question_type from public.placement_questions where id = ${q.id}`
  );

  if (q.skill === 'listening' && listenedSkipped === 0) {
    const sv = await rpc(S1, 'save_placement_answer', {
      p_attempt_id: attemptId, p_question_id: q.id, p_answer: null, p_skipped: true,
    });
    check(sv.ok, `listening item skipped (${ERR(sv)})`);
    listenedSkipped = 1;
    bySkill[q.skill].wrong++;
    continue;
  }
  if (q.question_type === 'mcq') {
    const idx = keys[0].answer_key.option_index;
    const sv = await rpc(S1, 'save_placement_answer', {
      p_attempt_id: attemptId, p_question_id: q.id, p_answer: { option_index: idx }, p_skipped: false,
    });
    check(sv.ok, `mcq saved (${ERR(sv)})`);
    bySkill[q.skill].correct++;
  } else {
    const acc = keys[0].accepted_answers[0];
    const sv = await rpc(S1, 'save_placement_answer', {
      p_attempt_id: attemptId, p_question_id: q.id, p_answer: { text: acc }, p_skipped: false,
    });
    check(sv.ok, `gap_fill saved (${ERR(sv)})`);
    bySkill[q.skill].correct++;
  }
}
check(leakChecks >= 16, `keyless payloads verified across ${leakChecks} questions`);

const order = ['grammar', 'vocabulary', 'reading', 'listening'].filter((s) => bySkill[s]);
check(JSON.stringify(order) === JSON.stringify(['grammar', 'vocabulary', 'reading', 'listening']),
  `sections rotate in fixed order (${order.join('->')})`);
for (const s of order) {
  check(bySkill[s].asked >= 4 && bySkill[s].asked <= 7, `${s}: ${bySkill[s].asked} questions (4..7)`);
}
check(listenedSkipped === 1, 'exactly one listening item was skipped');
const grammarLevels = served.filter((x) => x.skill === 'grammar').map((x) => x.cefr);
check(Math.max(...grammarLevels) >= 3, `grammar climbs above entry (max ${Math.max(...grammarLevels)})`);

// ============================================================================
// 9. Answer-key protection at the table level (student RLS).
// ============================================================================
{
  const rows = await selectRows(S1, 'placement_questions');
  check(rows.length === 0, `student cannot read the question bank (${rows.length} rows)`);
}

// ============================================================================
// 5. Writing phase, then one-shot speaking prompts.
// ============================================================================
check(writingServed && writingServed.skill === 'writing', 'writing prompt served after objective phase');
{
  const sv = await rpc(S1, 'save_placement_answer', {
    p_attempt_id: attemptId, p_question_id: writingServed.id,
    p_answer: { text: 'I have studied English for two years. My favourite part is reading short stories because they teach me new words and interesting ideas.' },
    p_skipped: false,
  });
  check(sv.ok, `writing saved (${ERR(sv)})`);
  const p = await serveAndAnswerOne();
  check(p.phase === 'speaking' && Array.isArray(p.prompts) && p.prompts.length >= 1,
    `speaking prompts served once (${p.phase}, ${p.prompts?.length})`);
  const p2 = await serveAndAnswerOne();
  check(p2.phase === 'speaking' || p2.phase === 'complete', 'engine idempotent after speaking served');
}

// ============================================================================
// 7. Submit -> valid terminal state; results match the documented model.
// ============================================================================
const submit1 = await rpc(S1, 'submit_placement_attempt', { p_attempt_id: attemptId });
check(submit1.ok && submit1.json.overall_level, `submit produced a result (${ERR(submit1)})`);
const result = submit1.json;
check(result.total_asked >= 12, `enough questions asked (${result.total_asked})`);
check(result.insufficient_evidence === false, 'full attempt is not flagged insufficient');
check(['high', 'medium', 'low'].includes(result.confidence), `confidence present (${result.confidence})`);
check(['A', 'A1', 'B', 'C'].includes(result.recommended_academy_level),
  `academy recommendation valid (${result.recommended_academy_level})`);

{
  const skillResult = {};
  for (const s of ['grammar', 'vocabulary', 'reading', 'listening']) {
    const items = served.filter((x) => x.skill === s);
    if (items.length === 0) continue;
    let denom = 0, earned = 0, skippedSoFar = 0;
    for (const it of items) {
      const isSkipped = s === 'listening' && skippedSoFar++ === 0; // the one skip
      denom += it.cefr;
      if (!isSkipped) earned += it.cefr;
    }
    const pct = Math.round((earned / denom) * 1000) / 10;
    const level = pct < 35 ? 1 : pct < 50 ? 2 : pct < 65 ? 3 : pct < 80 ? 4 : pct < 92 ? 5 : 6;
    skillResult[s] = { pct, level };
  }
  for (const s of Object.keys(skillResult)) {
    const actual = result.skills[s];
    check(actual && Math.abs(actual.pct - skillResult[s].pct) < 0.15,
      `${s} pct matches model (${actual.pct} vs ${skillResult[s].pct})`);
    check(actual && actual.level === skillResult[s].level,
      `${s} level matches model (${actual.level} vs ${skillResult[s].level})`);
  }
  const levels = Object.values(skillResult).map((x) => x.level).sort((a, b) => a - b);
  const n = levels.length;
  const median = Math.floor((levels[(n - 1) >> 1] + levels[n >> 1]) / 2);
  check(result.overall_level === median, `overall = conservative median (${result.overall_level} vs ${median})`);
  const spread = levels[n - 1] - levels[0];
  const conf = spread <= 1 ? 'high' : spread === 2 ? 'medium' : 'low';
  check(result.confidence === conf, `confidence matches spread (${result.confidence} vs ${conf})`);
}

const submit1b = await rpc(S1, 'submit_placement_attempt', { p_attempt_id: attemptId });
check(submit1b.ok && JSON.stringify(submit1b.json) === JSON.stringify(result),
  'resubmit is idempotent (identical result)');

// ============================================================================
// 8. Unauthorized access attempts.
// ============================================================================
{
  const r = await rpc(S2, 'get_next_placement_question', { p_attempt_id: attemptId });
  check(!r.ok && /attempt not found/i.test(r.error), `S2 cannot drive S1's attempt (${ERR(r)})`);
  const r2 = await rpc(S2, 'get_placement_attempt', { p_attempt_id: attemptId });
  check(!r2.ok && /attempt not found|access denied/i.test(r2.error), `S2 cannot read S1's attempt (${ERR(r2)})`);
  const r3 = await rpc(S2, 'save_placement_answer', {
    p_attempt_id: attemptId, p_question_id: served[0].id, p_answer: { option_index: 0 }, p_skipped: false,
  });
  check(!r3.ok, `S2 cannot save into S1's attempt (${ERR(r3)})`);
  const s2Attempts = await selectRows(S2, 'placement_attempts', 'x.id is not null');
  check(!s2Attempts.some((x) => x.id === attemptId), 'S2 RLS cannot see S1 attempt rows');
  const s1Attempts = await selectRows(S1, 'placement_attempts', 'x.id is not null');
  check(s1Attempts.some((x) => x.id === attemptId), 'S1 sees own attempt rows');
  // save after submit
  const r8 = await rpc(S1, 'save_placement_answer', {
    p_attempt_id: attemptId, p_question_id: served[0].id, p_answer: { option_index: 0 }, p_skipped: false,
  });
  check(!r8.ok && /not in progress/i.test(r8.error), `save after submit rejected (${ERR(r8)})`);
}

// ============================================================================
// 6. Expired attempts: deadline is server-enforced.
// ============================================================================
{
  const s2start = await rpc(S2, 'start_placement_attempt');
  check(s2start.ok, `S2 attempt started (${ERR(s2start)})`);
  s2AttemptId = s2start.json.attempt_id;
  const q1 = await rpc(S2, 'get_next_placement_question', { p_attempt_id: s2AttemptId });
  check(q1.ok && q1.json.phase === 'question', 'S2 receives a first question');
  // unasked-question validation on a live attempt
  {
    const unaskedRows = await mgmtQuery(
      `select min(id) as id from public.placement_questions where id not in (${[...asked].join(',') || '0'})`
    );
    const r7 = await rpc(S2, 'save_placement_answer', {
      p_attempt_id: s2AttemptId, p_question_id: unaskedRows[0].id, p_answer: { option_index: 0 }, p_skipped: false,
    });
    check(!r7.ok && /not asked/i.test(r7.error), `unasked question rejected (${ERR(r7)})`);
  }
  await mgmtQuery(`update public.placement_attempts set deadline = now() - interval '1 hour' where id = ${s2AttemptId}`);
  const expired = await rpc(S2, 'get_next_placement_question', { p_attempt_id: s2AttemptId });
  check(expired.ok && expired.json.phase === 'expired', `expired phase returned (${expired.json?.phase})`);
  const saveExpired = await rpc(S2, 'save_placement_answer', {
    p_attempt_id: s2AttemptId, p_question_id: q1.json.question.id, p_answer: { option_index: 0 }, p_skipped: false,
  });
  check(!saveExpired.ok, `save after expiry rejected (${ERR(saveExpired)})`);
  const rows = await mgmtQuery(`select status from public.placement_attempts where id = ${s2AttemptId}`);
  check(rows[0].status === 'expired', 'attempt marked expired in the database');
  // retake after expiry, then empty submit -> insufficient evidence
  const s2b = await rpc(S2, 'start_placement_attempt');
  check(s2b.ok && s2b.json.resumed === false, 'new attempt after expiry (cap not hit)');
  s2Attempt2Id = s2b.json.attempt_id;
  const s2submit = await rpc(S2, 'submit_placement_attempt', { p_attempt_id: s2Attempt2Id });
  check(s2submit.ok && s2submit.json.insufficient_evidence === true,
    'empty submit -> insufficient evidence, not a guess');
  check(s2submit.json.confidence === 'low', 'empty submit confidence is low');
  const s2Rows = await selectRows(S2, 'placement_attempts', 'x.id is not null');
  check(!s2Rows.some((x) => x.id === attemptId), 'S2 still cannot see S1 attempts');
}

// ============================================================================
// 13. Retakes after submit are allowed and history persists.
// ============================================================================
{
  const s1c = await rpc(S1, 'start_placement_attempt');
  check(s1c.ok && s1c.json.resumed === false && s1c.json.attempt_id !== attemptId,
    'S1 retake creates a fresh attempt after submit');
  const hist = await rpc(S1, 'list_my_placement_attempts');
  check(hist.ok && hist.json.length >= 2, `history lists attempts (${hist.json?.length})`);
  check(hist.json.some((a) => a.id === attemptId && a.estimated_level === result.overall_level),
    'submitted result persists in history');
  await rpc(S1, 'submit_placement_attempt', { p_attempt_id: s1c.json.attempt_id });
}

// ============================================================================
// 10-12. Teacher review: scope, rubric bounds, mandatory reason.
// ============================================================================
{
  const tRows = await selectRows(T1, 'placement_attempts', 'x.id is not null');
  check(tRows.some((x) => x.id === attemptId), 'teacher sees assigned-level student attempts');
  check(!tRows.some((x) => x.id === s2AttemptId), 'teacher cannot see other-level students');
  const tp = await rpc(T1, 'get_placement_attempt', { p_attempt_id: attemptId });
  check(tp.ok, `teacher payload fetched (${ERR(tp)})`);
  const hasKeys = tp.json.questions.some((q) => q.answer_key !== null || q.explanation !== null);
  check(hasKeys, 'staff payload includes answer keys/explanations after submit');
  check(tp.json.student && tp.json.student.level === 'A', 'staff payload includes student info');
  const tDenied = await rpc(T1, 'get_placement_attempt', { p_attempt_id: s2AttemptId });
  check(!tDenied.ok && /access denied/i.test(tDenied.error), `out-of-scope teacher denied (${ERR(tDenied)})`);
  const tDenied2 = await rpc(T1, 'get_placement_attempt', { p_attempt_id: s2Attempt2Id });
  check(!tDenied2.ok, 'out-of-scope teacher denied on S2 retake attempt');

  const noReason = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: '',
  });
  check(!noReason.ok && /reason is required/i.test(noReason.error), `empty reason rejected (${ERR(noReason)})`);
  const badLevel = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 7, p_reason: 'test',
  });
  check(!badLevel.ok && /between 1 and 6/i.test(badLevel.error), `final level 7 rejected (${ERR(badLevel)})`);
  const badRubric = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'solid B1 evidence',
    p_writing_scores: { task_completion: 2, grammar_control: 4, vocabulary_range: 2, coherence: 2 },
  });
  check(!badRubric.ok && /between 0 and 3/i.test(badRubric.error), `rubric 4 rejected (${ERR(badRubric)})`);
  const missingDim = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'solid B1 evidence',
    p_writing_scores: { task_completion: 2, grammar_control: 2, vocabulary_range: 2 },
  });
  check(!missingDim.ok && /missing rubric dimension/i.test(missingDim.error),
    `missing rubric dimension rejected (${ERR(missingDim)})`);

  const sReview = await rpc(S1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'self-review attempt',
  });
  check(!sReview.ok && /access denied/i.test(sReview.error), `student cannot review (${ERR(sReview)})`);

  const review = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'Confirmed B1: writing coherent, speaking task clear',
    p_writing_scores: { task_completion: 2, grammar_control: 2, vocabulary_range: 2, coherence: 3 },
    p_speaking_scores: { intelligibility: 3, grammar_control: 2, vocabulary_range: 2, fluency_coherence: 2 },
    p_speaking_conducted: true,
  });
  check(review.ok, `review accepted (${ERR(review)})`);
  check(review.json && review.json.final_level === 3, 'review row carries final level');

  const after = await mgmtQuery(`
    select a.status, a.final_level, a.review_status, s.level as group_level
    from public.placement_attempts a join public.students s on s.id = a.student_id
    where a.id = ${attemptId}`);
  check(after[0].status === 'reviewed' && after[0].review_status === 'reviewed',
    'attempt reached reviewed state');
  check(after[0].final_level === 3, 'final level persisted');
  check(after[0].group_level === 'A', `student group unchanged (still ${after[0].group_level})`);

  const review2 = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 4, p_reason: 'Adjusted up after live speaking check',
  });
  check(review2.ok, 're-review allowed (upsert)');
  const after2 = await mgmtQuery(`select final_level from public.placement_attempts where id = ${attemptId}`);
  check(after2[0].final_level === 4, 'adjusted final level persisted');

  const sView = await rpc(S1, 'get_placement_attempt', { p_attempt_id: attemptId });
  check(sView.ok && sView.json.review && sView.json.review.final_level === 4,
    'student sees confirmed review');

  const hist = await rpc(S1, 'list_my_placement_attempts');
  const reviewedEntry = hist.json.find((a) => a.id === attemptId);
  check(reviewedEntry && reviewedEntry.status === 'reviewed' && reviewedEntry.final_level === 4,
    'history entry shows reviewed status and final level');
}

console.log(failures === 0 ? 'ASCII-START placement-staging-lifecycle ALL CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
