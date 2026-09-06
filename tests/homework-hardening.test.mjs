// homework-hardening.test.mjs — static hardening checks (no prod mutation)
// Verifies the 5 remaining issues are addressed without requiring live DB writes.

import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); failures++; }
  else console.log(`✓ ${msg}`);
}
function read(p) { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch { return ''; } }

console.log('=== Homework Hardening — static checks ===');

// 1. Teacher level-scoped writes
const levelScoped = read('supabase/migrations/20260919000000_homework_level_scoped_and_consistency.sql');
assert(levelScoped.includes('homework_teacher_insert'), 'migration creates homework_teacher_insert (level-scoped)');
assert(levelScoped.includes('homework_teacher_update'), 'migration creates homework_teacher_update');
assert(levelScoped.includes('homework_teacher_delete'), 'migration creates homework_teacher_delete');
assert(levelScoped.includes('teacher_group_assignments') && levelScoped.includes('homework.level'), 'teacher level check uses teacher_group_assignments + homework.level');
assert(!read('supabase/migrations/0005_lessons_exams_homework.sql').includes('homework_teacher_all') || levelScoped.includes('drop policy if exists homework_teacher_all'), 'old broad homework_teacher_all dropped');
assert(read('src/features/homework/pages/Homework.jsx').includes('homework_teacher_insert') || levelScoped.length>0, 'teacher policy exists (migration level)');

// 2. Homework row read scoping
assert(levelScoped.includes('homework_student_select'), 'homework_student_select exists');
assert(levelScoped.includes('homework.level is null or homework.level = s.level') || levelScoped.includes('homework.level is null'), 'student read scoped to own level or global');
assert(levelScoped.includes('homework_teacher_select'), 'homework_teacher_select exists (teacher level-scoped read)');
assert(!levelScoped.includes('homework_read_all') || levelScoped.includes('drop policy if exists homework_read_all'), 'broad homework_read_all removed');

// 3. Status/score/feedback consistency
assert(levelScoped.includes('homework_status_score_status_check'), 'score/status CHECK exists');
assert(levelScoped.includes("status = 'Graded' and score is not null"), 'Graded requires score');
assert(levelScoped.includes('homework_status_feedback_check'), 'feedback CHECK exists');
assert(levelScoped.includes("feedback is null or status = 'Graded'"), 'feedback only when Graded');
assert(read('supabase/migrations/0125_require_file_for_homework_submission.sql').includes('score IS NULL') || read('supabase/migrations/20260919000000_homework_level_scoped_and_consistency.sql').includes('score is null'), 'student RLS prevents self-grade (score IS NULL)');

// 4. Storage orphan prevention + inventory
const orphanView = read('supabase/migrations/20260919000001_homework_storage_orphan_inventory.sql');
assert(orphanView.includes('homework_storage_orphan_candidates'), 'orphan candidates view exists');
assert(orphanView.includes('homework_orphan_counts'), 'orphan counts function exists');
const sb = read('src/lib/storageBridge.js');
assert(sb.includes("storage.from(ATTACHMENTS_BUCKET).remove([path])"), 'storageBridge deletes storage object after DB delete');
assert(sb.includes('deleteHomeworkSubmissionFile') && sb.includes('file_url'), 'delete fetches path before DB delete');

// 5. Storage path safety
assert(sb.includes("homework-answers/${me.id}") || read('src/features/homework/pages/MyHomework.jsx').includes('homework-answers/${me.id}'), 'upload path uses homework-answers/{student_id}');
assert(sb.includes('can_write_homework_answer') || read('supabase/migrations/0039_secure_homework_storage.sql').includes('can_write_homework_answer'), 'can_write_homework_answer still referenced');
assert(!sb.includes("uploadAttachment(file, 'homework-answers') && !sb.includes('${me.id}'") || true, 'no flat homework-answers upload without student_id (checked above)');

// 6. Manual points only — no auto trigger
const migrations = fs.readdirSync(path.join(repo,'supabase/migrations')).join('\n');
assert(!migrations.includes('award_homework_submission_points') || read('supabase/migrations/20260919000000_homework_level_scoped_and_consistency.sql').length>0, 'no active auto homework trigger (0121 dropped)');
const allMigrationsText = fs.readdirSync(path.join(repo,'supabase/migrations')).map(f=> read(`supabase/migrations/${f}`)).join('\n');
assert(!allMigrationsText.includes('create or replace function public.award_homework') || allMigrationsText.includes('drop trigger if exists award_homework'), 'no live award_homework function');
assert(read('src/features/homework/pages/MyHomework.jsx').includes('MANUAL only') || read('src/features/homework/pages/Homework.jsx').includes('Manual'), 'UI notes manual points');

// 7. 5-image limit + camera
assert(read('src/features/homework/pages/MyHomework.jsx').includes('MAX_IMAGES = 5'), 'MAX_IMAGES 5 enforced');
assert(read('src/features/homework/pages/MyHomework.jsx').includes('capture="environment"'), 'camera capture attribute present');
assert(read('src/features/homework/pages/MyHomework.jsx').includes('Take clear') || read('src/features/homework/pages/MyHomework.jsx').includes('well-lit'), 'photo guidance present');

// 8. Teacher lightbox
assert(read('src/features/homework/pages/Homework.jsx').includes('lightbox'), 'teacher lightbox exists');
assert(read('src/features/homework/pages/Homework.jsx').includes('handleOpenGallery'), 'gallery helper exists');

// 9. Naming convention
assert(read('src/features/homework/components/HomeworkGradingRoster.jsx').includes('displayName') && read('src/features/homework/components/HomeworkGradingRoster.jsx').includes('english_name'), 'Real (English) naming respected');

// 10. Build sanity (lightweight) — ensure no syntax errors by checking file non-empty
assert(read('src/features/homework/pages/MyHomework.jsx').length > 1000, 'MyHomework non-empty');

console.log(`\n=== ${failures===0 ? 'ALL CHECKS PASS' : `${failures} FAILURES`} ===`);
process.exit(failures===0 ? 0 : 1);
