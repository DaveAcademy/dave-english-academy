// Supabase-backed implementation of the storage contract src/lib/db.js
// exposes. Same function names and return shapes as the localStorage
// version, so useAcademyData.js and every page need zero changes.

import { supabase } from './supabaseClient';

function assertRows(rows, action) {
  if (!rows || rows.length === 0) {
    throw new Error(`You don't have permission to ${action}.`);
  }
  return rows;
}

// ---------- Students ----------

// Reads go through students_view (see migration 0012), not the base
// table directly - it returns the same columns/shape, except monthly_fee
// is nulled out server-side for anyone who isn't an administrator. Every
// write below still targets public.students directly; only this read
// path changes.
export async function listStudents() {
  const { data, error } = await supabase.from('students_view').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function createStudent(data) {
  const { data: record, error } = await supabase.from('students').insert(data).select('id').single();
  if (error) throw error;
  return record;
}

export async function bulkCreateStudents(rows, { dedupeKey } = {}) {
  const existing = await listStudents();
  const existingKeys = new Set(existing.map((s) => dedupeKey(s)));
  const toAdd = [];
  let skipped = 0;

  for (const row of rows) {
    const key = dedupeKey(row);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    toAdd.push(row);
    existingKeys.add(key);
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('students').insert(toAdd);
    if (error) throw error;
  }

  return { added: toAdd.length, skipped };
}

export async function updateStudent(id, data) {
  const { data: rows, error } = await supabase.from('students').update(data).eq('id', id).select('id');
  if (error) throw error;
  return assertRows(rows, 'edit this student')[0];
}

export async function deleteStudent(id) {
  // payments/attendance reference students(id) on delete cascade, so a
  // single delete here removes their related records too.
  const { data: rows, error } = await supabase.from('students').delete().eq('id', id).select('id');
  if (error) throw error;
  assertRows(rows, 'delete this student');
  return true;
}

// ---------- Points ledger ----------
// students.points is now a database-maintained cache (see migrations
// 0019/0020): every award inserts a point_transactions row, and a
// trigger recomputes the cached total from the ledger. The database
// itself revokes UPDATE on students.points from every application role,
// admin included - there is no other way left to change it. `level` must
// match the target student's own level (enforced by a database trigger
// too), so callers pass the student's current level, not an arbitrary one.
export async function awardPoints({ studentId, level, categoryId, categoryKey, points, reason, awardedBy }) {
  const { error } = await supabase.from('point_transactions').insert({
    student_id: studentId,
    level,
    category_id: categoryId ?? null,
    category_key: categoryKey,
    points,
    reason,
    awarded_by: awardedBy,
  });
  if (error) throw error;
}

// Same ledger, same RLS/trigger enforcement per row as awardPoints() above -
// just N rows in one request instead of N requests, for the class/group
// award workflow. Each entry is independently subject to the teacher-level
// RLS check and the level-matches-student trigger, so a batch spanning
// students a caller isn't allowed to award for fails atomically (the whole
// insert rolls back), not partially.
export async function bulkAwardPoints(entries) {
  if (!entries.length) return;
  const { error } = await supabase.from('point_transactions').insert(
    entries.map(({ studentId, level, categoryId, categoryKey, points, reason, awardedBy }) => ({
      student_id: studentId,
      level,
      category_id: categoryId ?? null,
      category_key: categoryKey,
      points,
      reason,
      awarded_by: awardedBy,
    }))
  );
  if (error) throw error;
}

// Active categories in display order - id is what makes get_my_point_history()
// resolve the real name/icon instead of falling back to a generic one (see
// migration 0023); category_key alone (the pre-existing quick +/- flow) only
// gets a guessed name via initcap(), never the configured icon.
export async function listPointCategories() {
  const { data, error } = await supabase
    .from('point_categories')
    .select('id, key, name, icon, default_points')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// Which levels (A/B/C) a teacher may award points for (see migration
// 0017) - the database enforces this independently on every insert
// (RLS + a BEFORE INSERT trigger, see 0019), so this is only for
// deciding what the UI shows, not the actual security boundary.
export async function listMyTeacherLevels(teacherId) {
  const { data, error } = await supabase.from('teacher_group_assignments').select('level').eq('teacher_id', teacherId);
  if (error) throw error;
  return (data || []).map((r) => r.level);
}

// Admin-only: every teacher account, so the assignment UI can show
// teachers with zero levels assigned too, not just ones already assigned.
export async function listTeachers() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'teacher').order('full_name');
  if (error) throw error;
  return data;
}

// Admin-only: every teacher's level assignments, combined client-side
// with listTeachers() so the UI can show teachers with zero levels too.
export async function listTeacherGroupAssignments() {
  const { data, error } = await supabase.from('teacher_group_assignments').select('id, teacher_id, level').order('level');
  if (error) throw error;
  return data;
}

export async function addTeacherGroupAssignment(teacherId, level) {
  const { error } = await supabase.from('teacher_group_assignments').insert({ teacher_id: teacherId, level });
  if (error) throw error;
}

export async function removeTeacherGroupAssignment(id) {
  const { error } = await supabase.from('teacher_group_assignments').delete().eq('id', id);
  if (error) throw error;
}

// The student's own ledger, newest first - category name/icon already
// resolved server-side (see migration 0023) since a student's RLS-scoped
// reads can't join point_categories themselves.
export async function getMyPointHistory() {
  const { data, error } = await supabase.rpc('get_my_point_history');
  if (error) throw error;
  return data;
}

// Finalized (not superseded) recognition awards for one student - the
// table is readable by any signed-in user (see migration 0022), so this
// is a plain filtered select rather than an RPC.
export async function getRecognitionAwards(studentId) {
  const { data, error } = await supabase
    .from('recognition_awards')
    .select('id, award_type, level, period_type, period_start, period_end, points, is_co_winner')
    .eq('student_id', studentId)
    .eq('status', 'final')
    .order('period_start', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- Recognition (admin Student of the Week/Month workflow) ----------
// See migration 0025. week_bounds()/month_bounds() (0023) stay the single
// source of truth for what a "week"/"month" is - the client never computes
// period boundaries itself, only navigates by passing a reference_date
// derived from a period_start/period_end it already received back.
export async function getPeriodBounds(periodType, referenceDate = null) {
  const { data, error } = await supabase.rpc('get_period_bounds', {
    p_period_type: periodType,
    p_reference_date: referenceDate,
  });
  if (error) throw error;
  return data[0];
}

// Same recognition_awards table as getRecognitionAwards() above, just
// every student's finalized rows instead of one - for the admin
// Recognition History list, not the student portal.
// Every status (final/superseded/revoked), not just final - Recognition
// History (admin) shows the whole correction trail, not just the current
// state. Callers that only want the current winner per level/period
// filter client-side (status === 'final'), same as MyRanking's student-
// facing getRecognitionAwards() already does server-side for its own,
// narrower purpose.
export async function listRecognitionAwards() {
  const { data, error } = await supabase
    .from('recognition_awards')
    .select('id, award_type, level, period_type, period_start, period_end, student_id, points, certificate_id, status, superseded_at, computed_at')
    .order('computed_at', { ascending: false });
  if (error) throw error;
  return data;
}

// The only write path into recognition_awards (see migration 0025's RLS
// note) - a plain client insert would be rejected, this is a
// SECURITY DEFINER RPC that recomputes the student's period points from
// the ledger itself (never trusts a client-supplied value), then inserts
// the recognition_awards row and issues the certificate in one
// transaction.
export async function finalizeRecognitionWinner({ awardType, level, periodType, periodStart, periodEnd, studentId, reason }) {
  const { data, error } = await supabase.rpc('finalize_recognition_winner', {
    p_award_type: awardType,
    p_level: level,
    p_period_type: periodType,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_student_id: studentId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data[0];
}

// Cancels a final recognition award outright (no replacement winner) -
// see migration 0027. Deletes the certificate it held and marks the row
// 'revoked' rather than deleting it, so recognition_reopen_log's audit
// trail always has a row to point back to.
export async function revokeRecognitionAward(recognitionId, reason) {
  const { error } = await supabase.rpc('revoke_recognition_award', {
    p_recognition_id: recognitionId,
    p_reason: reason,
  });
  if (error) throw error;
}

// ---------- Payments ----------

export async function listPayments() {
  const { data, error } = await supabase.from('payments').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function setPaymentStatus(studentId, year, month, paid) {
  const paid_date = paid ? new Date().toISOString().slice(0, 10) : null;
  const { error } = await supabase
    .from('payments')
    .upsert(
      { student_id: studentId, year, month, paid, paid_date },
      { onConflict: 'student_id,year,month' }
    );
  if (error) throw error;
  return listPayments();
}

// ---------- Attendance ----------

export async function listAttendance() {
  const { data, error } = await supabase.from('attendance').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function setAttendanceStatus(studentId, date, status) {
  const { data: existing, error: fetchError } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .eq('date', date)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing && existing.status === status) {
    // Tapping the same status again clears the record.
    const { error } = await supabase.from('attendance').delete().eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('attendance')
      .upsert(
        { student_id: studentId, date, status },
        { onConflict: 'student_id,date' }
      );
    if (error) throw error;
  }

  return listAttendance();
}

// ---------- Backup / restore ----------

export async function exportAllData() {
  const [students, payments, attendance] = await Promise.all([
    listStudents(),
    listPayments(),
    listAttendance(),
  ]);
  return { exported_at: new Date().toISOString(), students, payments, attendance };
}

export async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');

  // Deleting students cascades to payments/attendance automatically.
  const { error: clearError } = await supabase.from('students').delete().not('id', 'is', null);
  if (clearError) throw clearError;

  if (Array.isArray(data.students) && data.students.length > 0) {
    const { error } = await supabase.from('students').insert(data.students);
    if (error) throw error;
  }
  if (Array.isArray(data.payments) && data.payments.length > 0) {
    const { error } = await supabase.from('payments').insert(data.payments);
    if (error) throw error;
  }
  if (Array.isArray(data.attendance) && data.attendance.length > 0) {
    const { error } = await supabase.from('attendance').insert(data.attendance);
    if (error) throw error;
  }

  // Restoring inserts explicit id values, which bypasses (and desyncs) the
  // identity sequences - resync them or every future insert eventually
  // collides with an id from this restore.
  const { error: resyncError } = await supabase.rpc('resync_sequences');
  if (resyncError) throw resyncError;

  return true;
}

export const STORAGE_KEYS = { students: 'students', payments: 'payments', attendance: 'attendance' };

// ---------- Lessons ----------

export async function listLessons() {
  const { data, error } = await supabase.from('lessons').select('*').order('scheduled_at');
  if (error) throw error;
  return data;
}

export async function createLesson(data) {
  const { data: record, error } = await supabase.from('lessons').insert(data).select().single();
  if (error) throw error;
  return record;
}

export async function updateLesson(id, data) {
  const { data: rows, error } = await supabase.from('lessons').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this lesson')[0];
}

export async function deleteLesson(id) {
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function listLessonAttendance() {
  const { data, error } = await supabase.from('lesson_attendance').select('*');
  if (error) throw error;
  return data;
}

export async function setLessonAttendance(lessonId, studentId, status) {
  const { error } = await supabase
    .from('lesson_attendance')
    .upsert({ lesson_id: lessonId, student_id: studentId, status }, { onConflict: 'lesson_id,student_id' });
  if (error) throw error;
  return listLessonAttendance();
}

// ---------- Exams ----------

export async function listExams() {
  const { data, error } = await supabase.from('exams').select('*').order('exam_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createExam(data) {
  const { data: record, error } = await supabase.from('exams').insert(data).select().single();
  if (error) throw error;
  return record;
}

export async function updateExam(id, data) {
  const { data: rows, error } = await supabase.from('exams').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this exam')[0];
}

export async function deleteExam(id) {
  const { data: rows, error } = await supabase.from('exams').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this exam');
  return true;
}

export async function listExamScores() {
  const { data, error } = await supabase.from('exam_scores').select('*');
  if (error) throw error;
  return data;
}

export async function setExamScore(examId, studentId, score) {
  const { error } = await supabase
    .from('exam_scores')
    .upsert({ exam_id: examId, student_id: studentId, score }, { onConflict: 'exam_id,student_id' });
  if (error) throw error;
  return listExamScores();
}

// Student self-submission (see migration 0009) - only reaches the database
// while the row is still ungraded; upsert only touches the columns listed
// here, so it never disturbs a score a teacher has already entered.
export async function submitExamAnswer(examId, studentId, { fileUrl, fileName }) {
  const { error } = await supabase.from('exam_scores').upsert(
    {
      exam_id: examId,
      student_id: studentId,
      answer_file_url: fileUrl,
      answer_file_name: fileName,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: 'exam_id,student_id' }
  );
  if (error) throw error;
  return listExamScores();
}

// ---------- Homework ----------

export async function listHomework() {
  const { data, error } = await supabase.from('homework').select('*').order('due_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createHomework(data) {
  const { data: record, error } = await supabase.from('homework').insert(data).select().single();
  if (error) throw error;
  return record;
}

export async function updateHomework(id, data) {
  const { data: rows, error } = await supabase.from('homework').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this homework')[0];
}

export async function deleteHomework(id) {
  const { data: rows, error } = await supabase.from('homework').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this homework');
  return true;
}

export async function listHomeworkStatus() {
  const { data, error } = await supabase.from('homework_status').select('*');
  if (error) throw error;
  return data;
}

export async function setHomeworkStatus(homeworkId, studentId, status, score = null, feedback = null) {
  const { error } = await supabase
    .from('homework_status')
    .upsert(
      { homework_id: homeworkId, student_id: studentId, status, score, feedback },
      { onConflict: 'homework_id,student_id' }
    );
  if (error) throw error;
  return listHomeworkStatus();
}

// Student self-submission (see migration 0009) - same protection as
// submitExamAnswer: blocked by RLS the moment status is 'Graded'.
export async function submitHomeworkAnswer(homeworkId, studentId, { fileUrl, fileName }) {
  const { error } = await supabase.from('homework_status').upsert(
    {
      homework_id: homeworkId,
      student_id: studentId,
      status: 'Submitted',
      answer_file_url: fileUrl,
      answer_file_name: fileName,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: 'homework_id,student_id' }
  );
  if (error) throw error;
  return listHomeworkStatus();
}

// ---------- Certificates ----------

export async function listCertificates() {
  const { data, error } = await supabase.from('certificates').select('*').order('issued_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function issueCertificate(studentId, title, issuedDate) {
  const { data: record, error } = await supabase
    .from('certificates')
    .insert({ student_id: studentId, title, ...(issuedDate ? { issued_date: issuedDate } : {}) })
    .select()
    .single();
  if (error) throw error;
  return record;
}

export async function updateCertificate(id, data) {
  const { data: rows, error } = await supabase.from('certificates').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this certificate')[0];
}

export async function deleteCertificate(id) {
  const { data: rows, error } = await supabase.from('certificates').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this certificate');
  return true;
}

// ---------- Leaderboard ----------
// Server-computed (see migration 0006) - a student's own RLS-scoped reads
// don't include enough data to rank themselves against classmates
// client-side, unlike admin/teacher who already have full access.

export async function getLeaderboard() {
  const { data, error } = await supabase.rpc('get_leaderboard');
  if (error) throw error;
  return data;
}

// Level + period-scoped leaderboard (see migration 0023) - rank_change vs.
// the prior equivalent period and attendance_rate are null for 'all_time'
// (there's no "previous all-time" to compare against). periodStart is only
// meaningful for week/month; omit it to mean "the period containing today".
export async function getGroupLeaderboard(level, periodType, periodStart = null) {
  const { data, error } = await supabase.rpc('get_group_leaderboard', {
    p_level: level,
    p_period_type: periodType,
    p_period_start: periodStart,
  });
  if (error) throw error;
  return data;
}

// ---------- File uploads ----------
// One shared private bucket for every attachment (chat, exam/homework
// files and answers, the certificate template) - see migration 0009. The
// bucket is private, so callers resolve a short-lived signed URL to
// actually view/download a file rather than storing a permanent public
// link; the *_file_url columns hold the storage path, not a real URL.

const ATTACHMENTS_BUCKET = 'attachments';

export async function uploadAttachment(file, folder) {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
  if (error) throw error;
  return { path, name: file.name, type: file.type || null };
}

export async function getAttachmentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- Messages ----------
// RLS (see migration 0009, can_send_message/can_read_message) is the real
// gate on who can send or see what - these functions don't re-check role
// rules client-side, they just reflect whatever the database allows.

export async function listMessages() {
  const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function sendMessage(data) {
  const { data: record, error } = await supabase.from('messages').insert(data).select().single();
  if (error) throw error;
  return record;
}

export async function deleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function listMessageReads() {
  const { data, error } = await supabase.from('message_reads').select('*');
  if (error) throw error;
  return data;
}

export async function markMessageRead(messageId, profileId) {
  const { error } = await supabase
    .from('message_reads')
    .upsert({ message_id: messageId, profile_id: profileId }, { onConflict: 'message_id,profile_id' });
  if (error) throw error;
}

// ---------- Certificate templates (one row per certificate type) ----------
// See migration 0026 - replaces a single global template with one row per
// key ('default', 'student_of_week', 'student_of_month', ...), so
// different award types can each have their own background image instead
// of fighting over one shared slot.

export async function listCertificateTemplates() {
  const { data, error } = await supabase.from('certificate_templates').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function setCertificateTemplate(key, { file_url, file_name, show_title_overlay }) {
  const patch = { updated_at: new Date().toISOString() };
  if (file_url !== undefined) patch.file_url = file_url;
  if (file_name !== undefined) patch.file_name = file_name;
  if (show_title_overlay !== undefined) patch.show_title_overlay = show_title_overlay;
  const { data: rows, error } = await supabase.from('certificate_templates').update(patch).eq('key', key).select();
  if (error) throw error;
  return assertRows(rows, 'update this certificate template')[0];
}

// ---------- File library (Phase 10: centralized file manager) ----------
// Admin/teacher only - see migration 0010. Files live in the same shared
// 'attachments' Storage bucket as everything else (uploadAttachment /
// getAttachmentUrl from earlier in this file), just under a 'library/'
// path prefix.

export async function listFiles() {
  const { data, error } = await supabase.from('files').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createFileRecord(data) {
  const { data: record, error } = await supabase.from('files').insert(data).select().single();
  if (error) throw error;
  return record;
}

export async function updateFileRecord(id, data) {
  const { data: rows, error } = await supabase.from('files').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this file')[0];
}

export async function deleteFileRecord(id) {
  const { data: rows, error } = await supabase.from('files').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this file');
  return true;
}
