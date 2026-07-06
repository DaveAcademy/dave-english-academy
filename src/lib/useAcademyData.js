// useAcademyData.js
// The single place components go to read or change data. Keeping every
// mutation here (rather than scattered across pages) is what makes the
// eventual Supabase swap mechanical: only db.js and this hook change.

import { useState, useEffect, useCallback } from 'react';
import * as db from '../lib/db';
import { writeAutoBackup } from '../lib/backup';
import { studentDedupeKey } from '../utils/roster';

export function useAcademyData() {
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, p, a] = await Promise.all([db.listStudents(), db.listPayments(), db.listAttendance()]);
        setStudents(s);
        setPayments(p);
        setAttendance(a);
      } catch (e) {
        setError('Could not load your saved data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Best-effort rolling backup after every change - see lib/backup.js.
  const touchBackup = useCallback(() => {
    writeAutoBackup();
  }, []);

  const addStudent = useCallback(
    async (data) => {
      try {
        const record = await db.createStudent(data);
        setStudents((prev) => [...prev, record]);
        touchBackup();
        return record;
      } catch (e) {
        setError('Could not add student. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const editStudent = useCallback(
    async (id, data) => {
      try {
        const record = await db.updateStudent(id, data);
        setStudents((prev) => prev.map((s) => (s.id === id ? record : s)));
        touchBackup();
        return record;
      } catch (e) {
        setError('Could not save changes. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const removeStudent = useCallback(
    async (id) => {
      try {
        await db.deleteStudent(id);
        setStudents((prev) => prev.filter((s) => s.id !== id));
        setPayments((prev) => prev.filter((p) => p.student_id !== id));
        setAttendance((prev) => prev.filter((a) => a.student_id !== id));
        touchBackup();
      } catch (e) {
        setError('Could not delete student. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const importStudents = useCallback(
    async (rows) => {
      try {
        const result = await db.bulkCreateStudents(rows, { dedupeKey: studentDedupeKey });
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        touchBackup();
        return result;
      } catch (e) {
        setError('Import failed. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const togglePayment = useCallback(
    async (studentId, year, month, currentlyPaid) => {
      try {
        const updated = await db.setPaymentStatus(studentId, year, month, !currentlyPaid);
        setPayments(updated);
        touchBackup();
      } catch (e) {
        setError('Could not update payment. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const setAttendanceStatus = useCallback(
    async (studentId, date, status) => {
      try {
        const updated = await db.setAttendanceStatus(studentId, date, status);
        setAttendance(updated);
        touchBackup();
      } catch (e) {
        setError('Could not update attendance. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const reloadAll = useCallback(async () => {
    const [s, p, a] = await Promise.all([db.listStudents(), db.listPayments(), db.listAttendance()]);
    setStudents(s);
    setPayments(p);
    setAttendance(a);
  }, []);

  return {
    students,
    payments,
    attendance,
    loading,
    error,
    setError,
    addStudent,
    editStudent,
    removeStudent,
    importStudents,
    togglePayment,
    setAttendanceStatus,
    reloadAll,
  };
}
