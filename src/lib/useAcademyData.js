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
  const [certificateTemplates, setCertificateTemplates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageReads, setMessageReads] = useState([]);
  const [files, setFiles] = useState([]);
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

  // Loaded separately from the block above on purpose: these tables come
  // from later migrations (0009, 0010). If a migration hasn't been
  // applied to a given environment yet, this fetch fails - but it must
  // fail in isolation, not take the whole app down by rejecting the same
  // Promise.all that students/payments/attendance load through.
  useEffect(() => {
    (async () => {
      try {
        const [tmpl, msg, reads, fls] = await Promise.all([
          db.listCertificateTemplates(),
          db.listMessages(),
          db.listMessageReads(),
          db.listFiles(),
        ]);
        setCertificateTemplates(tmpl);
        setMessages(msg);
        setMessageReads(reads);
        setFiles(fls);
      } catch (e) {
        // Messaging/certificate-template/file-library are additive
        // features - leave them at their empty defaults rather than
        // surfacing the shared error banner over the whole app for
        // what's likely just a migration not being applied yet in this
        // environment.
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
        await db.createStudent(data);
        // students_view now enforces its own row/column masking independent
        // of the caller's base-table privileges (see migration 0016) - the
        // insert's own return is scoped to `id` only, so refresh through the
        // view (same pattern importStudents already used) instead of
        // splicing a partial record into state.
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        touchBackup();
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
        await db.updateStudent(id, data);
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        touchBackup();
      } catch (e) {
        setError('Could not save changes. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const awardStudentPoints = useCallback(
    async (params) => {
      try {
        await db.awardPoints(params);
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        touchBackup();
      } catch (e) {
        setError('Could not award points. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

  const bulkAwardStudentPoints = useCallback(
    async (entries) => {
      try {
        await db.bulkAwardPoints(entries);
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        touchBackup();
      } catch (e) {
        setError('Could not award points. Please try again.');
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

  const editLesson = useCallback(async (id, data) => {
    try {
      const record = await db.updateLesson(id, data);
      setLessons((prev) => prev.map((l) => (l.id === id ? record : l)));
      return record;
    } catch (e) {
      setError('Could not save lesson changes. Please try again.');
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

  const editExam = useCallback(async (id, data) => {
    try {
      const record = await db.updateExam(id, data);
      setExams((prev) => prev.map((e) => (e.id === id ? record : e)));
      return record;
    } catch (e) {
      setError('Could not save exam changes. Please try again.');
      throw e;
    }
  }, []);

  const removeExam = useCallback(async (id) => {
    try {
      await db.deleteExam(id);
      setExams((prev) => prev.filter((e) => e.id !== id));
      setExamScoresState((prev) => prev.filter((s) => s.exam_id !== id));
    } catch (e) {
      setError('Could not delete exam. Please try again.');
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

  const submitMyExamAnswer = useCallback(async (examId, studentId, file) => {
    try {
      const updated = await db.submitExamAnswer(examId, studentId, file);
      setExamScoresState(updated);
    } catch (e) {
      setError('Could not submit your answer. Please try again.');
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

  const editHomework = useCallback(async (id, data) => {
    try {
      const record = await db.updateHomework(id, data);
      setHomework((prev) => prev.map((h) => (h.id === id ? record : h)));
      return record;
    } catch (e) {
      setError('Could not save homework changes. Please try again.');
      throw e;
    }
  }, []);

  const removeHomework = useCallback(async (id) => {
    try {
      await db.deleteHomework(id);
      setHomework((prev) => prev.filter((h) => h.id !== id));
      setHomeworkStatusState((prev) => prev.filter((s) => s.homework_id !== id));
    } catch (e) {
      setError('Could not delete homework. Please try again.');
      throw e;
    }
  }, []);

  const setHomeworkStatusForStudent = useCallback(async (homeworkId, studentId, status, score, feedback) => {
    try {
      const updated = await db.setHomeworkStatus(homeworkId, studentId, status, score, feedback);
      setHomeworkStatusState(updated);
    } catch (e) {
      setError('Could not update homework status. Please try again.');
      throw e;
    }
  }, []);

  const submitMyHomeworkAnswer = useCallback(async (homeworkId, studentId, file) => {
    try {
      const updated = await db.submitHomeworkAnswer(homeworkId, studentId, file);
      setHomeworkStatusState(updated);
    } catch (e) {
      setError('Could not submit your homework. Please try again.');
      throw e;
    }
  }, []);

  const addCertificate = useCallback(async (studentId, title, issuedDate) => {
    try {
      const record = await db.issueCertificate(studentId, title, issuedDate);
      setCertificates((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not issue certificate. Please try again.');
      throw e;
    }
  }, []);

  // Also creates a certificate server-side (see finalize_recognition_winner()
  // in migration 0025) - refetch the certificates list afterward so
  // Certificates.jsx reflects it without needing its own reload.
  const finalizeRecognitionWinner = useCallback(async (params) => {
    try {
      const result = await db.finalizeRecognitionWinner(params);
      const refreshed = await db.listCertificates();
      setCertificates(refreshed);
      touchBackup();
      return result;
    } catch (e) {
      setError('Could not finalize recognition. Please try again.');
      throw e;
    }
  }, [touchBackup]);

  const editCertificate = useCallback(async (id, data) => {
    try {
      const record = await db.updateCertificate(id, data);
      setCertificates((prev) => prev.map((c) => (c.id === id ? record : c)));
      return record;
    } catch (e) {
      setError('Could not save certificate changes. Please try again.');
      throw e;
    }
  }, []);

  const removeCertificate = useCallback(async (id) => {
    try {
      await db.deleteCertificate(id);
      setCertificates((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError('Could not delete certificate. Please try again.');
      throw e;
    }
  }, []);

  const updateCertificateTemplate = useCallback(async (key, data) => {
    try {
      const record = await db.setCertificateTemplate(key, data);
      setCertificateTemplates((prev) => prev.map((t) => (t.key === key ? record : t)));
      return record;
    } catch (e) {
      setError('Could not update the certificate template. Please try again.');
      throw e;
    }
  }, []);

  const addFile = useCallback(async (data) => {
    try {
      const record = await db.createFileRecord(data);
      setFiles((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not save that file. Please try again.');
      throw e;
    }
  }, []);

  const editFile = useCallback(async (id, data) => {
    try {
      const record = await db.updateFileRecord(id, data);
      setFiles((prev) => prev.map((f) => (f.id === id ? record : f)));
      return record;
    } catch (e) {
      setError('Could not replace that file. Please try again.');
      throw e;
    }
  }, []);

  const removeFile = useCallback(async (id) => {
    try {
      await db.deleteFileRecord(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError('Could not delete that file. Please try again.');
      throw e;
    }
  }, []);

  const addMessage = useCallback(async (data) => {
    try {
      const record = await db.sendMessage(data);
      setMessages((prev) => [record, ...prev]);
      return record;
    } catch (e) {
      setError('Could not send message. Please try again.');
      throw e;
    }
  }, []);

  const removeMessage = useCallback(async (id) => {
    try {
      await db.deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError('Could not delete message. Please try again.');
      throw e;
    }
  }, []);

  // Read receipts are a background nicety, not core data - a failure here
  // (e.g. a message that got deleted between load and click) shouldn't
  // surface the app's shared error banner.
  const markRead = useCallback(async (messageId, profileId) => {
    try {
      await db.markMessageRead(messageId, profileId);
      setMessageReads((prev) =>
        prev.some((r) => r.message_id === messageId && r.profile_id === profileId)
          ? prev
          : [...prev, { message_id: messageId, profile_id: profileId, read_at: new Date().toISOString() }]
      );
    } catch (e) {
      // best-effort
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
    // Same isolation as the initial load - a restore's core data reload
    // must not be held hostage by the messaging tables.
    try {
      const [tmpl, msg, reads, fls] = await Promise.all([
        db.listCertificateTemplates(),
        db.listMessages(),
        db.listMessageReads(),
        db.listFiles(),
      ]);
      setCertificateTemplates(tmpl);
      setMessages(msg);
      setMessageReads(reads);
      setFiles(fls);
    } catch (e) {
      // best-effort, see the initial-load effect above for why
    }
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
    certificateTemplates,
    messages,
    messageReads,
    files,
    loading,
    error,
    setError,
    addStudent,
    editStudent,
    awardStudentPoints,
    bulkAwardStudentPoints,
    removeStudent,
    importStudents,
    togglePayment,
    setAttendanceStatus,
    addLesson,
    editLesson,
    removeLesson,
    markLessonAttendance,
    addExam,
    editExam,
    removeExam,
    setExamScoreForStudent,
    submitMyExamAnswer,
    addHomework,
    editHomework,
    removeHomework,
    setHomeworkStatusForStudent,
    submitMyHomeworkAnswer,
    addCertificate,
    editCertificate,
    removeCertificate,
    finalizeRecognitionWinner,
    updateCertificateTemplate,
    addMessage,
    removeMessage,
    markRead,
    addFile,
    editFile,
    removeFile,
    reloadAll,
  };
}
