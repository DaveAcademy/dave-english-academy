// db.js
//
// Every screen in this app talks to the data through the functions in this
// file only - never directly to localStorage. That means when you're ready
// to move to a real online database (Supabase is a good free option), you
// only need to rewrite the functions in this ONE file to call Supabase
// instead of localStorage. Nothing else in the app has to change.
//
// All functions are async and return plain objects/arrays, exactly the
// shape a real database client (like Supabase) would return, so the swap
// later is mechanical rather than a rewrite.

const KEYS = {
  students: 'dea_students',
  payments: 'dea_payments',
  attendance: 'dea_attendance',
};

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Failed to read ${key} from storage`, e);
    return [];
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error(`Failed to save ${key} to storage`, e);
    return false;
  }
}

function nextId(list) {
  const validIds = list.map((item) => Number(item.id)).filter((n) => Number.isFinite(n));
  return validIds.length ? Math.max(...validIds) + 1 : 1;
}

// ---------- Students ----------

export async function listStudents() {
  return readList(KEYS.students);
}

export async function createStudent(data) {
  const list = readList(KEYS.students);
  const record = { ...data, id: nextId(list) };
  writeList(KEYS.students, [...list, record]);
  return record;
}

export async function bulkCreateStudents(rows, { dedupeKey } = {}) {
  const list = readList(KEYS.students);
  const existingKeys = new Set(list.map((s) => dedupeKey(s)));
  let id = nextId(list);
  const toAdd = [];
  let skipped = 0;

  for (const row of rows) {
    const key = dedupeKey(row);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    toAdd.push({ ...row, id: id++ });
    existingKeys.add(key);
  }

  writeList(KEYS.students, [...list, ...toAdd]);
  return { added: toAdd.length, skipped };
}

export async function updateStudent(id, data) {
  const list = readList(KEYS.students);
  const updated = list.map((s) => (s.id === id ? { ...data, id } : s));
  writeList(KEYS.students, updated);
  return updated.find((s) => s.id === id);
}

export async function deleteStudent(id) {
  const list = readList(KEYS.students);
  writeList(KEYS.students, list.filter((s) => s.id !== id));

  // Cascade delete: keep payments/attendance from piling up orphaned rows.
  writeList(KEYS.payments, readList(KEYS.payments).filter((p) => p.student_id !== id));
  writeList(KEYS.attendance, readList(KEYS.attendance).filter((a) => a.student_id !== id));
  return true;
}

// ---------- Payments ----------

export async function listPayments() {
  return readList(KEYS.payments);
}

export async function setPaymentStatus(studentId, year, month, paid) {
  const list = readList(KEYS.payments);
  const existing = list.find((p) => p.student_id === studentId && p.year === year && p.month === month);
  let updated;
  if (existing) {
    updated = list.map((p) =>
      p === existing ? { ...p, paid, paid_date: paid ? new Date().toISOString().slice(0, 10) : null } : p
    );
  } else {
    updated = [
      ...list,
      { id: nextId(list), student_id: studentId, year, month, paid, paid_date: paid ? new Date().toISOString().slice(0, 10) : null },
    ];
  }
  writeList(KEYS.payments, updated);
  return updated;
}

// ---------- Attendance ----------

export async function listAttendance() {
  return readList(KEYS.attendance);
}

export async function setAttendanceStatus(studentId, date, status) {
  const list = readList(KEYS.attendance);
  const existing = list.find((a) => a.student_id === studentId && a.date === date);
  let updated;
  if (existing && existing.status === status) {
    updated = list.filter((a) => a !== existing); // tapping the same status again clears it
  } else if (existing) {
    updated = list.map((a) => (a === existing ? { ...a, status } : a));
  } else {
    updated = [...list, { id: nextId(list), student_id: studentId, date, status }];
  }
  writeList(KEYS.attendance, updated);
  return updated;
}

// ---------- Backup / restore ----------

export async function exportAllData() {
  return {
    exported_at: new Date().toISOString(),
    students: readList(KEYS.students),
    payments: readList(KEYS.payments),
    attendance: readList(KEYS.attendance),
  };
}

export async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file.');
  if (Array.isArray(data.students)) writeList(KEYS.students, data.students);
  if (Array.isArray(data.payments)) writeList(KEYS.payments, data.payments);
  if (Array.isArray(data.attendance)) writeList(KEYS.attendance, data.attendance);
  return true;
}

export const STORAGE_KEYS = KEYS;
