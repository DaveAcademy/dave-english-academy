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

export async function listStudents() {
  const { data, error } = await supabase.from('students').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function createStudent(data) {
  const { data: record, error } = await supabase.from('students').insert(data).select().single();
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
  const { data: rows, error } = await supabase.from('students').update(data).eq('id', id).select();
  if (error) throw error;
  return assertRows(rows, 'edit this student')[0];
}

export async function deleteStudent(id) {
  // payments/attendance reference students(id) on delete cascade, so a
  // single delete here removes their related records too.
  const { data: rows, error } = await supabase.from('students').delete().eq('id', id).select();
  if (error) throw error;
  assertRows(rows, 'delete this student');
  return true;
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
