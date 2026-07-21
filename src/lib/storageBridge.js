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
export async function awardPoints({ studentId, level, categoryKey, points, reason, awardedBy }) {
  const { error } = await supabase.from('point_transactions').insert({
    student_id: studentId,
    level,
    category_key: categoryKey,
    points,
    reason,
    awarded_by: awardedBy,
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

// ---------- Certificate template ----------

export async function getCertificateTemplate() {
  const { data, error } = await supabase.from('certificate_template').select('*').eq('id', true).single();
  if (error) throw error;
  return data;
}

export async function setCertificateTemplate({ file_url, file_name }) {
  const { data: rows, error } = await supabase
    .from('certificate_template')
    .update({ file_url, file_name, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select();
  if (error) throw error;
  return assertRows(rows, 'update the certificate template')[0];
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
