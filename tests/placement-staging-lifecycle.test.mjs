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
// 3-4. Fixed-60 delivery: keyless payloads, A1->C2 order, 10 per level,
//      required skill distribution, no repeats, no early termination.
// ============================================================================
const served = []; // {id, skill, cefr, type, correct}
const asked = new Set();
const byLevel = {};
const bySkill = {};

async function serveAndAnswerOne() {
  const r = await rpc(S1, 'get_next_placement_question', { p_attempt_id: attemptId });
  if (!r.ok) throw new Error(`get_next failed: ${ERR(r)}`);
  return r.json;
}

// deterministic rubric-satisfying text for scored writing tasks
const WRITING_POOL = ['yesterday', 'morning', 'coffee', 'window', 'garden', 'blanket', 'engine', 'ladder', 'candle', 'harbor', 'meadow', 'pencil', 'market', 'silver', 'bridge', 'autumn', 'planet', 'ribbon', 'shelter', 'thunder'];
function writingTextFor(prompt) {
  const min = (prompt && prompt.min_words) || 20;
  const words = [];
  for (let i = 0; i < min + 5; i++) words.push(WRITING_POOL[i % WRITING_POOL.length]);
  return words.join(' ') + '.';
}

let writingCount = 0;
let leakChecks = 0;
for (let i = 0; i < 75; i++) {
  const p = await serveAndAnswerOne();
  if (p.phase === 'speaking') { break; }
  if (p.phase === 'writing') {
    // scored writing item inside the sequence: satisfy the completion rubric
    const wq = p.question;
    const rawW = JSON.stringify(p);
    check(!rawW.includes('answer_key') && !rawW.includes('explanation'), `writing ${wq.id} keyless`);
    check(!asked.has(wq.id), `writing task ${wq.id} served only once`);
    asked.add(wq.id);
    served.push({ id: wq.id, skill: 'writing', cefr: wq.cefr_level, type: 'prompt', correct: true });
    bySkill.writing = bySkill.writing || { asked: 0, correct: 0 };
    bySkill.writing.asked++; bySkill.writing.correct++;
    const text = writingTextFor(wq.prompt);
    const sv = await rpc(S1, 'save_placement_answer', {
      p_attempt_id: attemptId, p_question_id: wq.id, p_answer: { text }, p_skipped: false,
    });
    check(sv.ok, `writing item ${wq.id} saved with rubric-satisfying text (${ERR(sv)})`);
    writingCount++;
    continue;
  }
  if (p.phase !== 'question') throw new Error(`unexpected phase ${p.phase}`);
  const rawQ = JSON.stringify(p);
  check(!rawQ.includes('answer_key') && !rawQ.includes('explanation') && !rawQ.includes('"is_correct"'),
    `get_next ${i} leaks no keys/correctness`);
  leakChecks++;
  const q = p.question;
  check(!asked.has(q.id), `question ${q.id} served only once`);
  asked.add(q.id);
  served.push({ id: q.id, skill: q.skill, cefr: q.cefr_level, type: q.question_type, correct: true });
  byLevel[q.cefr_level] = (byLevel[q.cefr_level] || 0) + 1;
  bySkill[q.skill] = bySkill[q.skill] || { asked: 0, correct: 0 };
  bySkill[q.skill].asked++;

  // privileged fetch of the answer key (harness only - students can't)
  const keys = await mgmtQuery(
    `select answer_key, accepted_answers, question_type from public.placement_questions where id = ${q.id}`
  );

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
check(leakChecks === 50, `keyless payloads verified across all ${leakChecks} objective questions`);

// exactly 60 scored: 10 per level, sequential A1 -> C2, required distribution
const levelsServed = served.map((x) => x.cefr);
check(levelsServed.length === 60, `exactly 60 scored questions served (${levelsServed.length})`);
for (let lvl = 1; lvl <= 6; lvl++) {
  const n = levelsServed.filter((l) => l === lvl).length;
  check(n === 10, `level ${lvl}: exactly 10 questions served (${n})`);
}
const sorted = [...levelsServed].sort((a, b) => a - b);
check(JSON.stringify(levelsServed) === JSON.stringify(sorted),
  'questions arrive sequentially A1 -> C2 (never a lower level after a higher one)');
const distCount = {};
for (const x of served) distCount[x.skill] = (distCount[x.skill] || 0) + 1;
check((distCount.listening || 0) === 0, 'no listening questions served');
check(distCount.writing === 10, `10 writing tasks served (${distCount.writing})`);
check(distCount.grammar === 20, `20 grammar questions served (${distCount.grammar})`);
check(distCount.vocabulary === 15, `15 vocabulary questions served (${distCount.vocabulary})`);
check(distCount.reading === 15, `15 reading questions served (${distCount.reading})`);

// ============================================================================
// 9. Answer-key protection at the table level (student RLS).
// ============================================================================
{
  const rows = await selectRows(S1, 'placement_questions');
  check(rows.length === 0, `student cannot read the question bank (${rows.length} rows)`);
}

// ============================================================================
// 5. After the 60 scored questions: unscored speaking diagnostic.
// ============================================================================
{
  const p = await serveAndAnswerOne();
  check(p.phase === 'speaking' && Array.isArray(p.prompts) && p.prompts.length >= 1,
    `speaking prompts served once (${p.phase}, ${p.prompts?.length})`);
  const p2 = await serveAndAnswerOne();
  check(p2.phase === 'speaking' || p2.phase === 'complete', 'engine idempotent after speaking served');
  check(writingCount === 10, `all 10 writing tasks answered inside the sequence (${writingCount})`);
}

// ============================================================================
// 7. Submit -> 600/600, per-level/per-skill scores, estimated C2, idempotent.
// ============================================================================
const submit1 = await rpc(S1, 'submit_placement_attempt', { p_attempt_id: attemptId });
check(submit1.ok && submit1.json.estimated_level, `submit produced a result (${ERR(submit1)})`);
const result = submit1.json;
check(result.format === 'fixed-60', 'result carries the fixed-60 format marker');
check(result.total_score === 600, `all-correct attempt scores 600/600 (${result.total_score})`);
check(result.max_score === 600, 'max_score persisted as 600');
check(result.correct_count === 60, `correct_count 60/60 (${result.correct_count})`);
check(result.estimated_level === 6, `all-correct attempt estimates C2 (${result.estimated_level})`);
check(result.insufficient_evidence === false, 'full attempt is not flagged insufficient');
check(['high', 'medium', 'low'].includes(result.confidence), `confidence present (${result.confidence})`);
check(['A', 'A1', 'B', 'C'].includes(result.recommended_academy_level),
  `academy recommendation valid (${result.recommended_academy_level})`);

{
  const levelResult = {};
  for (let lvl = 1; lvl <= 6; lvl++) {
    const items = served.filter((x) => x.cefr === lvl);
    const correct = items.filter((x) => x.correct).length;
    levelResult[lvl] = { correct, score: correct * 10, max: items.length * 10 };
  }
  for (let lvl = 1; lvl <= 6; lvl++) {
    const actual = result.per_level[String(lvl)];
    check(actual && actual.score === levelResult[lvl].score,
      `level ${lvl} score matches model (${actual?.score} vs ${levelResult[lvl].score})`);
    check(actual && actual.correct === levelResult[lvl].correct,
      `level ${lvl} correct count matches (${actual?.correct} vs ${levelResult[lvl].correct})`);
  }
  const skillTotals = {};
  for (const x of served) {
    skillTotals[x.skill] = skillTotals[x.skill] || { correct: 0, asked: 0, score: 0 };
    skillTotals[x.skill].asked += 1;
    skillTotals[x.skill].correct += x.correct ? 1 : 0;
    skillTotals[x.skill].score += x.correct ? 10 : 0;
  }
  for (const [s, v] of Object.entries(skillTotals)) {
    const actual = result.per_skill[s];
    check(actual && actual.score === v.score && actual.asked === v.asked,
      `skill ${s} breakdown matches (${actual?.score}/${v.score}, asked ${actual?.asked}/${v.asked})`);
  }
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
// 6. Expired attempts: deadline is server-enforced; stale attempts finalize
//    automatically with computed evidence (never a bare discard).
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
  check(expired.ok && expired.json.phase === 'complete' && expired.json.submitted === true,
    `stale attempt auto-finalized on access (phase ${expired.json?.phase})`);
  const saveExpired = await rpc(S2, 'save_placement_answer', {
    p_attempt_id: s2AttemptId, p_question_id: q1.json.question.id, p_answer: { option_index: 0 }, p_skipped: false,
  });
  check(!saveExpired.ok, `save after expiry rejected (${ERR(saveExpired)})`);
  const rows = await mgmtQuery(`select status, result is not null as has_result, estimated_level from public.placement_attempts where id = ${s2AttemptId}`);
  check(rows[0].status === 'expired', 'attempt marked expired in the database');
  check(rows[0].has_result === true && rows[0].estimated_level != null,
    'expired attempt kept a computed preliminary result (evidence preserved)');
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
// 12b. Normalization probe: with the fixed sequence the FIRST question is the
// A1 gap_fill ("She ___ a teacher"), graded through placement_normalize_answer.
// ============================================================================
{
  const s2p = await rpc(S2, 'start_placement_attempt');
  check(s2p.ok, `probe attempt started (${ERR(s2p)})`);
  const pid = s2p.json.attempt_id;
  const step = (await rpc(S2, 'get_next_placement_question', { p_attempt_id: pid })).json;
  const gq = step.question;
  const k2 = await mgmtQuery(`select question_type, accepted_answers from public.placement_questions where id = ${gq.id}`);
  check(k2[0].question_type === 'gap_fill', `probe served a gap_fill item (got ${k2[0].question_type})`);
  const variant = '  ' + k2[0].accepted_answers[0].toUpperCase() + '!!  ';
  const sv = await rpc(S2, 'save_placement_answer', {
    p_attempt_id: pid, p_question_id: gq.id, p_answer: { text: variant }, p_skipped: false,
  });
  check(sv.ok, `normalization variant saved (${ERR(sv)})`);
  const graded = await mgmtQuery(`select is_correct from public.placement_answers where attempt_id = ${pid} and question_id = ${gq.id}`);
  check(graded[0].is_correct === true, 'normalized variant graded CORRECT');
  await rpc(S2, 'submit_placement_attempt', { p_attempt_id: pid });
}

// ============================================================================
// ============================================================================
// 4b. Legacy adaptive attempts: finalized on access, never switched to the
// fixed-60 format, scores never displayed as out of 600.
// ============================================================================
{
  const legacy = await mgmtQuery(
    `insert into public.placement_attempts (student_id, deadline, asked_question_ids, format)
    values (${S1_ID}, now() - interval '2 hours', '[5,9,6,10,7,11]'::jsonb, 'legacy-adaptive')
    returning id`);
  const legacyId = legacy[0].id;
  for (const [qid, ans] of [[5, 0], [6, 1], [7, 0]]) {
    const ansJson = JSON.stringify({ option_index: ans });
    await mgmtQuery(`insert into public.placement_answers (attempt_id, question_id, answer, skipped, is_correct, weight)
      values (${legacyId}, ${qid}, '${ansJson}'::jsonb, false, true, 2)`);
  }
  const r = await rpc(S1, "get_next_placement_question", { p_attempt_id: legacyId });
  check(r.ok && r.json.phase === "complete" && r.json.submitted === true,
    `legacy attempt finalized on access (phase ${r.json?.phase})`);
  const st = await mgmtQuery(`select format, status, result->>'format' as result_format,
    result->>'max_score' as max_score, result->>'insufficient_evidence' as insufficient,
    estimated_level from public.placement_attempts where id = ${legacyId}`);
  check(st[0].format === "legacy-adaptive", "attempt format remains legacy-adaptive");
  check(st[0].status === "expired", "legacy attempt expired after finalization");
  check(st[0].result_format === "legacy-adaptive", "result carries the legacy-adaptive format marker");
  check(Number(st[0].max_score) === 60, `max_score reflects asked items only (60, not 600: ${st[0].max_score})`);
  check(st[0].insufficient === "true", "legacy partial attempt flagged insufficient evidence");
  const ans = await mgmtQuery(`select count(*) as n from public.placement_answers where attempt_id = ${legacyId}`);
  check(Number(ans[0].n) >= 3, `legacy answers preserved (${ans[0].n})`);
  const lr = await rpc(T1, "submit_placement_review", {
    p_attempt_id: legacyId, p_final_level: 2, p_reason: "Legacy partial attempt: only grammar evidence available",
  });
  check(lr.ok, `teacher can review the finalized legacy attempt (${ERR(lr)})`);
  await mgmtQuery(`delete from public.placement_reviews where attempt_id = ${legacyId}`);
  await mgmtQuery(`delete from public.placement_attempts where id = ${legacyId}`);
}

// 13. Retakes after submit are allowed and history persists.
// ============================================================================
{
  const s1c = await rpc(S1, 'start_placement_attempt');
  check(s1c.ok && s1c.json.resumed === false && s1c.json.attempt_id !== attemptId,
    'S1 retake creates a fresh attempt after submit');
  const hist = await rpc(S1, 'list_my_placement_attempts');
  check(hist.ok && hist.json.length >= 2, `history lists attempts (${hist.json?.length})`);
  check(hist.json.some((a) => a.id === attemptId && a.estimated_level === result.estimated_level),
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
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'solid evidence',
    p_writing_scores: { task_completion: 2, grammar_control: 4, vocabulary_range: 2, coherence: 2 },
  });
  check(!badRubric.ok && /between 0 and 3/i.test(badRubric.error), `rubric 4 rejected (${ERR(badRubric)})`);
  const missingDim = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'solid evidence',
    p_writing_scores: { task_completion: 2, grammar_control: 2, vocabulary_range: 2 },
  });
  check(!missingDim.ok && /missing rubric dimension/i.test(missingDim.error),
    `missing rubric dimension rejected (${ERR(missingDim)})`);

  const sReview = await rpc(S1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'self-review attempt',
  });
  check(!sReview.ok && /access denied/i.test(sReview.error), `student cannot review (${ERR(sReview)})`);

  const review = await rpc(T1, 'submit_placement_review', {
    p_attempt_id: attemptId, p_final_level: 3, p_reason: 'Confirmed B2 range: strong grammar and reading',
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
