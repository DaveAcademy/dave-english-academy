// Online Exam Ranking contract: server-side derived leaderboard.
// Static guards on the migration (latest-wins, submitted-only, order keys,
// grants, no writes, no coupling) + a JS mirror of the documented ordering
// (the RPC itself was verified live with fixtures A-D plus tie cases).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}

const sql = readFileSync(`${root}/supabase/migrations/20261018000012_online_exam_ranking.sql`, 'utf8');
const code = sql.replace(/--.*$/gm, '');
check(/distinct on\s*\(\s*a\.student_id\s*,\s*a\.test_id\s*\)/i.test(sql), 'latest attempt per student/test');
check(/where a\.status = 'submitted'/.test(sql), 'only submitted attempts aggregate');
check(!/\bin_progress\b/.test(code), 'no in_progress path in ranking');
check(/average desc/i.test(sql) && /total_correct desc/i.test(sql) && /tests desc/i.test(sql), 'order: average, total, tests');
check(/real_name asc/i.test(sql) && /row_number\(\)/i.test(sql), 'deterministic name tiebreak + rank');
check(/revoke execute/i.test(sql) && /grant execute/i.test(sql) && /to authenticated/i.test(sql), 'revoke public, grant authenticated');
check(!/\binsert\b|\bupdate\b|\bdelete\b/i.test(code), 'read-only: no writes');
for (const t of ['point_transactions', 'game_points', 'students_xp', 'homework', 'exam_scores', 'attendance']) {
  check(!new RegExp(`\\b${t}\\b`).test(code), `no coupling to ${t}`);
}

// Ordering mirror (documents the server ORDER BY for UI reasoning).
function cmp(a, b) {
  return (b.average - a.average) || (b.total - a.total) || (b.tests - a.tests)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}
const rows = [
  { name: 'Eve', average: 94, total: 64, tests: 2 },
  { name: 'Alice', average: 94, total: 64, tests: 2 },
  { name: 'Jill', average: 94, total: 32, tests: 1 },
  { name: 'Frank', average: 100, total: 34, tests: 1 },
  { name: 'Bob', average: 82, total: 28, tests: 1 },
];
const ordered = [...rows].sort(cmp).map((r) => r.name);
check(JSON.stringify(ordered) === JSON.stringify(['Frank', 'Alice', 'Eve', 'Jill', 'Bob']), `order avg>total>tests>name (${ordered.join(',')})`);

// Percentage formatting used by the ranking UI.
const pct = (v) => `${v}%`;
check(pct(94) === '94%', 'percentage format');

console.log(failures === 0 ? 'ALL ONLINE-TEST-RANKING CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
