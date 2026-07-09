// useAcademyData.js
// The single place components go to read or change data. Keeping every
// mutation here (rather than scattered across pages) is what makes the
// eventual Supabase swap mechanical: only db.js and this hook change.

import { useState, useEffect, useCallback, useRef } from 'react';
import * as db from '../lib/db';
import { writeAutoBackup } from '../lib/backup';
import { studentDedupeKey } from '../utils/roster';

export function useAcademyData() {
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  // Mirrors of the three state values above, kept current via the effect
  // below, so touchBackup() can read the latest snapshot synchronously
  // without re-fetching from Supabase on every single mutation.
  const stateRef = useRef({ students: [], payments: [], attendance: [] });
  const [lessons, setLessons] = useState([]);
  const [lessonAttendance, setLessonAttendanceState] = useState([]);
  const [exams, setExams] = useState([]);
  const [examScores, setExamScoresState] = useState([]);
  const [homework, setHomework] = useState([]);
  const [homeworkStatus, setHomeworkStatusState] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, p, a, le, la, ex, es, hw, hs, cert] = await Promise.all([
          db.listStudents(),
          db.listPayments(),
          db.listAttendance(),
          db.listLessons(),
          db.listLessonAttendance(),
          db.listExams(),
          db.listExamScores(),
          db.listHomework(),
          db.listHomeworkStatus(),
          db.listCertificates(),
        ]);
        setStudents(s);
        setPayments(p);
        setAttendance(a);
        setLessons(le);
        setLessonAttendanceState(la);
        setExams(ex);
        setExamScoresState(es);
        setHomework(hw);
        setHomeworkStatusState(hs);
        setCertificates(cert);
      } catch (e) {
        setError('Could not load your saved data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    stateRef.current = { students, payments, attendance };
  }, [students, payments, attendance]);

  // Best-effort rolling backup after every change - see lib/backup.js.
  // Reads the ref (not the state variables directly) so this stays a
  // stable useCallback with no dependency array while still picking up
  // whatever the latest values are at call time.
  const touchBackup = useCallback(() => {
    writeAutoBackup(stateRef.current);
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

  const addLesson = useCallback(async (data) => {
    try {
      const record = await db.createLesson(data);
      setLessons((prev) => [...prev, record]);
      return record;
    } catch (e) {
      setError('Could not add lesson. Please try again.');
      throw e;
    }
  }, []);

  const removeLesson = useCallback(async (id) => {
    try {
      await db.deleteLesson(id);
      setLessons((prev) => prev.filter((l) => l.id !== id));
      setLessonAttendanceState((prev) => prev.filter((a) => a.lesson_id !== id));
    } catch (e) {
      setError('Could not delete lesson. Please try again.');
      throw e;
    }
  }, []);

  const markLessonAttendance = useCallback(async (lessonId, studentId, status) => {
    try {
      const updated = await db.setLessonAttendance(lessonId, studentId, status);
      setLessonAttendanceState(updated);
    } catch (e) {
      setError('Could not update lesson attendance. Please try again.');
      throw e;
    }
  }, []);

  const addExam = useCallback(async (data) => {
    try {
      const record = await db.createExam(data);
      setExams((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not add exam. Please try again.');
      throw e;
    }
  }, []);

  const setExamScoreForStudent = useCallback(async (examId, studentId, score) => {
    try {
      const updated = await db.setExamScore(examId, studentId, score);
      setExamScoresState(updated);
    } catch (e) {
      setError('Could not save exam score. Please try again.');
      throw e;
    }
  }, []);

  const addHomework = useCallback(async (data) => {
    try {
      const record = await db.createHomework(data);
      setHomework((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not add homework. Please try again.');
      throw e;
    }
  }, []);

  const setHomeworkStatusForStudent = useCallback(async (homeworkId, studentId, status, score) => {
    try {
      const updated = await db.setHomeworkStatus(homeworkId, studentId, status, score);
      setHomeworkStatusState(updated);
    } catch (e) {
      setError('Could not update homework status. Please try again.');
      throw e;
    }
  }, []);

  const addCertificate = useCallback(async (studentId, title) => {
    try {
      const record = await db.issueCertificate(studentId, title);
      setCertificates((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not issue certificate. Please try again.');
      throw e;
    }
  }, []);

  const reloadAll = useCallback(async () => {
    const [s, p, a, le, la, ex, es, hw, hs, cert] = await Promise.all([
      db.listStudents(),
      db.listPayments(),
      db.listAttendance(),
      db.listLessons(),
      db.listLessonAttendance(),
      db.listExams(),
      db.listExamScores(),
      db.listHomework(),
      db.listHomeworkStatus(),
      db.listCertificates(),
    ]);
    setStudents(s);
    setPayments(p);
    setAttendance(a);
    setLessons(le);
    setLessonAttendanceState(la);
    setExams(ex);
    setExamScoresState(es);
    setHomework(hw);
    setHomeworkStatusState(hs);
    setCertificates(cert);
  }, []);

  return {
    students,
    payments,
    attendance,
    lessons,
    lessonAttendance,
    exams,
    examScores,
    homework,
    homeworkStatus,
    certificates,
    loading,
    error,
    setError,
    addStudent,
    editStudent,
    removeStudent,
    importStudents,
    togglePayment,
    setAttendanceStatus,
    addLesson,
    removeLesson,
    markLessonAttendance,
    addExam,
    setExamScoreForStudent,
    addHomework,
    setHomeworkStatusForStudent,
    addCertificate,
    reloadAll,
  };
}
