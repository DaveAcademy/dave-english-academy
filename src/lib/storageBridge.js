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
//
// Returns the inserted row's id so a caller can offer an Undo that writes a
// real reversal row (is_reversal + reversed_transaction_id pointing back at
// this one) instead of an untraceable second penalty. A reversal row is the
// only correction the database permits: point_transactions has no UPDATE or
// DELETE policy for any role, admin included (0019).
export async function awardPoints({
  studentId,
  level,
  categoryId,
  categoryKey,
  points,
  reason,
  awardedBy,
  isReversal = false,
  reversedTransactionId = null,
  classSessionId = null,
}) {
  const { data, error } = await supabase
    .from('point_transactions')
    .insert({
      student_id: studentId,
      level,
      category_id: categoryId ?? null,
      category_key: categoryKey,
      points,
      reason,
      awarded_by: awardedBy,
      is_reversal: isReversal,
      reversed_transaction_id: reversedTransactionId,
      class_session_id: classSessionId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
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
    entries.map(
      ({
        studentId,
        level,
        categoryId,
        categoryKey,
        points,
        reason,
        awardedBy,
        classSessionId,
        isReversal = false,
        reversedTransactionId = null,
      }) => ({
        student_id: studentId,
        level,
        category_id: categoryId ?? null,
        category_key: categoryKey,
        points,
        reason,
        awarded_by: awardedBy,
        class_session_id: classSessionId ?? null,
        is_reversal: isReversal,
        reversed_transaction_id: reversedTransactionId,
      })
    )
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Ranking V2: class_group / class_session (migrations 0137-0138).
// Session identity is the teaching group, never the awarding teacher -
// see docs/ranking-v2-class-session-design.md. A session must be
// explicitly opened; nothing here infers one from a point award.

// Groups a level/teacher is actually allowed to see, per the same RLS
// (class_group_teacher_all / class_group_admin_all, migration 0137) that
// governs every other read here - this is just what that RLS returns for
// the given level, no separate authorization logic on the client.
export async function listClassGroups(level) {
  const { data, error } = await supabase
    .from('class_group')
    .select('id, level, name, active')
    .eq('level', level)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

// Does a session already exist for this group/date? Read-only lookup so
// the UI can show "session already open" before the teacher tries to
// open one, without relying on catching an insert error for that case.
export async function getClassSession(classGroupId, sessionDate) {
  const { data, error } = await supabase
    .from('class_session')
    .select('id, class_group_id, session_date, opened_by')
    .eq('class_group_id', classGroupId)
    .eq('session_date', sessionDate)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Opens a session for (classGroupId, sessionDate), or returns the one
// that's already open - idempotent by construction via the
// UNIQUE(class_group_id, session_date) constraint (migration 0137), not
// by a client-side check-then-insert race. Insert first; on a unique
// violation (23505), the session was opened concurrently (or already
// existed), so fetch and return that row instead of surfacing an error.
// Authorization is enforced by class_session RLS the same as every other
// write in this app - this function adds no security logic of its own.
export async function openClassSession({ classGroupId, sessionDate, openedBy }) {
  const { data, error } = await supabase
    .from('class_session')
    .insert({ class_group_id: classGroupId, session_date: sessionDate, opened_by: openedBy })
    .select('id, class_group_id, session_date, opened_by')
    .single();
  if (!error) return data;
  if (error.code === '23505') {
    const existing = await getClassSession(classGroupId, sessionDate);
    if (existing) return existing;
  }
  throw error;
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

// ---------- Achievements ----------
// Read-only: achievements are awarded exclusively by the production
// evaluate_achievements() DB function (migrations 0105-0110), triggered
// off student_lesson_progress/lesson_work_submissions/attendance. Nothing
// here writes to achievement_definitions or student_achievements - the
// existing RLS (achievement_definitions_read_active, student_achievements
// _self_select/_teacher_select/_admin_all) is what actually enforces who
// can see what, same as getRecognitionAwards() above.

// All active achievement definitions - the full catalog, used to compute
// which ones a student hasn't earned yet (locked list) alongside earned().
export async function listAchievementDefinitions() {
  const { data, error } = await supabase
    .from('achievement_definitions')
    .select('id, key, name, description, icon, category, rarity, bonus_points, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// One student's earned achievements, newest first. Works for the
// student's own id (self_select) or, for a teacher/admin, any student in
// their scope (teacher_select/admin_all) - same call either way, RLS
// decides what rows come back.
export async function getStudentAchievements(studentId) {
  const { data, error } = await supabase
    .from('student_achievements')
    .select('earned_at, bonus_transaction:point_transaction_id(points), achievement:achievement_id(key, name, description, icon, category, rarity, bonus_points)')
    .eq('student_id', studentId)
    .order('earned_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- Badge Consolidation (frontend -> backend migration) ----------
// The DB-backed achievement engine (achievement_definitions/student_achievements)
// is now the single source of truth for badges. The frontend-only computeBadges()
// function in src/utils/badges.js is deprecated and kept only for backward
// compatibility during transition. All frontend components should now fetch
// real achievement data from getStudentAchievements() and achievement definitions
// from listAchievementDefinitions() instead of using computeBadges().
//
// The following functions provide legacy computeBadges compatibility while
// transitioning to real backend data.
export async function getStudentBadges(studentId) {
  const { data, error } = await supabase
    .from('student_achievements')
    .select('achievement:achievement_id(key, name, description, icon, category, rarity)')
    .eq('student_id', studentId);
  if (error) throw error;

  return data.map(a => a.achievement);
}

// Get all achievement definitions that correspond to frontend badges
export async function getBadgeDefinitions() {
  const { data, error } = await supabase
    .from('achievement_definitions')
    .select('key, name, description, icon, category, rarity, active')
    .eq('active', true)
    .in('category', ['achievement', 'badge', 'milestone']);
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

// Same recognition_awards table as getRecognitionAwards() above, but every
// student/status instead of one student's finalized rows - powers the
// admin Recognition page's "is this level's current period already
// finalized" check (Recognition.jsx), not the student portal.
// Every status (final/superseded/revoked), not just final, so the caller
// can filter client-side to just the current winner per level/period
// (status === 'final') - same as MyRanking's student-facing
// getRecognitionAwards() already does server-side for its own, narrower
// purpose.
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
// public.payments is the legacy boolean-per-month table. Its write path
// (setPaymentStatus) was removed once Payments.jsx's grid moved to the
// ledger below. Only legitimate remaining consumer is backup export/
// restore (migration 0066 documents this on the table itself) - do not
// wire this into any new feature.

export async function listLegacyPaymentsForBackup() {
  const { data, error } = await supabase.from('payments').select('*').order('id');
  if (error) throw error;
  return data;
}

// ---------- Payment ledger (migrations 0054-0060) ----------
// Reads/writes public.payment_transactions and the derivation functions
// built on top of it. This is now the only write path for payments -
// Payments.jsx records everything through recordPayment() below.

// Mirrors the check constraints on payment_transactions (migration 0054) -
// kept here, next to the function that writes them, rather than
// duplicated in every page that needs the list.
export const TRANSACTION_TYPES = ['first_partial', 'monthly', 'advance', 'extra'];
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'click', 'payme', 'other'];

// Source of truth for a single student's status - never compute this
// client-side from raw transactions, the derivation (rolling balance,
// billing-period math) lives entirely in the get_student_payment_status
// function (migration 0055) so there is exactly one implementation of it.
export async function getStudentPaymentStatus(studentId) {
  const { data, error } = await supabase.rpc('get_student_payment_status', { p_student_id: studentId });
  if (error) throw error;
  return data[0];
}

export async function getPaymentTimeline(studentId) {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('student_id', studentId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return data;
}

// createdBy is passed in by the caller (the logged-in admin's profile id
// from useAuth), same pattern as awardedBy above for point_transactions -
// not read from a session on this side of the call.
export async function recordPayment({
  studentId,
  amount,
  transactionType,
  createdBy,
  paymentMethod = null,
  coversPeriodStart = null,
  coversPeriodEnd = null,
  paidAt = null,
  referenceNumber = null,
  notes = null,
}) {
  const { data, error } = await supabase
    .from('payment_transactions')
    .insert({
      student_id: studentId,
      amount,
      transaction_type: transactionType,
      payment_method: paymentMethod,
      covers_period_start: coversPeriodStart,
      covers_period_end: coversPeriodEnd,
      paid_at: paidAt || new Date().toISOString(),
      reference_number: referenceNumber,
      notes,
      created_by: createdBy,
      source: 'manual',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Reversal row for a mistaken payment - never edits/deletes the original,
// same append-only pattern as every correction done manually via migration
// (0064, 0070, 0073-0075/0079). amount must be negative; the DB check
// constraint (0064) enforces this independent of client-side validation.
export async function createCorrection({ studentId, amount, originalTransactionId, reason, createdBy }) {
  if (amount >= 0) throw new Error('Correction amount must be negative.');
  const { data, error } = await supabase
    .from('payment_transactions')
    .insert({
      student_id: studentId,
      amount,
      transaction_type: 'correction',
      paid_at: new Date().toISOString(),
      reference_number: originalTransactionId ? String(originalTransactionId) : null,
      notes: reason,
      created_by: createdBy,
      source: 'manual',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cash-flow total for one calendar month - Dashboard.jsx's collection-rate
// KPI and 6-month income trend. See migration 0065 for why this is a
// separate concept from get_student_payment_status's coverage logic.
export async function getMonthlyPaymentCollection(year, month) {
  const { data, error } = await supabase.rpc('get_monthly_payment_collection', { p_year: year, p_month: month });
  if (error) throw error;
  return data[0];
}

// Row-level detail for an admin date range - Reports.jsx's Payment
// Collection Report.
export async function getPaymentCollectionSummary(from, to) {
  const { data, error } = await supabase.rpc('get_payment_collection_summary', { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

// Activity Feed (migration 0099) - single RPC that UNIONs the recent
// events already sitting in existing tables (students/payments/attendance/
// homework/exams/certificates/lesson progress/recognition), newest first.
// Admin Dashboard's only query for this feature - no per-event-type calls.
export async function getActivityFeed(limit = 30) {
  const { data, error } = await supabase.rpc('get_activity_feed', { p_limit: limit });
  if (error) throw error;
  return data;
}

// Reminder-preparation layer (migration 0067) - who would get a payment
// reminder right now, and what it would say. No messaging attached yet;
// this exists so wording/timing/exclusions can be checked against real
// data before anything is wired to actually send.
export async function getPaymentReminderCandidates() {
  const { data, error } = await supabase.rpc('get_payment_reminder_candidates');
  if (error) throw error;
  return data;
}

// Test mode only - always routes to the admin's own Telegram
// (TELEGRAM_TEST_CHAT_ID on the edge function), never the student, and
// never writes a payment_reminders row.
export async function sendTestReminder(studentId) {
  const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
    body: { student_id: studentId, test: true },
  });
  if (error) throw error;
  return data;
}

// Real send - one Telegram message per student id, delivered to that
// student's own telegram_chat_id. Only call this after the admin has
// explicitly confirmed the recipient list (see Reminders.jsx's
// confirmation modal) - there is no further confirmation step past this
// call. Returns { success, results: [{ student_id, status, ... }] }.
export async function sendPaymentReminders(studentIds) {
  const { data, error } = await supabase.functions.invoke('send-payment-reminder', {
    body: { student_ids: studentIds },
  });
  if (error) throw error;
  return data;
}

// Full attempt log (migration 0086) - sent AND failed rows, independent
// of a student's current candidate status. Filtered client-side in
// Reminders.jsx (same pattern as Reports.jsx) since the table is small.
export async function getPaymentReminderHistory() {
  const { data, error } = await supabase
    .from('payment_reminders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Resolves payment_reminders.sent_by (a profile id) to a display name -
// profiles_select_admin_all (migration 0003) already lets an admin read
// every profile, so this is a plain select, no new RPC/policy needed.
export async function getAdminProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'administrator');
  if (error) throw error;
  return data;
}

// Admin-only visibility into the data-quality issues the 0057 backfill
// surfaced (payments before join_date, zero fees, large advance credit) -
// see migration 0059's comments. Read-only, changes nothing.
export async function getPaymentDataAudit() {
  const { data, error } = await supabase.rpc('payment_data_audit');
  if (error) throw error;
  return data;
}

// ---------- Attendance ----------

export async function listAttendance() {
  const { data, error } = await supabase.from('attendance').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function setAttendanceStatus(studentId, date, status) {
  // Check existing before deciding to toggle or upsert.
  // This fixes the previous bug where every upsert was immediately deleted
  // because data.status always equaled the requested status after upsert.
  const { data: existing, error: selError } = await supabase
    .from('attendance')
    .select('id,status')
    .eq('student_id', studentId)
    .eq('date', date)
    .maybeSingle();
  if (selError) throw selError;

  if (existing && existing.status === status) {
    // Toggle off: same status clicked again — delete the record.
    const { error: delError } = await supabase
      .from('attendance')
      .delete()
      .eq('id', existing.id);
    if (delError) throw delError;
    return { deleted: true, studentId, date };
  }

  // Otherwise upsert the new/changed status.
  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { student_id: studentId, date, status },
      { onConflict: 'student_id,date' }
    )
    .select()
    .single();
  if (error) throw error;
  return { row: data, studentId, date };
}

// ---------- Backup / restore ----------

export async function exportAllData() {
  const [students, payments, attendance] = await Promise.all([
    listStudents(),
    listLegacyPaymentsForBackup(),
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
  const { data, error } = await supabase
    .from('lessons')
    .select('*, curriculum_lessons(lesson_number, title, month, lesson_type, description), lesson_vocabulary(count)')
    .order('scheduled_at');
  if (error) throw error;
  return data.map((l) => ({ ...l, vocabulary_count: l.lesson_vocabulary?.[0]?.count ?? 0 }));
}

// Full curriculum, independent of whether a teaching instance (lessons row)
// exists yet - lets the UI show "coming soon" slots for lesson numbers that
// haven't been taught, in permanent curriculum order.
export async function listCurriculumLessons() {
  const { data, error } = await supabase.from('curriculum_lessons').select('*').order('lesson_number');
  if (error) throw error;
  return data;
}

// Per-level teaching progress (Level A/B/C, always exactly 3 rows). This is
// UI-only state for showing lock badges/messages - the real access control
// is the storage RLS policy on lesson-pdfs (can_read_lesson_pdf), which reads
// this same table server-side.
export async function listCurriculumProgress() {
  const { data, error } = await supabase.from('curriculum_progress').select('*').order('level');
  if (error) throw error;
  return data;
}

export async function advanceCurriculumProgress(level, currentLessonNumber) {
  const { data, error } = await supabase
    .from('curriculum_progress')
    .update({ current_lesson_number: currentLessonNumber, updated_at: new Date().toISOString() })
    .eq('level', level)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Student lesson progress (Lesson Hub V2) ----------

// Per-student completion + PDF page tracking, one row per (student, lesson)
// - see migration 0094. RLS scopes every row to its owner, so passing the
// caller's own student id is both a convenience and the security boundary.
export async function listStudentLessonProgress(studentId) {
  const { data, error } = await supabase
    .from('student_lesson_progress')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
}

// All lesson-progress rows across every student (Lesson Progress report) -
// only reachable by admins/teachers, whose RLS policies on
// student_lesson_progress grant full select (migration 0094).
export async function listAllStudentLessonProgress() {
  const { data, error } = await supabase.from('student_lesson_progress').select('*');
  if (error) throw error;
  return data;
}

// Admin-only login timestamps per active student (migration 0102) - the
// frontend never queries auth.users directly.
export async function listStudentLoginInfo() {
  const { data, error } = await supabase.rpc('get_student_login_info');
  if (error) throw error;
  return data;
}

// Upsert on (student_id, lesson_id). data is a partial upsert - e.g.
// { status: 'completed', completed_at: ... } or { last_page: 7 } - missing
// columns keep their defaults/existing values. Returns the merged row.
export async function setStudentLessonProgress(studentId, lessonId, patch) {
  const { data, error } = await supabase
    .from('student_lesson_progress')
    .upsert({ student_id: studentId, lesson_id: lessonId, ...patch, updated_at: new Date().toISOString() }, {
      onConflict: 'student_id,lesson_id',
    })
    .select()
    .single();
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

export async function setExamScore(examId, studentId, score, feedback = null) {
  const { error } = await supabase
    .from('exam_scores')
    .upsert({ exam_id: examId, student_id: studentId, score, feedback }, { onConflict: 'exam_id,student_id' });
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

// ---------- Homework submission files (H4, multi-image) ----------

export async function listHomeworkSubmissionFiles() {
  const { data, error } = await supabase.from('homework_submission_files').select('*').order('position', { ascending: true });
  if (error) throw error;
  return data;
}

// Inserted one row at a time by the caller (see useAcademyData.js) rather
// than as a single batch insert - the 5-file cap is enforced by RLS via a
// COUNT subquery, which only sees rows already committed at the start of
// each statement. A single multi-row INSERT would let all rows in that
// one statement see the same pre-insert count and all pass, defeating
// the cap; sequential single-row inserts each see the previous one.
export async function addHomeworkSubmissionFile(homeworkId, studentId, { fileUrl, fileName, fileType, position }) {
  const { data, error } = await supabase
    .from('homework_submission_files')
    .insert({ homework_id: homeworkId, student_id: studentId, file_url: fileUrl, file_name: fileName, file_type: fileType, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHomeworkSubmissionFile(id) {
  const { data, error } = await supabase.from('homework_submission_files').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(data, 'remove this file');
  return true;
}

// Marks a homework as submitted without touching the legacy
// answer_file_url/answer_file_name columns - those stay null for every
// H4-era (multi-image) submission. Only status/submitted_at are set, so
// an existing score/feedback (there shouldn't be one - RLS already
// blocks this call once graded) is never disturbed.
export async function markHomeworkSubmitted(homeworkId, studentId) {
  const { error } = await supabase.from('homework_status').upsert(
    { homework_id: homeworkId, student_id: studentId, status: 'Submitted', submitted_at: new Date().toISOString() },
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
//
// get_leaderboard() (0008) - the academy-wide, unscoped equivalent this
// once called - was removed in 0128: every page that used it (Dashboard,
// My Ranking, My Progress) was already migrated to the level-scoped RPC
// below, so it had zero remaining callers (see the Points & Ranking
// Consistency Audit).
//
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

// Single-student week/month/total + per-level-rank snapshot (migration
// 0023) - kept here (not part of the Rankings per-class breakdown work)
// solely because src/pages/portal/MyRanking.jsx already depends on it;
// removing it breaks that file's build. Not otherwise used by anything
// this session added.
export async function getStudentRankingSummary(studentId) {
  const { data, error } = await supabase.rpc('get_student_ranking_summary', { p_student_id: studentId });
  if (error) throw error;
  return data[0];
}

// class_session-backed leaderboards (migration 0139) - deliberately
// separate from getGroupLeaderboard/getStudentRankingSummary above,
// which stay untouched. Only points explicitly attached to a real,
// opened class_session appear here; a period with no session opened
// yet returns an empty array, not a zero-filled roster - see the
// migration's own comments for why that's intentional.
export async function getClassLeaderboard(classSessionId) {
  const { data, error } = await supabase.rpc('get_class_leaderboard', { p_class_session_id: classSessionId });
  if (error) throw error;
  return data;
}

export async function getWeeklyClassLeaderboard(classGroupId, weekStart = null) {
  const { data, error } = await supabase.rpc('get_weekly_class_leaderboard', {
    p_class_group_id: classGroupId,
    p_week_start: weekStart,
  });
  if (error) throw error;
  return data;
}

export async function getMonthlyClassLeaderboard(classGroupId, monthStart = null) {
  const { data, error } = await supabase.rpc('get_monthly_class_leaderboard', {
    p_class_group_id: classGroupId,
    p_month_start: monthStart,
  });
  if (error) throw error;
  return data;
}

// Per-class breakdown for the Rankings weekly/monthly view - a raw,
// RLS-scoped select over point_transactions rather than a new RPC: the
// existing table-level policies (pt_admin_select/pt_teacher_select,
// migration 0019) already grant exactly the right rows for this, so a
// wrapper function would just duplicate that check. is_baseline is
// always excluded (see 0021/0023) so the one-time legacy total never
// appears as a phantom "class." The caller pivots this into one column
// per distinct lesson_date - there's no separate class-schedule concept
// in the schema, so the ledger's own lesson_date values are the only
// source of truth for "which dates had a class."
// Which students already have a Class Score recorded for this session -
// same RLS-scoped raw select as listClassPointTransactions() above, just
// filtered to one session + category_key instead of a level/date range.
// Lets the Class Score UI show already-recorded scores instead of blank
// inputs when a teacher reopens a session, without a new RPC or relying
// on the DB unique constraint (migration 0164/0166) to surface as a 23505
// after the fact.
// id/is_reversal/reversed_transaction_id added alongside student_id/points
// (additive, existing callers that only read student_id/points are
// unaffected) so the Manual Class Score Entry correction flow can compute
// each student's net score (a correction is a second row, not an update -
// see migration 0172) and reference the row it corrects.
export async function listClassScores(classSessionId) {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('id, student_id, points, is_reversal, reversed_transaction_id')
    .eq('class_session_id', classSessionId)
    .eq('category_key', 'class_score')
    .order('id');
  if (error) throw error;
  return data;
}

// Bulk variant of listClassScores for the monthly schedule view - one
// query for every session in the visible month instead of one per
// session per group. Same table/filter, just parameterized over multiple
// session ids.
export async function listClassScoresForSessions(classSessionIds) {
  if (!classSessionIds.length) return [];
  const { data, error } = await supabase
    .from('point_transactions')
    .select('student_id, class_session_id, points, is_reversal')
    .in('class_session_id', classSessionIds)
    .eq('category_key', 'class_score');
  if (error) throw error;
  return data;
}

// Every class_session for a set of groups within a date range - powers
// the monthly schedule view's per-date status without one getClassSession()
// call per date per group. Same class_session table/RLS as getClassSession()
// above, just a range query instead of a single (group, date) lookup.
export async function listClassSessionsInRange(classGroupIds, startDate, endDate) {
  if (!classGroupIds.length) return [];
  const { data, error } = await supabase
    .from('class_session')
    .select('id, class_group_id, session_date')
    .in('class_group_id', classGroupIds)
    .gte('session_date', startDate)
    .lte('session_date', endDate);
  if (error) throw error;
  return data;
}

export async function listClassPointTransactions(level, startDate, endDate) {
  const { data, error } = await supabase
    .from('point_transactions')
    .select('student_id, lesson_date, points')
    .eq('level', level)
    .eq('is_baseline', false)
    .gte('lesson_date', startDate)
    .lte('lesson_date', endDate);
  if (error) throw error;
  return data;
}

// ---------- Vocabulary (Vocabulary Learning System, Phase 1) ----------
// See migration 0048. Not part of useAcademyData's bulk initial load -
// vocabulary is fetched per-lesson (or once for "All Vocabulary") by the
// pages that need it, same as listFiles()/certificate templates aren't
// preloaded either. RLS (0048) is the real gate on every one of these;
// is_active=false rows are simply invisible to students server-side.

export async function listLessonVocabulary(lessonId) {
  const { data, error } = await supabase
    .from('lesson_vocabulary')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('display_order');
  if (error) throw error;
  return data;
}

// All vocabulary a student can currently see (RLS already scopes this to
// active words in lessons matching their level), joined with each word's
// lesson topic so the "All Vocabulary" page can group/label by lesson
// without N follow-up queries.
export async function listAllVocabulary() {
  const { data, error } = await supabase
    .from('lesson_vocabulary')
    .select('*, lessons(id, topic, level)')
    .order('display_order');
  if (error) throw error;
  return data;
}

// Search across english/uzbek/example - plain ilike, no search index
// (see design note: fine at this scale). Still RLS-scoped, so a student
// only ever searches what they could already see via listAllVocabulary().
export async function searchVocabulary(query) {
  const q = `%${query}%`;
  const { data, error } = await supabase
    .from('lesson_vocabulary')
    .select('*, lessons(id, topic, level)')
    .or(`english.ilike.${q},uzbek.ilike.${q},example.ilike.${q}`)
    .order('display_order');
  if (error) throw error;
  return data;
}

export async function createVocabularyItem(data) {
  const { data: record, error } = await supabase.from('lesson_vocabulary').insert(data).select().single();
  if (error) throw error;
  return record;
}

// Bulk import: one INSERT with every row (PostgREST/Postgres runs a
// multi-row insert as a single statement/transaction - it either all
// succeeds or all rolls back, never a partial batch), instead of one
// request per word.
export async function bulkCreateVocabularyItems(lessonId, items, startOrder = 0) {
  if (!items.length) return [];
  const rows = items.map((item, i) => ({
    lesson_id: lessonId,
    english: item.english,
    uzbek: item.uzbek,
    display_order: startOrder + i,
  }));
  const { data, error } = await supabase.from('lesson_vocabulary').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function updateVocabularyItem(id, data) {
  const { data: rows, error } = await supabase.from('lesson_vocabulary').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this vocabulary word')[0];
}

export async function deleteVocabularyItem(id) {
  const { data: rows, error } = await supabase.from('lesson_vocabulary').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this vocabulary word');
  return true;
}

// Reassigns display_order for every word in a lesson to its index in the
// given ordered id list - the teacher UI always passes the full
// already-reordered list (drag/drop or move up/down), never a partial
// one, so a plain sequential update is enough; no gap-filling needed.
export async function reorderLessonVocabulary(lessonId, orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('lesson_vocabulary').update({ display_order: index }).eq('id', id).eq('lesson_id', lessonId)
    )
  );
  return listLessonVocabulary(lessonId);
}

// ---------- General Dictionary (independent of lessons/level/curriculum -
// see migration 0116). Read-only for students; RLS is the only gate,
// nothing here checks role client-side. Search goes through the unified
// RPC in dictionaryBridge.js (search_dictionary_unified, 0183).

export async function listMyVocabularyFavorites(studentId) {
  const { data, error } = await supabase.from('student_vocabulary_favorites').select('*').eq('student_id', studentId);
  if (error) throw error;
  return data;
}

export async function addVocabularyFavorite(studentId, vocabularyId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .insert({ student_id: studentId, vocabulary_id: vocabularyId });
  if (error) throw error;
}

export async function removeVocabularyFavorite(studentId, vocabularyId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .delete()
    .eq('student_id', studentId)
    .eq('vocabulary_id', vocabularyId);
  if (error) throw error;
}

// ---------- Game Center (Game & Practice System) ----------
// See migrations 0111/0112. Every game shares the same contract: a
// get*Round() call returns only what's needed to render the round (word
// ids + curriculum-scoped content, already readable by the student via
// listAllVocabulary/RLS - see 0112's header comment for why that's not a
// new exposure), and submitGameRound() sends back the student's answers
// for the server to grade against the authoritative vocabulary. Game
// score lives in game_sessions, entirely separate from academy ranking
// points (point_transactions/students.points) - the only path from a
// game round to points is an achievement bonus, awarded by the existing
// evaluate_achievements() engine, not by this code. Adding a new game on
// the frontend means one new get*Round() wrapper here plus a
// submitGameRound(gameType, roundId, answers) call - not a new submit
// function.
//
// Since 0141: every get*Round() RPC now returns a round_id column on
// each row (same value per row - one round token per round, not per
// word). The wrappers below pull it off the first row and strip it out
// of the per-word objects so callers keep working with plain
// { id, english, ... } shapes; submitGameRound() must be given that
// round_id back so the server can enforce single-use submission.

function splitRoundId(data) {
  const roundId = data?.[0]?.round_id ?? null;
  const level = data?.[0]?.level ?? null;
  const words = (data || []).map(({ round_id, level: _level, ...w }) => w);
  return { roundId, level, words };
}

export async function getWordScrambleRound() {
  const { data, error } = await supabase.rpc('get_word_scramble_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getHangmanRound() {
  const { data, error } = await supabase.rpc('get_hangman_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getVocabularyQuizRound() {
  const { data, error } = await supabase.rpc('get_vocabulary_quiz_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getWordMatchRound() {
  const { data, error } = await supabase.rpc('get_word_match_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getSpeedChallengeRound() {
  const { data, error } = await supabase.rpc('get_speed_challenge_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getWordBuilderRound() {
  const { data, error } = await supabase.rpc('get_word_builder_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getListeningChallengeRound() {
  const { data, error } = await supabase.rpc('get_listening_challenge_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getSentenceScrambleRound() {
  const { data, error } = await supabase.rpc('get_sentence_scramble_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getWordDetectiveRound() {
  const { data, error } = await supabase.rpc('get_word_detective_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getPictureQuizRound() {
  const { data, error } = await supabase.rpc('get_picture_quiz_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function getGrammarBattleRound() {
  const { data, error } = await supabase.rpc('get_grammar_battle_round');
  if (error) throw error;
  return splitRoundId(data);
}

export async function submitGameRound(gameType, roundId, answers) {
  const { data, error } = await supabase.rpc('submit_game_round', {
    p_round_id: roundId,
    p_game_type: gameType,
    p_answers: answers,
  });
  if (error) throw error;
  return data;
}

// Leaderboard / Best Records (migration 0147): one batched call returns
// every active student's best score per game, ranked, scoped to the
// caller's own level server-side - no game_type/level params needed.
export async function getGameBestRecords() {
  const { data, error } = await supabase.rpc('get_game_best_records');
  if (error) throw error;
  return data;
}

// Level Progression (migration 0149): a student's own current/best level
// per game, for GameCenter's per-tile level chip. game_level_progress RLS
// already scopes this to is_own_student, no RPC needed.
export async function listMyGameLevels(studentId) {
  const { data, error } = await supabase
    .from('game_level_progress')
    .select('game_type, current_level, best_level_reached')
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
}

// "Highest level reached" leaderboard (migration 0151): a second, separate
// leaderboard dimension alongside getGameBestRecords() - ranks by
// best_level_reached per game_type instead of score, so progression depth
// has its own record independent of the flat per-correct score.
export async function getGameLevelLeaderboard() {
  const { data, error } = await supabase.rpc('get_game_level_leaderboard');
  if (error) throw error;
  return data;
}

// Lifetime Game Points leaderboard, per game (migration 0177) - unbounded,
// replaces getGameBestRecords()'s per-round score (capped at round_size * 10,
// which was ceilinging many students at the same tied score) as the primary
// per-game ranking.
export async function getGamePointsLeaderboard() {
  const { data, error } = await supabase.rpc('get_game_points_leaderboard');
  if (error) throw error;
  return data;
}

// Combined Game Points leaderboard across every game (migration 0177) -
// one overall ranking alongside each game's own board.
export async function getGameOverallPointsLeaderboard() {
  const { data, error } = await supabase.rpc('get_game_points_overall_leaderboard');
  if (error) throw error;
  return data;
}

// Period-filtered Game Points leaderboard across every game (migration 0198) -
// one combined ranking with daily/weekly/monthly/all_time filtering. The
// caller supplies a validated period string; the RPC rejects anything else.
export async function getGamePeriodLeaderboard(period) {
  const { data, error } = await supabase.rpc('get_game_points_period_leaderboard', { p_period: period });
  if (error) throw error;
  return data;
}

// Aggregate for the student's own game badges (computeGameBadges) - one
// self-scoped server-side call (migration 20260829150000) instead of three
// table pulls. Returns { total_points, total_sessions, perfect_sessions,
// max_level, games_played } for the calling student only.
export async function getStudentGameBadgesSummary() {
  const { data, error } = await supabase.rpc('get_student_game_badges_summary');
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

// A student's own recent rounds for a game (best score / history) -
// game_sessions RLS already scopes this to is_own_student, no RPC needed.
export async function listMyGameSessions(studentId, gameType) {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('student_id', studentId)
    .eq('game_type', gameType)
    .order('played_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- Lesson work submissions (Phase 1 foundation) ----------
// Separate from the Homework domain above - keyed directly to lessons.id,
// not a homework assignment. See migration 0103. Student-facing only in
// this phase: no review/points/feedback API yet.

export async function listMyLessonWorkSubmissions(studentId) {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw error;
  return data;
}

// Single-lesson lookup for LessonHub.jsx - avoids pulling every submission
// across every lesson into that page just to find the one row it needs.
export async function getMyLessonWorkSubmission(studentId, lessonId) {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .select('*')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createLessonWorkSubmission(studentId, lessonId) {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .insert({ student_id: studentId, lesson_id: lessonId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listLessonWorkSubmissionFiles(submissionId) {
  const { data, error } = await supabase
    .from('lesson_work_submission_files')
    .select('*')
    .eq('submission_id', submissionId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

// Inserted one row at a time by the caller, same reasoning as
// addHomeworkSubmissionFile: the 5-file cap is enforced by RLS via a
// COUNT subquery that only sees rows already committed at the start of
// each statement, so sequential single-row inserts are required for the
// cap to be race-safe.
export async function addLessonWorkSubmissionFile(submissionId, studentId, { fileUrl, fileName, position }) {
  const { data, error } = await supabase
    .from('lesson_work_submission_files')
    .insert({ submission_id: submissionId, student_id: studentId, file_url: fileUrl, file_name: fileName, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLessonWorkSubmissionFile(id) {
  const { data, error } = await supabase.from('lesson_work_submission_files').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(data, 'remove this file');
  return true;
}

// ---------- Lesson work submissions - teacher review (Phase 2) ----------
// See migration 0104 for the added columns. Points are never written
// directly here - awardLessonWorkPoints() below is the only writer of
// points_awarded/points_transaction_id, and it always goes through the
// existing awardPoints() ledger call (point_transactions), same as every
// other points flow in this app.

// Every submission for one lesson (teacher_all RLS gives full access) -
// the caller combines this with its already-loaded lesson roster to show
// who has/hasn't submitted, same shape as the homework grading roster.
export async function listLessonWorkSubmissionsForLesson(lessonId) {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .select('*')
    .eq('lesson_id', lessonId);
  if (error) throw error;
  return data;
}

// Every submission across every lesson (teacher_all RLS gives full
// access) - used by the admin Homework page to surface "Submit Work"
// submissions alongside the Homework-domain ones in one combined view.
// Read-only aggregation; does not touch the per-lesson review flow.
export async function listAllLessonWorkSubmissions() {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Files for a batch of submissions in one request - the caller passes
// every submission id from listLessonWorkSubmissionsForLesson.
export async function listLessonWorkSubmissionFilesForSubmissions(submissionIds) {
  if (!submissionIds || submissionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_work_submission_files')
    .select('*')
    .in('submission_id', submissionIds)
    .order('position', { ascending: true });
  if (error) throw error;
  return data;
}

// Marks a submission reviewed with feedback only, no points this time
// (e.g. work needs another attempt, or the teacher just wants to leave a
// note). Does not touch points_awarded/points_transaction_id, so points
// can still be awarded afterwards via awardLessonWorkPoints() below.
export async function markLessonWorkReviewed(submissionId, { reviewedBy, feedback = null }) {
  const { data, error } = await supabase
    .from('lesson_work_submissions')
    .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy, feedback })
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Awards points for a lesson work submission through the existing
// point_transactions ledger (calls awardPoints() below, the same function
// every other points flow in this app uses). Duplicate-award-safe: the
// first step is a guarded UPDATE ... WHERE points_awarded IS NULL, which
// Postgres serializes against concurrent requests on the same row, so only
// one concurrent call can ever "claim" a submission before the ledger
// insert happens. If the ledger insert then fails, the claim is rolled
// back so the submission isn't left falsely "awarded".
export async function awardLessonWorkPoints({
  submissionId, studentId, level, points, reason, awardedBy, categoryId, categoryKey, feedback = null,
}) {
  const { data: claimed, error: claimError } = await supabase
    .from('lesson_work_submissions')
    .update({ points_awarded: points })
    .eq('id', submissionId)
    .is('points_awarded', null)
    .select()
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new Error('Points were already awarded for this submission.');

  try {
    const transactionId = await awardPoints({ studentId, level, categoryId, categoryKey, points, reason, awardedBy });
    const { error: finalizeError } = await supabase
      .from('lesson_work_submissions')
      .update({
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: awardedBy,
        feedback,
        points_transaction_id: transactionId,
      })
      .eq('id', submissionId);
    if (finalizeError) throw finalizeError;
    return transactionId;
  } catch (err) {
    await supabase.from('lesson_work_submissions').update({ points_awarded: null }).eq('id', submissionId);
    throw err;
  }
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

// Same storage path as getAttachmentUrl() above, but returns the file bytes as
// a Blob instead of a shareable signed URL - for in-app viewing (PdfViewer)
// where we must not hand out a copyable/bookmarkable link. RLS gates the
// download exactly as it gates the signed-URL fetch (attachments_read /
// can_read_lesson_pdf), so the security boundary is unchanged.
export async function getAttachmentBlob(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(path);
  if (error) throw error;
  return data;
}

// Chat-only: same upload as uploadAttachment() above, but via a raw XHR
// against the Storage REST endpoint (mirroring what supabase-js does
// internally for a Blob body - multipart form with a 'cacheControl'
// field and the file under an empty-string field name) so we get real
// xhr.upload.onprogress events. supabase-js's own upload() has no
// progress callback in this version - this exists only to drive the
// chat composer's upload progress bar, not as a general replacement.
export async function uploadAttachmentWithProgress(file, folder, onProgress) {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', file);

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${ATTACHMENTS_BUCKET}/${path}`);
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network error'));
    xhr.send(form);
  });

  return { path, name: file.name, type: file.type || null };
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

// Only used for messages with more than one attachment - a single
// attachment still goes through the attachment_url/name/type columns on
// messages itself (see migration 0009). See migration 0047.
export async function listMessageAttachments() {
  const { data, error } = await supabase.from('message_attachments').select('*');
  if (error) throw error;
  return data;
}

export async function addMessageAttachments(messageId, attachments) {
  const rows = attachments.map((a, i) => ({ message_id: messageId, url: a.path, name: a.name, type: a.type, position: i }));
  const { data, error } = await supabase.from('message_attachments').insert(rows).select();
  if (error) throw error;
  return data;
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

// ---------- Daily / Weekly Missions & Streaks (0203 + 20260903150000) ----------
// Server-authoritative via get_daily_mission_progress / get_weekly_mission_progress /
// get_current_streak / get_best_streak / get_academy_week_start.
// Asia/Tashkent boundaries are enforced server-side; client never computes dates.

export async function getDailyMissionProgress(studentId) {
  const { data, error } = await supabase.rpc('get_daily_mission_progress', { p_student_id: studentId });
  if (error) throw error;
  return data;
}

export async function getWeeklyMissionProgress(studentId) {
  const { data, error } = await supabase.rpc('get_weekly_mission_progress', { p_student_id: studentId });
  if (error) throw error;
  return data;
}

export async function getAcademyWeekStart() {
  const { data, error } = await supabase.rpc('get_academy_week_start');
  if (error) throw error;
  return data;
}

export async function getCurrentStreak(studentId) {
  const { data, error } = await supabase.rpc('get_current_streak', { p_student_id: studentId });
  if (error) throw error;
  return data;
}

export async function getBestStreak(studentId) {
  const { data, error } = await supabase.rpc('get_best_streak', { p_student_id: studentId });
  if (error) throw error;
  return data;
}

export async function getMyTotalXp() {
  const { data, error } = await supabase.rpc('get_my_total_xp');
  if (error) throw error;
  return data;
}

export async function getMyXpTransactions(limit = 20) {
  const { data, error } = await supabase.rpc('get_my_xp_transactions', { p_limit: limit });
  if (error) throw error;
  return data;
}

export async function getMyXpToday() {
  const { data, error } = await supabase.rpc('get_my_xp_today');
  if (error) throw error;
  return data;
}

// ---------- Pet Collection (Game section) ----------
// See migration 0196. All rewards are server-authoritative — the client
// never supplies part IDs. Auto-grants the active pet on first call.

export async function getActivePetWithParts() {
  const { data, error } = await supabase.rpc('get_active_pet_with_parts');
  if (error) throw error;
  return data;
}

export async function claimPetPart() {
  const { data, error } = await supabase.rpc('claim_pet_part');
  if (error) throw error;
  return data;
}

export async function getPetCheckinStatus() {
  const { data, error } = await supabase.rpc('get_pet_checkin_status');
  if (error) throw error;
  return data;
}
