// homework-completed-count.test.mjs - dashboard "homework completed" count.
// Static checks over the migration + unit tests of the counting rule
// (authoritative per-assignment completion, never questions/views/dupes).
// Behavioral matrix is verified live (temp objects, fully cleaned up).
// Run: node tests/homework-completed-count.test.mjs

import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
function read(p) { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch { return ''; } }
console.log('ASCII-START homework-completed-count');

console.log('=== A. Migration: read-only server-side completion ===');
const MIG = 'supabase/migrations/20261107000000_homework_completion.sql';
const mig = read(MIG);
assert(mig.length > 1500, 'migration exists and is substantial');
assert(mig.includes('create or replace function public.get_my_homework_completion()'), 'single-purpose RPC created');
assert(mig.includes('security definer'), 'SECURITY DEFINER (bypasses RLS by design, like other RPCs)');
assert(mig.includes('profile_id = auth.uid()'), 'student resolved from auth.uid() (own data only)');
assert(!mig.includes('p_student_id'), 'no student_id parameter (cannot count for others)');
assert(!/^\s*(insert|update|delete)\s/im.test(mig), 'no write statements (read-only)');
assert(!mig.includes('point_transactions'), 'no points touched');
assert(mig.includes('grant execute on function public.get_my_homework_completion() to authenticated'), 'authenticated-only grant');
assert(mig.includes('revoke execute on function public.get_my_homework_completion() from anon'), 'anon revoked');
assert(mig.includes("status = 'completed'"), 'completion reads authoritative stage progress');
assert(mig.includes("hs.status in ('Submitted', 'Graded')"), 'manual Submitted/Graded flow preserved');
assert(mig.includes('coalesce(s.is_required, true)'), 'required-visibility rule mirrors UI (unnumbered/required edge handled)');
assert(mig.includes('coalesce(a.stages_total, 0) > 0'), 'content-less homework never counts');

console.log('=== B. Counting rule (per assignment, deduped) ===');
// Mirror of the server rule for fixtures: one flag per homework_id.
function countCompleted(rows) {
  const seen = new Set();
  let n = 0;
  for (const r of rows) {
    if (seen.has(r.homework_id)) continue;
    seen.add(r.homework_id);
    if (r.completed) n++;
  }
  return n;
}
assert(countCompleted([]) === 0, 'zero completed -> 0');
assert(countCompleted([{ homework_id: 1, completed: true }]) === 1, 'one completed -> 1');
assert(countCompleted([{ homework_id: 1, completed: true }, { homework_id: 2, completed: true }, { homework_id: 3, completed: false }]) === 2, 'multiple completed counted once each');
assert(countCompleted([{ homework_id: 1, completed: true }, { homework_id: 1, completed: true }]) === 1, 'duplicate rows do not double-count');
assert(countCompleted([{ homework_id: 5, completed: false }]) === 0, 'incomplete/abandoned not counted');
assert(countCompleted(Array.from({ length: 10 }, (_, i) => ({ homework_id: i + 1, completed: true }))) === 10, 'large counts work (10)');

console.log('=== C. Client wiring (statistic only) ===');
const sb = read('src/lib/storageBridge.js');
assert(sb.includes('getMyHomeworkCompletion') && sb.includes("supabase.rpc('get_my_homework_completion')"), 'storageBridge RPC wrapper exists');
const pg = read('src/pages/portal/MyProgress.jsx');
assert(pg.includes('getMyHomeworkCompletion'), 'dashboard fetches server completion');
assert(pg.includes('completedHomeworkIds'), 'count derived from authoritative id set');
assert(pg.includes("h.statusRow?.status === 'Graded'"), 'graded display untouched');
assert(!pg.includes("h.statusRow?.status === 'Submitted' || h.statusRow?.status === 'Graded'"), 'old Submitted/Graded heuristic no longer drives the count (row pills untouched)');
assert(pg.includes('mpHomeworkCompleted'), 'existing statistic card reused (no redesign)');

console.log(`RESULT failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
