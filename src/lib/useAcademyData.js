// useAcademyData.js
// The single place components go to read or change data. Keeping every
// mutation here (rather than scattered across pages) is what makes the
// eventual Supabase swap mechanical: only db.js and this hook change.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as db from '../lib/db';
import { supabase } from '../lib/supabaseClient';
import { writeAutoBackup } from '../lib/backup';
import { studentDedupeKey } from '../utils/roster';
import { useAuth } from './AuthContext';
import { isChatNotificationsEnabled } from './notificationPrefs';

// Chat Phase 3.2: browser notifications, built entirely on top of the
// realtime subscription below - no second subscription, no DB change, no
// service worker/push. See buildConversationUrl/matchesActiveView for
// the two things a raw 'messages' INSERT row needs resolved against the
// currently-open conversation (tracked via activeConversationRef, set by
// Chat.jsx) to decide whether to actually show a notification.
function buildConversationUrl(m) {
  if (m.scope === 'context') return `/chat?type=${m.context_type}&id=${m.context_id}`;
  if (m.scope === 'direct') return `/chat?open=direct&with=${m.sender_id}`;
  if (m.scope === 'level') return `/chat?open=level&level=${m.level}`;
  return `/chat?open=announcement`;
}

export function useAcademyData() {
  const { profile } = useAuth();
  // What conversation (if any) is currently open in Chat.jsx - a ref, not
  // state, since it only needs to be read at notification time, not drive
  // any render here. Chat.jsx keeps this in sync via
  // setActiveConversationView(). null when Chat isn't open or no specific
  // conversation is selected.
  const activeConversationRef = useRef(null);
  const setActiveConversationView = useCallback((descriptor) => {
    activeConversationRef.current = descriptor;
  }, []);

  const matchesActiveView = useCallback(
    (m) => {
      const view = activeConversationRef.current;
      if (!view) return false;
      if (m.scope === 'direct' && view.kind === 'direct') {
        return (m.sender_id === view.otherId && m.recipient_id === profile.id) || (m.recipient_id === view.otherId && m.sender_id === profile.id);
      }
      if (m.scope === 'level' && view.kind === 'level') return m.level === view.level;
      if (m.scope === 'announcement' && view.kind === 'announcement') return true;
      if (m.scope === 'context' && view.kind === 'context') return m.context_type === view.contextType && m.context_id === view.contextId;
      return false;
    },
    [profile.id]
  );

  const maybeNotify = useCallback(
    (m) => {
      if (m.sender_id === profile.id) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!isChatNotificationsEnabled()) return;
      // Skip only if the tab is visible AND showing this exact
      // conversation - a hidden tab always notifies regardless of what
      // was open, and a visible-but-different conversation still notifies
      // (matches Requirements: notify unless already viewing this thread).
      if (!document.hidden && matchesActiveView(m)) return;

      const bodyText = m.body || (m.attachment_name ? `📎 ${m.attachment_name}` : '📎 Attachment');
      const notif = new Notification(m.sender_name || 'New message', {
        body: bodyText,
        icon: '/icons/icon-192.png',
        tag: `chat-message-${m.id}`,
      });
      notif.onclick = () => {
        window.focus();
        window.location.href = buildConversationUrl(m);
        notif.close();
      };
    },
    [profile.id, matchesActiveView]
  );

  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  // Mirrors of the three state values above, kept current via the effect
  // below, so touchBackup() can read the latest snapshot synchronously
  // without re-fetching from Supabase on every single mutation.
  const stateRef = useRef({ students: [], payments: [], attendance: [] });
  const [lessons, setLessons] = useState([]);
  const [curriculumLessons, setCurriculumLessons] = useState([]);
  const [curriculumProgress, setCurriculumProgress] = useState([]);
  const [lessonAttendance, setLessonAttendanceState] = useState([]);
  const [exams, setExams] = useState([]);
  const [examScores, setExamScoresState] = useState([]);
  const [homework, setHomework] = useState([]);
  const [homeworkStatus, setHomeworkStatusState] = useState([]);
  const [homeworkSubmissionFiles, setHomeworkSubmissionFilesState] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [certificateTemplates, setCertificateTemplates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageReads, setMessageReads] = useState([]);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lessonProgress, setLessonProgressState] = useState([]);

  // The portal's "me": the student row whose profile_id matches the
  // signed-in user. No fallback to students[0] — that leaked the first
  // roster student's data to unlinked/admin users and broke "not linked yet"
  // empty states. Admin/teacher users correctly get me=null and use the
  // admin dashboard (see App.jsx isStudent branching). Do not reintroduce
  // students[0] fallback here; portal pages must handle me=null explicitly.
  const me = useMemo(
    () => students.find((s) => s.profile_id && profile?.id && s.profile_id === profile.id) ?? null,
    [students, profile]
  );

  // Per-student lesson completion + PDF page tracking (Lesson Hub V2) -
  // loaded for the current student only; RLS scopes rows to their owner.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    db.listStudentLessonProgress(me.id)
      .then((rows) => { if (!cancelled) setLessonProgressState(rows); })
      .catch(() => { if (!cancelled) setLessonProgressState([]); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, a, le, la, ex, es, hw, hs, cert] = await Promise.all([
          db.listStudents(),
          db.listLegacyPaymentsForBackup(),
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
        const [tmpl, msg, reads, atts, fls, hsf, cl, cp] = await Promise.all([
          db.listCertificateTemplates(),
          db.listMessages(),
          db.listMessageReads(),
          db.listMessageAttachments(),
          db.listFiles(),
          db.listHomeworkSubmissionFiles(),
          db.listCurriculumLessons(),
          db.listCurriculumProgress(),
        ]);
        setCertificateTemplates(tmpl);
        setMessages(msg);
        setMessageReads(reads);
        setMessageAttachments(atts);
        setFiles(fls);
        setHomeworkSubmissionFilesState(hsf);
        setCurriculumLessons(cl);
        setCurriculumProgress(cp);
      } catch (e) {
        // Messaging/certificate-template/file-library are additive
        // features - leave them at their empty defaults rather than
        // surfacing the shared error banner over the whole app for
        // what's likely just a migration not being applied yet in this
        // environment.
      }
    })();
  }, []);

  // Realtime: messages/message_reads are published via supabase_realtime
  // (see migration 0044). Subscribe once for the life of the app instead
  // of polling; dedupe by primary key since addMessage()/markRead() below
  // already apply their own optimistic update and would otherwise double
  // up with the echo of their own write coming back through this channel.
  useEffect(() => {
    const channel = supabase
      .channel('chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [payload.new, ...prev]));
        maybeNotify(payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reads' }, (payload) => {
        setMessageReads((prev) =>
          prev.some((r) => r.message_id === payload.new.message_id && r.profile_id === payload.new.profile_id)
            ? prev
            : [...prev, payload.new]
        );
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reads' }, (payload) => {
        setMessageReads((prev) =>
          prev.map((r) =>
            r.message_id === payload.new.message_id && r.profile_id === payload.new.profile_id ? payload.new : r
          )
        );
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_attachments' }, (payload) => {
        setMessageAttachments((prev) => (prev.some((a) => a.id === payload.new.id) ? prev : [...prev, payload.new]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_attachments' }, (payload) => {
        setMessageAttachments((prev) => prev.filter((a) => a.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maybeNotify]);

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
        const transactionId = await db.awardPoints(params);
        const refreshed = await db.listStudents();
        setStudents(refreshed);
        setError('');
        touchBackup();
        return transactionId;
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
        setError('');
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

  const [pendingAttendance, setPendingAttendance] = useState(new Set());

  const setAttendanceStatus = useCallback(
    async (studentId, date, status) => {
      // Deduplicate: prevent concurrent saves for the same student+date.
      // Use functional check via pendingAttendanceRef to avoid stale closure.
      const key = `${studentId}:${date}`;
      if (pendingAttendance.has(key)) return;
      setPendingAttendance((prev) => {
        if (prev.has(key)) return prev;
        return new Set([...prev, key]);
      });

      // Capture the original record before the optimistic update, so we can
      // restore it exactly on failure. Use attendance from closure (not prev).
      const originalRecord = attendance.find((a) => a.student_id === studentId && a.date === date);

      // Optimistic update: immediately reflect the change in local state.
      setAttendance((prev) => {
        const existing = prev.find((a) => a.student_id === studentId && a.date === date);
        if (existing) {
          if (existing.status === status) {
            // Toggle off: remove the record.
            return prev.filter((a) => a.id !== existing.id);
          }
          // Update existing record — keep the real id, replace status optimistically.
          return prev.map((a) => (a.id === existing.id ? { ...a, status } : a));
        }
        // Insert new record (optimistic — id may be placeholder).
        return [...prev, { id: `opt-${key}`, student_id: studentId, date, status }];
      });

      try {
        const result = await db.setAttendanceStatus(studentId, date, status);
        // Replace optimistic state with real data from the server.
        setAttendance((prev) => {
          // Remove the optimistic entry.
          const withoutOptimistic = prev.filter(
            (a) => !(a.id === `opt-${key}` && a.student_id === studentId && a.date === date)
          );
          if (result.deleted) {
            // Server deleted the row — remove any matching record.
            return withoutOptimistic.filter(
              (a) => !(a.student_id === result.studentId && a.date === result.date)
            );
          }
          // Server upserted — merge the real row.
          const real = result.row;
          const exists = withoutOptimistic.find((a) => a.student_id === real.student_id && a.date === real.date);
          if (exists) {
            return withoutOptimistic.map((a) => (a.id === real.id ? real : a));
          }
          return [...withoutOptimistic, real];
        });
        touchBackup();
      } catch (e) {
        // Rollback: restore the original record if one existed, otherwise remove
        // the optimistic entry. This preserves the pre-update state exactly.
        setAttendance((prev) => {
          if (originalRecord) {
            // An existing record was updated — restore its original status.
            return prev.map((a) =>
              a.student_id === studentId && a.date === date
                ? { ...originalRecord, status: originalRecord.status }
                : a
            );
          }
          // No existing record was present — remove the optimistic entry.
          return prev.filter(
            (a) => !(a.id === `opt-${key}` && a.student_id === studentId && a.date === date)
          );
        });
        setError('Could not update attendance. Please try again.');
        throw e;
      } finally {
        setPendingAttendance((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [touchBackup, pendingAttendance, attendance]
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
      setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...record } : l)));
      return record;
    } catch (e) {
      setError('Could not save lesson changes. Please try again.');
      throw e;
    }
  }, []);

  const advanceCurriculumProgress = useCallback(async (level, currentLessonNumber) => {
    try {
      const record = await db.advanceCurriculumProgress(level, currentLessonNumber);
      setCurriculumProgress((prev) => prev.map((p) => (p.level === level ? record : p)));
      return record;
    } catch (e) {
      setError('Could not update curriculum progress. Please try again.');
      throw e;
    }
  }, []);

  // Per-student lesson completion (Lesson Hub V2) - upserts one
  // (student, lesson) progress row and merges the returned row into state.
  const setLessonProgress = useCallback(async (studentId, lessonId, patch) => {
    try {
      const record = await db.setStudentLessonProgress(studentId, lessonId, patch);
      setLessonProgressState((prev) => {
        const idx = prev.findIndex((r) => r.student_id === studentId && r.lesson_id === lessonId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...record };
          return next;
        }
        return [...prev, record];
      });
      return record;
    } catch (e) {
      setError('Could not save your lesson progress. Please try again.');
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

  const setExamScoreForStudent = useCallback(async (examId, studentId, score, feedback = null) => {
    try {
      const updated = await db.setExamScore(examId, studentId, score, feedback);
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

  // files: array of {fileUrl, fileName, fileType} already uploaded to
  // storage by the caller. Inserted one at a time (see
  // addHomeworkSubmissionFile's comment for why) so a failure partway
  // through - e.g. hitting the 5-file cap, or a transient error - keeps
  // whatever already succeeded recorded rather than silently discarding
  // the student's work. Rethrows after recording partial progress so the
  // caller can show an accurate error.
  const submitMyHomeworkFiles = useCallback(
    async (homeworkId, studentId, files) => {
      const startingPosition = homeworkSubmissionFiles.filter(
        (f) => f.homework_id === homeworkId && f.student_id === studentId
      ).length;
      const inserted = [];
      try {
        for (let i = 0; i < files.length; i++) {
          const record = await db.addHomeworkSubmissionFile(homeworkId, studentId, {
            ...files[i],
            position: startingPosition + i,
          });
          inserted.push(record);
        }
      } catch (e) {
        if (inserted.length > 0) {
          setHomeworkSubmissionFilesState((prev) => [...prev, ...inserted]);
          try {
            const serverStatuses = await db.markHomeworkSubmitted(homeworkId, studentId);
            setHomeworkStatusState(serverStatuses);
          } catch {
            // best-effort - the files that did save are already visible
          }
        }
        setError('Could not save all of your files. Please try again.');
        throw e;
      }
      setHomeworkSubmissionFilesState((prev) => [...prev, ...inserted]);
      try {
        await db.markHomeworkSubmitted(homeworkId, studentId);
        // Optimistically update homeworkStatus immediately so UI reflects submission
        setHomeworkStatusState((prev) => {
          const existing = prev.find((s) => s.homework_id === homeworkId && s.student_id === studentId);
          const now = new Date().toISOString();
          const newStatus = {
            homework_id: homeworkId,
            student_id: studentId,
            status: 'Submitted',
            submitted_at: now,
            score: null,
            feedback: null,
            answer_file_url: null,
            answer_file_name: null,
          };
          if (existing) {
            return prev.map((s) =>
              s.homework_id === homeworkId && s.student_id === studentId
                ? { ...s, status: 'Submitted', submitted_at: now }
                : s
            );
          }
          return [...prev, newStatus];
        });
        // Background refresh to reconcile with server
        db.markHomeworkSubmitted(homeworkId, studentId)
          .then((serverStatuses) => setHomeworkStatusState(serverStatuses))
          .catch(() => {}); // best-effort reconciliation
      } catch (e) {
        setError('Your files were saved, but we could not update your submission status. Please try again.');
        throw e;
      }
    },
    [homeworkSubmissionFiles]
  );

  const removeMyHomeworkSubmissionFile = useCallback(async (id) => {
    try {
      await db.deleteHomeworkSubmissionFile(id);
      setHomeworkSubmissionFilesState((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError('Could not remove this file. Please try again.');
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

  // Also deletes the certificate the revoked award held (see
  // revoke_recognition_award(), migration 0027) - refetch certificates so
  // Certificates.jsx/MyCertificates.jsx stop showing it without needing
  // their own reload.
  const revokeRecognitionAward = useCallback(
    async (recognitionId, reason) => {
      try {
        await db.revokeRecognitionAward(recognitionId, reason);
        const refreshed = await db.listCertificates();
        setCertificates(refreshed);
        touchBackup();
      } catch (e) {
        setError('Could not revoke this recognition award. Please try again.');
        throw e;
      }
    },
    [touchBackup]
  );

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

  // Only used for messages sent with more than one file - see migration
  // 0047. Called after addMessage() returns the new message's id.
  const addMessageAttachments = useCallback(async (messageId, attachments) => {
    try {
      const rows = await db.addMessageAttachments(messageId, attachments);
      setMessageAttachments((prev) => [...prev, ...rows]);
      return rows;
    } catch (e) {
      setError('Could not attach files. Please try again.');
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
      db.listLegacyPaymentsForBackup(),
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
      const [tmpl, msg, reads, atts, fls, hsf, cl, cp] = await Promise.all([
        db.listCertificateTemplates(),
        db.listMessages(),
        db.listMessageReads(),
        db.listMessageAttachments(),
        db.listFiles(),
        db.listHomeworkSubmissionFiles(),
        db.listCurriculumLessons(),
        db.listCurriculumProgress(),
      ]);
      setCertificateTemplates(tmpl);
      setMessages(msg);
      setMessageReads(reads);
      setMessageAttachments(atts);
      setFiles(fls);
      setHomeworkSubmissionFilesState(hsf);
      setCurriculumLessons(cl);
      setCurriculumProgress(cp);
    } catch (e) {
      // best-effort, see the initial-load effect above for why
    }
    if (me) {
      try {
        setLessonProgressState(await db.listStudentLessonProgress(me.id));
      } catch (e) {
        // best-effort - progress is additive, not worth the shared error banner
      }
    }
  }, [me]);

  return {
    students,
    me,
    payments,
    attendance,
    lessons,
    curriculumLessons,
    curriculumProgress,
    lessonProgress,
    lessonAttendance,
    exams,
    examScores,
    homework,
    homeworkStatus,
    homeworkSubmissionFiles,
    certificates,
    certificateTemplates,
    messages,
    messageReads,
    messageAttachments,
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
    setAttendanceStatus,
    pendingAttendance,
    addLesson,
    editLesson,
    removeLesson,
    advanceCurriculumProgress,
    setLessonProgress,
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
    submitMyHomeworkFiles,
    removeMyHomeworkSubmissionFile,
    addCertificate,
    editCertificate,
    removeCertificate,
    finalizeRecognitionWinner,
    revokeRecognitionAward,
    updateCertificateTemplate,
    addMessage,
    addMessageAttachments,
    removeMessage,
    markRead,
    setActiveConversationView,
    addFile,
    editFile,
    removeFile,
    reloadAll,
  };
}
