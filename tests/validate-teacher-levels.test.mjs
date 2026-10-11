// validate-teacher-levels.test.mjs — provisioning guard for teacher level
// assignments (attendance RLS 0135 rejects teachers with no rows).
// Unit-tests the shared validator plus static contracts on the Edge Function
// and the creation form. No DB, no network.
// Run: node tests/validate-teacher-levels.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { validateTeacherLevels } from '../supabase/functions/admin-create-user/validateLevels.ts';

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error(`FAIL ${msg}`); failures++; }
  else console.log(`ok ${msg}`);
}
const repo = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

// Explicit assignments pass through; duplicates collapse (no duplicate rows).
check(JSON.stringify(validateTeacherLevels(['A', 'C'])) === JSON.stringify({ ok: true, levels: ['A', 'C'] }), 'explicit levels accepted');
check(JSON.stringify(validateTeacherLevels(['B', 'B', 'A'])) === JSON.stringify({ ok: true, levels: ['B', 'A'] }), 'duplicates deduped, order kept');

// Empty default: omitted or empty means NO levels, never all levels.
check(JSON.stringify(validateTeacherLevels(undefined)) === JSON.stringify({ ok: true, levels: [] }), 'omitted defaults to empty');
check(JSON.stringify(validateTeacherLevels([])) === JSON.stringify({ ok: true, levels: [] }), 'empty array stays empty');

// Invalid values and malformed payloads rejected.
for (const bad of [['D'], ['a'], ['A', 'D'], ['A', 1], ['A', null], 'A', 'ABC', 42, null, {}, { levels: ['A'] }]) {
  check(validateTeacherLevels(bad).ok === false, `rejected: ${JSON.stringify(bad)}`);
}

// Edge Function contracts (static — Deno runtime not needed).
const fn = read('supabase/functions/admin-create-user/index.ts');
check(fn.includes("import { validateTeacherLevels } from \"./validateLevels.ts\""), 'Edge imports shared validator');
check(fn.includes("role !== \"teacher\" && body.levels !== undefined"), 'levels rejected for non-teacher roles');
check(fn.includes('role === "teacher"') && fn.includes('teacher_group_assignments'), 'assignments inserted for teachers only');
check(fn.includes('onConflict: "teacher_id,level"') && fn.includes('ignoreDuplicates: true'), 'upsert makes retries duplicate-safe');
check(fn.includes('levelsWarning'), 'assignment failure surfaces explicit warning, not silent success');

// Form contracts (static).
const form = read('src/features/students/components/CreateUserForm.jsx');
check(form.includes('levels: []') && form.includes("ALL_LEVELS = ['A', 'B', 'C']"), 'form defaults to no levels');
check(form.includes("form.role === 'teacher' ? { levels: form.levels }"), 'form sends levels for teachers only');
check(form.includes('cannot mark attendance'), 'form explains empty-assignment consequence');
check(form.includes('created.levelsWarning'), 'form displays assignment-failure warning');

console.log(failures === 0 ? 'ALL VALIDATE-TEACHER-LEVELS CHECKS PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
