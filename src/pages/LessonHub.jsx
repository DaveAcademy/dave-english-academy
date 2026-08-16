// LessonHub.jsx
// Single-page "learning center" for one lesson: PDF, Homework, Vocabulary,
// Quiz, and Notes all together, so a student never has to jump between
// pages to find what a lesson needs. One component serves both roles -
// teacher/admin route /lessons/:id, student route /my-lessons/:id - via
// AuthContext's role, so the two views can never drift out of sync.
//
// Deliberately reuses existing data/RLS instead of duplicating it:
// - PDF: same uploadAttachment/getAttachmentUrl + editLesson pattern as
//   Lessons.jsx/MyLessons.jsx.
// - Homework/Quiz: create/edit/submit happen here, scoped to this lesson's
//   items only. Per-student grading rosters stay on the existing
//   /homework and /exams pages (linked out) rather than re-implementing
//   their full grading UIs a second time.
// - Vocabulary: inline preview only (listLessonVocabulary) - full
//   study/search/favorites stays on /vocabulary (teacher) or
//   /my-vocabulary?lesson=<id> (student - this query param already works,
//   see MyLessons.jsx).
// - Quiz uses the exams table + its lesson_id column (migration 0051)
//   instead of a separate quiz table - no new schema beyond that link.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Download, FileCheck2,
  FileText, Languages, List, BookOpen, Image as ImageIcon, Pencil, PlayCircle, Plus, RotateCcw,
  StickyNote, Trash2, Upload, X,
} from 'lucide-react';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber, lessonStatusFor,
} from '../lib/lessonLogic';
import { useAuth } from '../lib/AuthContext';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import PdfViewer from '../components/PdfViewer';
import {
  uploadAttachment, getAttachmentUrl, listLessonVocabulary,
  getMyLessonWorkSubmission, createLessonWorkSubmission, listLessonWorkSubmissionFiles,
  addLessonWorkSubmissionFile, deleteLessonWorkSubmissionFile,
  listLessonWorkSubmissionsForLesson, listLessonWorkSubmissionFilesForSubmissions,
  markLessonWorkReviewed, awardLessonWorkPoints, listPointCategories,
} from '../lib/db';
import HomeworkGradingRoster from '../components/HomeworkGradingRoster';
import ExamGradingRoster from '../components/ExamGradingRoster';
import LessonWorkReviewRoster from '../components/LessonWorkReviewRoster';
import { translatedLessonTitle } from '../lib/lessonLogic';
import { examTypeIcon } from '../utils/examLabel';

// LessonHub doesn't use i18n elsewhere (see file header - all copy here is
// plain English), so the grading rosters get the same plain labels inline
// rather than introducing a translation namespace for two cards.
const GRADE_LABELS = {
  needsGrading: 'Needs grading',
  notSubmitted: 'Not submitted',
  studentSubmissionDefault: 'Submission',
  scorePlaceholder: 'Score',
  feedbackPlaceholder: 'Feedback (optional)',
  submitted: 'Submitted',
  graded: 'Graded',
  notGraded: 'Not graded',
  studentAnswerDefault: 'Answer',
};
const gradeT = (key, opts) => (key === 'imageN' ? `Image ${opts?.n}` : GRADE_LABELS[key] ?? key);
const HW_STATUS_LABELS = { Assigned: 'Assigned', Submitted: 'Submitted', Graded: 'Graded' };

function HubCard({ icon: Icon, title, action, children }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Icon size={18} className="text-brand-500" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const EMPTY_HOMEWORK_FORM = { title: '', description: '', due_date: new Date().toISOString().slice(0, 10) };
const EMPTY_QUIZ_FORM = { title: '', description: '', exam_date: new Date().toISOString().slice(0, 10), max_score: 100 };

export default function LessonHub() {
  const { t } = useTranslation('lessons');
  const { id } = useParams();
  const lessonId = Number(id);
  const { role, session } = useAuth();
  const isStudent = role === 'student';
  const navigate = useNavigate();
  const {
    lessons, students, me, editLesson, curriculumProgress, lessonProgress, setLessonProgress,
    homework, homeworkStatus, homeworkSubmissionFiles, addHomework, editHomework, removeHomework, submitMyHomeworkFiles, setHomeworkStatusForStudent,
    exams, examScores, addExam, editExam, removeExam, submitMyExamAnswer, setExamScoreForStudent,
  } = useAcademy();

  const lesson = lessons.find((l) => l.id === lessonId);
  const backHref = isStudent ? '/my-lessons' : '/lessons';

  // Unlock/status shared with MyLessons (lessonLogic.js) - mirrors
  // can_read_lesson_pdf server-side: teacher pace floor, lesson 1 always
  // open, and a completed previous lesson unlocks the next. The storage
  // RLS policy is the real boundary; this just explains a locked lesson
  // instead of a silently-failing PDF fetch.
  const pace = teacherPaceFor(curriculumProgress, me?.level);
  const cap = lessonCapFor(curriculumProgress, me?.level);
  const progressByNum = useMemo(() => progressByLessonNumber(lessonProgress, lessons), [lessonProgress, lessons]);
  const lessonStatus = isStudent && me && lesson ? lessonStatusFor(lesson, pace, progressByNum, cap) : null;
  const isLockedForMe = lessonStatus === 'locked';
  const lessonNumber = lesson?.curriculum_lessons?.lesson_number;

  // --- In-lesson navigation (prev / next / jump) ------------------------
  // Same curriculum ordering the list page uses; students navigate within
  // their visible scope (shared + own level/group lessons).
  const orderedLessons = useMemo(
    () =>
      [...lessons].sort((a, b) => {
        const an = a.curriculum_lessons?.lesson_number;
        const bn = b.curriculum_lessons?.lesson_number;
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      }),
    [lessons]
  );
  const navLessons = useMemo(() => {
    if (!isStudent || !me) return orderedLessons;
    return orderedLessons.filter(
      (l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level
    );
  }, [orderedLessons, isStudent, me]);
  const navIndex = lesson ? navLessons.findIndex((l) => l.id === lesson.id) : -1;
  const prevLesson = navIndex > 0 ? navLessons[navIndex - 1] : null;
  const nextLesson = navIndex >= 0 && navIndex < navLessons.length - 1 ? navLessons[navIndex + 1] : null;
  const goToLesson = (l) => navigate(isStudent ? `/my-lessons/${l.id}` : `/lessons/${l.id}`);

  // --- PDF ---
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [viewPdf, setViewPdf] = useState(null);

  const handleOpenPdf = () => setViewPdf(lesson);

  const handlePdfPick = async (file) => {
    if (!file) return;
    setPdfUploading(true);
    setPdfError(null);
    try {
      const uploaded = await uploadAttachment(file, `lesson-pdfs/${lessonId}`);
      await editLesson(lessonId, { pdf_path: uploaded.path, pdf_name: uploaded.name });
    } catch {
      setPdfError('Could not upload the PDF - please try again.');
    } finally {
      setPdfUploading(false);
      setPdfFile(null);
    }
  };

  const handlePdfRemove = async () => {
    await editLesson(lessonId, { pdf_path: null, pdf_name: null });
  };

  // --- Homework (scoped to this lesson) ---
  const lessonHomework = useMemo(
    () => homework.filter((h) => h.lesson_id === lessonId).sort((a, b) => new Date(b.due_date) - new Date(a.due_date)),
    [homework, lessonId]
  );
  const [hwFormOpen, setHwFormOpen] = useState(false);
  const [hwForm, setHwForm] = useState(EMPTY_HOMEWORK_FORM);
  const [hwEditingId, setHwEditingId] = useState(null);
  const [hwSaving, setHwSaving] = useState(false);
  const [deletingHomework, setDeletingHomework] = useState(null);
  const [hwUploading, setHwUploading] = useState(null); // homework id currently uploading

  const startHwEdit = (h) => {
    setHwEditingId(h.id);
    setHwForm({ title: h.title, description: h.description || '', due_date: h.due_date });
    setHwFormOpen(true);
  };
  const resetHwForm = () => {
    setHwForm(EMPTY_HOMEWORK_FORM);
    setHwFormOpen(false);
    setHwEditingId(null);
  };
  const handleHwSubmit = async (e) => {
    e.preventDefault();
    if (!hwForm.title.trim()) return;
    setHwSaving(true);
    try {
      const payload = { title: hwForm.title, description: hwForm.description || null, due_date: hwForm.due_date, lesson_id: lessonId, level: lesson?.level || null };
      if (hwEditingId) await editHomework(hwEditingId, payload);
      else await addHomework(payload);
      resetHwForm();
    } finally {
      setHwSaving(false);
    }
  };
  const handleHwDelete = async () => {
    await removeHomework(deletingHomework.id);
    setDeletingHomework(null);
  };
  const myHwStatus = (homeworkId) => homeworkStatus.find((s) => s.homework_id === homeworkId && s.student_id === me?.id);
  const myHwFilesCount = (homeworkId) =>
    homeworkSubmissionFiles.filter((f) => f.homework_id === homeworkId && f.student_id === me?.id).length;
  const handleHwFilePick = async (homeworkId, file) => {
    if (!file || !me) return;
    setHwUploading(homeworkId);
    try {
      const uploaded = await uploadAttachment(file, `homework-answers/${me.id}`);
      await submitMyHomeworkFiles(homeworkId, me.id, [{ fileUrl: uploaded.path, fileName: uploaded.name, fileType: uploaded.type }]);
    } finally {
      setHwUploading(null);
    }
  };

  // --- Quiz (exams scoped to this lesson) ---
  const lessonQuizzes = useMemo(
    () => exams.filter((ex) => ex.lesson_id === lessonId).sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date)),
    [exams, lessonId]
  );
  const [quizFormOpen, setQuizFormOpen] = useState(false);
  const [quizForm, setQuizForm] = useState(EMPTY_QUIZ_FORM);
  const [quizEditingId, setQuizEditingId] = useState(null);
  const [quizSaving, setQuizSaving] = useState(false);
  const [deletingQuiz, setDeletingQuiz] = useState(null);
  const [quizUploading, setQuizUploading] = useState(null);

  const startQuizEdit = (ex) => {
    setQuizEditingId(ex.id);
    setQuizForm({ title: ex.title, description: ex.description || '', exam_date: ex.exam_date, max_score: ex.max_score });
    setQuizFormOpen(true);
  };
  const resetQuizForm = () => {
    setQuizForm(EMPTY_QUIZ_FORM);
    setQuizFormOpen(false);
    setQuizEditingId(null);
  };
  const handleQuizSubmit = async (e) => {
    e.preventDefault();
    if (!quizForm.title.trim()) return;
    setQuizSaving(true);
    try {
      const payload = {
        title: quizForm.title,
        description: quizForm.description || null,
        exam_date: quizForm.exam_date,
        max_score: Number(quizForm.max_score) || 100,
        lesson_id: lessonId,
        level: lesson?.level || null,
      };
      if (quizEditingId) await editExam(quizEditingId, payload);
      else await addExam(payload);
      resetQuizForm();
    } finally {
      setQuizSaving(false);
    }
  };
  const handleQuizDelete = async () => {
    await removeExam(deletingQuiz.id);
    setDeletingQuiz(null);
  };
  const myQuizScore = (examId) => examScores.find((s) => s.exam_id === examId && s.student_id === me?.id);
  const handleQuizFilePick = async (examId, file) => {
    if (!file || !me) return;
    setQuizUploading(examId);
    try {
      const uploaded = await uploadAttachment(file, `exam-answers/${me.id}`);
      await submitMyExamAnswer(examId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name });
    } finally {
      setQuizUploading(null);
    }
  };

  // --- Vocabulary preview ---
  const [vocabWords, setVocabWords] = useState([]);
  const [vocabLoading, setVocabLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setVocabLoading(true);
    listLessonVocabulary(lessonId)
      .then((words) => { if (!cancelled) setVocabWords(words); })
      .finally(() => { if (!cancelled) setVocabLoading(false); });
    return () => { cancelled = true; };
  }, [lessonId]);

  // Roster = active students at the lesson's level, same convention already
  // used by Attendance.jsx and Exams.jsx's grading roster (level-based, not
  // group_name - group_name is display-only metadata elsewhere in the app).
  // Attendance marking itself lives on Attendance.jsx only (single source
  // of truth) - lessonRoster here is only for the grading rosters below.
  const lessonRoster = useMemo(
    () =>
      [...students]
        .filter((s) => s.status === 'Active')
        .filter((s) => !lesson?.level || s.level === lesson.level)
        .sort((a, b) => a.real_name.localeCompare(b.real_name)),
    [students, lesson]
  );

  // --- Grading (teacher-only, inline per lesson item, collapsed by
  // default - reuses the same roster components/setters as Homework.jsx
  // and Exams.jsx so grading logic lives in exactly one place). ---
  const [expandedGrading, setExpandedGrading] = useState({}); // { [`hw-${id}` | `ex-${id}`]: boolean }
  const toggleGrading = (key) => setExpandedGrading((prev) => ({ ...prev, [key]: !prev[key] }));
  const handleOpenAnswerFile = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };
  const hwStatusOf = (homeworkId, studentId) =>
    homeworkStatus.find((s) => s.homework_id === homeworkId && s.student_id === studentId) || {
      status: 'Assigned', score: null, feedback: null, answer_file_url: null, answer_file_name: null,
    };
  const hwFilesOf = (homeworkId, studentId) =>
    homeworkSubmissionFiles.filter((f) => f.homework_id === homeworkId && f.student_id === studentId).sort((a, b) => a.position - b.position);
  const hwGradingStateOf = (homeworkId, studentId) => {
    const current = hwStatusOf(homeworkId, studentId);
    if (current.score != null) return 'graded';
    if (current.answer_file_url || hwFilesOf(homeworkId, studentId).length > 0) return 'needsGrading';
    return 'notSubmitted';
  };
  const hwSubmittedCount = (homeworkId) =>
    lessonRoster.filter((s) => hwGradingStateOf(homeworkId, s.id) !== 'notSubmitted').length;
  const examAnswerOf = (examId, studentId) => examScores.find((s) => s.exam_id === examId && s.student_id === studentId) || {};
  const examSubmittedCount = (examId) =>
    lessonRoster.filter((s) => !!examAnswerOf(examId, s.id).answer_file_url).length;

  // --- Notes ---
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const startNotesEdit = () => {
    setNotesDraft(lesson?.notes || '');
    setNotesEditing(true);
  };
  const handleNotesSave = async () => {
    setNotesSaving(true);
    try {
      await editLesson(lessonId, { notes: notesDraft || null });
      setNotesEditing(false);
    } finally {
      setNotesSaving(false);
    }
  };

  // --- Completion + last-page remembering (student only) ----------------
  const [justCompleted, setJustCompleted] = useState(false);
  const lastPageSentRef = useRef(null);
  const persistPage = useCallback(
    (pageNum) => {
      if (!isStudent || !me || !lesson || !pageNum) return;
      if (lastPageSentRef.current === pageNum) return;
      lastPageSentRef.current = pageNum;
      setLessonProgress(me.id, lesson.id, { last_page: pageNum });
    },
    [isStudent, me, lesson, setLessonProgress]
  );

  const handleMarkCompleted = () => {
    if (!isStudent || !me || !lesson) return;
    setLessonProgress(me.id, lesson.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    setJustCompleted(true);
    window.setTimeout(() => setJustCompleted(false), 4000);
  };

  const handleMarkInProgress = () => {
    if (!isStudent || !me || !lesson) return;
    setLessonProgress(me.id, lesson.id, { status: 'in_progress', completed_at: null });
  };

  // --- Lesson work submission (Phase 1 foundation) -----------------------
  // Deliberately independent of lesson progress above: uploading/submitting
  // work never calls setLessonProgress, and Mark completed/in progress
  // never touch this state. See migration 0103 / storageBridge.js.
  const MAX_WORK_IMAGES = 5;
  const [workSubmission, setWorkSubmission] = useState(null);
  const [workFiles, setWorkFiles] = useState([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [workPending, setWorkPending] = useState([]); // { file, previewUrl }[]
  const [workUploading, setWorkUploading] = useState(false);
  const [workError, setWorkError] = useState(null);
  const workPendingRef = useRef(workPending);
  workPendingRef.current = workPending;

  useEffect(() => () => workPendingRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  useEffect(() => {
    if (!isStudent || !me || !lesson) return;
    let cancelled = false;
    setWorkLoading(true);
    (async () => {
      try {
        const submission = await getMyLessonWorkSubmission(me.id, lesson.id);
        if (cancelled) return;
        setWorkSubmission(submission);
        if (submission) {
          const files = await listLessonWorkSubmissionFiles(submission.id);
          if (!cancelled) setWorkFiles(files);
        } else {
          setWorkFiles([]);
        }
      } catch {
        if (!cancelled) setWorkError('Could not load your submission.');
      } finally {
        if (!cancelled) setWorkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStudent, me, lesson]);

  const handlePickWorkFiles = (fileList) => {
    const picked = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) return;
    const already = workFiles.length + workPending.length;
    const room = Math.max(0, MAX_WORK_IMAGES - already);
    const accepted = picked.slice(0, room);
    if (accepted.length < picked.length) setWorkError(`You can upload up to ${MAX_WORK_IMAGES} images.`);
    else setWorkError(null);
    setWorkPending((prev) => [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const handleRemoveWorkPending = (index) => {
    setWorkPending((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleRemoveWorkFile = async (id) => {
    setWorkError(null);
    try {
      await deleteLessonWorkSubmissionFile(id);
      setWorkFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      setWorkError('Could not remove that image.');
    }
  };

  const handleSubmitWork = async () => {
    if (!isStudent || !me || !lesson || workPending.length === 0) return;
    setWorkUploading(true);
    setWorkError(null);
    try {
      let submission = workSubmission;
      if (!submission) {
        submission = await createLessonWorkSubmission(me.id, lesson.id);
        setWorkSubmission(submission);
      }
      const uploaded = [];
      let position = workFiles.length;
      for (const item of workPending) {
        const result = await uploadAttachment(item.file, `lesson-work/${me.id}`);
        const row = await addLessonWorkSubmissionFile(submission.id, me.id, {
          fileUrl: result.path,
          fileName: result.name,
          position: position++,
        });
        uploaded.push(row);
      }
      workPending.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      setWorkPending([]);
      setWorkFiles((prev) => [...prev, ...uploaded]);
    } catch {
      setWorkError('Could not submit your work. Please try again.');
    } finally {
      setWorkUploading(false);
    }
  };

  // --- Lesson work review (teacher-only, Phase 2) -------------------------
  // Independent data load from the student panel above - lesson_work_
  // submissions/files aren't in AcademyDataContext's in-memory arrays, so
  // this page fetches them itself, same as the student's own submission
  // fetch does. Points always go through awardLessonWorkPoints()
  // (storageBridge.js), which is the only writer of point_transactions
  // here - same ledger, same awardPoints() call every other points flow in
  // this app uses (see Rankings.jsx).
  const [workSubmissions, setWorkSubmissions] = useState([]);
  const [workSubmissionFiles, setWorkSubmissionFiles] = useState([]);
  const [pointCategories, setPointCategories] = useState([]);
  const [workReviewExpanded, setWorkReviewExpanded] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');

  const reloadLessonWork = useCallback(async () => {
    if (isStudent || !lesson) return;
    const submissions = await listLessonWorkSubmissionsForLesson(lesson.id);
    setWorkSubmissions(submissions || []);
    const files = await listLessonWorkSubmissionFilesForSubmissions((submissions || []).map((s) => s.id));
    setWorkSubmissionFiles(files || []);
  }, [isStudent, lesson]);

  useEffect(() => {
    reloadLessonWork();
  }, [reloadLessonWork]);

  useEffect(() => {
    if (isStudent) return;
    listPointCategories()
      .then((rows) => setPointCategories(rows || []))
      .catch(() => setPointCategories([]));
  }, [isStudent]);

  // 'other' rather than 'homework': lesson practice is deliberately not
  // part of the Homework domain (see 0103's header), so its point history
  // entries shouldn't display under that category either.
  const lessonWorkCategory = useMemo(
    () => pointCategories.find((c) => c.key === 'other') || null,
    [pointCategories]
  );

  const workSubmissionOf = (studentId) => workSubmissions.find((s) => s.student_id === studentId) || null;
  const workFilesOf = (submissionId) => workSubmissionFiles.filter((f) => f.submission_id === submissionId);

  const handleMarkLessonWorkReviewed = async (submission, feedback) => {
    setReviewMessage('');
    try {
      await markLessonWorkReviewed(submission.id, { reviewedBy: session?.user?.id, feedback });
      await reloadLessonWork();
    } catch {
      setReviewMessage('Could not update review status. Please try again.');
    }
  };

  const handleAwardLessonWorkPoints = async (submission, student, points) => {
    setReviewMessage('');
    try {
      await awardLessonWorkPoints({
        submissionId: submission.id,
        studentId: student.id,
        level: student.level,
        points,
        reason: `Lesson practice - ${lesson?.topic || `Lesson ${lessonNumber ?? lesson.id}`}`,
        awardedBy: session?.user?.id,
        categoryId: lessonWorkCategory?.id ?? null,
        categoryKey: 'other',
      });
      await reloadLessonWork();
      setReviewMessage(`Awarded +${points} to ${student.real_name}.`);
    } catch {
      setReviewMessage('Could not award points. Please try again.');
    }
  };

  // Opening a lesson for the first time marks it in progress, so the list
  // reflects what the student actually touched (never fires twice).
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (!isStudent || !me || !lesson || isLockedForMe) return;
    if (autoStartRef.current) return;
    autoStartRef.current = true;
    if (lessonStatus === LESSON_STATUS.NOT_STARTED) {
      setLessonProgress(me.id, lesson.id, { status: 'in_progress' });
    }
  }, [isStudent, me, lesson, isLockedForMe, lessonStatus, setLessonProgress]);

  if (!lesson) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('hubNotFound')}</p>
        <Link to={backHref} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          <ArrowLeft size={14} /> {t('hubBackToLessons')}
        </Link>
      </div>
    );
  }

  if (isLockedForMe) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">🔒 {t('hubLockedTitle')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('hubLockedSub')}</p>
        <Link to={backHref} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          <ArrowLeft size={14} /> {t('hubBackToLessons')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {justCompleted && (
        <div className="flex items-center gap-3 rounded-xl border border-active/20 bg-active/5 p-4 shadow-card">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div>
            <p className="font-display text-base font-bold text-ink">{t('hubJustCompletedTitle')}</p>
            <p className="text-xs text-ink/60">{t('hubJustCompletedSub')}</p>
          </div>
        </div>
      )}

      <header>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Link to={backHref} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
            <ArrowLeft size={13} /> {t('hubBackToLessons')}
          </Link>
          {navLessons.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink/60">
              <List size={13} className="text-brand-500" aria-hidden="true" />
              <select
                value={lesson.id}
                onChange={(e) => {
                  const target = navLessons.find((l) => l.id === Number(e.target.value));
                  if (target) goToLesson(target);
                }}
                className="input max-w-[220px] w-auto py-1 text-xs"
                aria-label={t('hubJumpToLesson')}
              >
                {navLessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.curriculum_lessons?.lesson_number != null ? `#${l.curriculum_lessons.lesson_number} · ` : ''}{translatedLessonTitle(t, l.curriculum_lessons?.lesson_number, l.topic)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-ink">
            {lessonNumber != null && <span className="text-ink/40">#{lessonNumber} · </span>}
            {translatedLessonTitle(t, lessonNumber, lesson.topic)}
          </h1>
          {lesson.level && <LevelBadge level={lesson.level} />}
          {isStudent && lessonStatus && lessonStatus !== 'locked' && (
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                lessonStatus === 'completed' ? 'bg-active/10 text-active' : lessonStatus === 'in_progress' ? 'bg-brand-50 text-brand-600' : 'bg-ink/5 text-ink/60'
              }`}
            >
              {lessonStatus === 'completed' ? <CheckCircle2 size={13} /> : lessonStatus === 'in_progress' ? <PlayCircle size={13} /> : null}
              {lessonStatus === 'completed' ? t('statusCompleted') : lessonStatus === 'in_progress' ? t('statusInProgress') : t('statusNotStarted')}
            </span>
          )}
        </div>
        {lesson.group_name && <p className="mt-1 text-sm text-ink/50">{lesson.group_name}</p>}

        {isStudent && me && !isLockedForMe && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {lessonStatus === 'completed' ? (
              <>
                <span className="flex items-center gap-1.5 rounded-lg bg-active/10 px-3 py-1.5 text-sm font-semibold text-active">
                  <CheckCircle2 size={15} /> {t('statusCompleted')}
                </span>
                <button
                  onClick={handleMarkInProgress}
                  className="flex items-center gap-1 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                >
                  <RotateCcw size={13} /> {t('hubMarkInProgress')}
                </button>
              </>
            ) : (
              <button
                onClick={handleMarkCompleted}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <CheckCircle2 size={15} /> {t('hubMarkCompleted')}
              </button>
            )}
          </div>
        )}

        {navLessons.length > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-white p-2 shadow-card">
            {prevLesson ? (
              <button onClick={() => goToLesson(prevLesson)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                <ChevronLeft size={15} /> {t('hubPrevious')}
              </button>
            ) : <span className="px-2" />}
            <span className="text-xs font-semibold text-ink/40">
              {navIndex + 1} / {navLessons.length}
            </span>
            {nextLesson ? (
              <button onClick={() => goToLesson(nextLesson)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                {t('hubNext')} <ChevronRight size={15} />
              </button>
            ) : <span className="px-2" />}
          </div>
        )}
      </header>

      {/* PDF */}
      <HubCard icon={FileText} title={t('hubPdfTitle')}>
        {pdfError && <p className="mb-2 text-xs font-semibold text-inactive">{pdfError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {lesson.pdf_path ? (
            <button
              onClick={handleOpenPdf}
              className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Download size={14} /> {lesson.pdf_name || t('hubOpenPdf')}
            </button>
          ) : (
            <p className="text-sm text-ink/40">{t('hubNoPdf')}</p>
          )}
          {!isStudent && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
                <Upload size={13} />
                {pdfUploading ? 'Uploading...' : lesson.pdf_path ? 'Replace PDF' : 'Upload PDF'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={pdfUploading}
                  onChange={(e) => handlePdfPick(e.target.files?.[0] || null)}
                />
              </label>
              {lesson.pdf_path && (
                <button onClick={handlePdfRemove} className="flex items-center gap-1 text-xs font-semibold text-inactive hover:underline">
                  <X size={13} /> Remove
                </button>
              )}
            </>
          )}
        </div>
      </HubCard>

      {/* Practice / Submit Your Work (Phase 1 foundation) */}
      {isStudent && me && (
        <HubCard icon={ImageIcon} title={t('hubPracticeTitle')}>
          {workError && <p className="mb-2 text-xs font-semibold text-inactive">{workError}</p>}
          {workLoading ? (
            <p className="text-sm text-ink/40">{t('hubLoading')}</p>
          ) : (
            <>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/60">
                <span>
                  {t('hubStatusLabel')}{' '}
                  {workSubmission?.status === 'reviewed'
                    ? t('hubStatusReviewed')
                    : workSubmission && workFiles.length > 0
                    ? t('hubStatusSubmitted')
                    : t('hubStatusNotSubmitted')}
                </span>
                {workSubmission?.points_awarded != null && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
                    {t('hubPointsAwarded', { points: workSubmission.points_awarded })}
                  </span>
                )}
              </p>
              {workSubmission?.feedback && (
                <p className="mb-2 text-xs text-ink/50">{t('hubFeedback', { feedback: workSubmission.feedback })}</p>
              )}

              {workFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {workFiles.map((f) => (
                    <div key={f.id} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-ink/10 bg-ink/5">
                      <button
                        onClick={async () => {
                          const url = await getAttachmentUrl(f.file_url);
                          if (url) window.open(url, '_blank', 'noopener');
                        }}
                        className="flex h-full w-full items-center justify-center"
                        aria-label={f.file_name || t('hubViewImage')}
                      >
                        <ImageIcon size={20} className="text-ink/40" />
                      </button>
                      {workSubmission?.status !== 'reviewed' && (
                        <button
                          onClick={() => handleRemoveWorkFile(f.id)}
                          className="absolute right-0.5 top-0.5 rounded bg-white/90 p-0.5 text-inactive opacity-0 group-hover:opacity-100"
                          aria-label={t('hubRemoveImage')}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {workPending.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {workPending.map((item, i) => (
                    <div key={item.previewUrl} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-ink/10">
                      <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => handleRemoveWorkPending(i)}
                        className="absolute right-0.5 top-0.5 rounded bg-white/90 p-0.5 text-inactive opacity-0 group-hover:opacity-100"
                        aria-label={t('hubRemoveSelectedImage')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {workSubmission?.status !== 'reviewed' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
                    <Upload size={13} /> {t('hubSelectImages')}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={workFiles.length + workPending.length >= MAX_WORK_IMAGES}
                      onChange={(e) => {
                        handlePickWorkFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {workPending.length > 0 && (
                    <button
                      onClick={handleSubmitWork}
                      disabled={workUploading}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {workUploading ? t('hubSubmitting') : t('hubSubmit')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </HubCard>
      )}

      {/* Lesson Practice review (teacher/admin, Phase 2) */}
      {!isStudent && (
        <HubCard
          icon={ImageIcon}
          title={`Lesson Practice${workSubmissions.length > 0 ? ` · ${workSubmissions.length}/${lessonRoster.length} submissions` : ''}`}
          action={
            <button
              onClick={() => setWorkReviewExpanded((v) => !v)}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              {workReviewExpanded ? 'Hide' : 'Review'}
            </button>
          }
        >
          {reviewMessage && <p className="mb-2 text-xs font-semibold text-ink/60">{reviewMessage}</p>}
          {workReviewExpanded ? (
            <LessonWorkReviewRoster
              students={lessonRoster}
              submissionOf={workSubmissionOf}
              filesOf={workFilesOf}
              onOpenFile={handleOpenAnswerFile}
              onMarkReviewed={handleMarkLessonWorkReviewed}
              onAwardPoints={handleAwardLessonWorkPoints}
              defaultPoints={lessonWorkCategory?.default_points ?? 5}
            />
          ) : (
            <p className="text-sm text-ink/40">
              {workSubmissions.length === 0 ? 'No submissions yet.' : 'Click Review to see student photos and award points.'}
            </p>
          )}
        </HubCard>
      )}

      {/* Homework */}
      <HubCard
        icon={BookOpen}
        title={t('hubHomeworkTitle')}
        action={
          !isStudent && (
            <button
              onClick={() => (hwFormOpen ? resetHwForm() : setHwFormOpen(true))}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus size={13} /> Add homework
            </button>
          )
        }
      >
        {hwFormOpen && (
          <form onSubmit={handleHwSubmit} className="mb-3 grid gap-2 rounded-lg border border-ink/10 p-3 sm:grid-cols-2">
            <input required placeholder="Title" value={hwForm.title} onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })} className="input sm:col-span-2" />
            <textarea placeholder="Description (optional)" rows={2} value={hwForm.description} onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })} className="input sm:col-span-2" />
            <input required type="date" value={hwForm.due_date} onChange={(e) => setHwForm({ ...hwForm, due_date: e.target.value })} className="input" />
            <div className="flex gap-2">
              <button type="submit" disabled={hwSaving} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {hwSaving ? 'Saving...' : hwEditingId ? 'Save changes' : 'Add'}
              </button>
              {hwEditingId && (
                <button type="button" onClick={resetHwForm} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink/60">Cancel</button>
              )}
            </div>
          </form>
        )}

        {lessonHomework.length === 0 ? (
          <p className="text-sm text-ink/40">{t('hubNoHomework')}</p>
        ) : (
          <div className="space-y-2">
            {lessonHomework.map((h) => {
              const status = isStudent ? myHwStatus(h.id) : null;
              const graded = status?.score != null;
              return (
                <div key={h.id} className="rounded-lg border border-ink/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{h.title}</p>
                      <p className="text-xs text-ink/50">{t('hubDue', { date: h.due_date })}</p>
                      {h.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{h.description}</p>}
                    </div>
                    {!isStudent ? (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button onClick={() => startHwEdit(h)} className="rounded p-1 text-brand-600 hover:bg-brand-50" aria-label="Edit homework"><Pencil size={14} /></button>
                        <button onClick={() => setDeletingHomework(h)} className="rounded p-1 text-inactive hover:bg-inactive/10" aria-label="Delete homework"><Trash2 size={14} /></button>
                      </div>
                    ) : (
                      graded && <p className="flex-shrink-0 text-sm font-bold text-brand-600">{status.score}/100</p>
                    )}
                  </div>
                  {isStudent && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/40">
                        {graded ? t('hubHwGraded') : myHwFilesCount(h.id) > 0 ? t('hubHwAwaitingGrading') : t('hubHwNotSubmitted')}
                      </span>
                      {status?.feedback && <span className="text-xs text-ink/60">{status.feedback}</span>}
                      {!graded && (
                        <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                          <Upload size={12} /> {hwUploading === h.id ? t('hubUploading') : t('hubSubmit')}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={hwUploading === h.id}
                            onChange={(e) => handleHwFilePick(h.id, e.target.files?.[0] || null)}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isStudent && lessonHomework.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
            {lessonHomework.map((h) => {
              const key = `hw-${h.id}`;
              const expanded = !!expandedGrading[key];
              return (
                <div key={key}>
                  <button
                    onClick={() => toggleGrading(key)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold text-ink/60 hover:text-ink"
                  >
                    <span>{h.title} &middot; {hwSubmittedCount(h.id)}/{lessonRoster.length} submissions</span>
                    <span className="text-brand-600">{expanded ? 'Hide grading ▲' : 'Grade ▼'}</span>
                  </button>
                  {expanded && (
                    <div className="mt-2">
                      <HomeworkGradingRoster
                        students={lessonRoster}
                        statusOf={(studentId) => hwStatusOf(h.id, studentId)}
                        filesOf={(studentId) => hwFilesOf(h.id, studentId)}
                        gradingStateOf={(studentId) => hwGradingStateOf(h.id, studentId)}
                        onOpenFile={handleOpenAnswerFile}
                        onSetStatus={(studentId, status, score, feedback) => setHomeworkStatusForStudent(h.id, studentId, status, score, feedback)}
                        statusLabels={HW_STATUS_LABELS}
                        t={gradeT}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </HubCard>

      {/* Vocabulary */}
      <HubCard
        icon={Languages}
        title={vocabWords.length ? t('hubVocabularyTitleCount', { count: vocabWords.length }) : t('hubVocabularyTitle')}
        action={
          <Link
            to={isStudent ? `/my-vocabulary?lesson=${lessonId}` : '/vocabulary'}
            className="flex items-center gap-1 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
          >
            {isStudent ? t('hubStudyVocabulary') : t('hubManageVocabulary')}
          </Link>
        }
      >
        {vocabLoading ? (
          <p className="text-sm text-ink/40">{t('hubLoading')}</p>
        ) : vocabWords.length === 0 ? (
          <p className="text-sm text-ink/40">{t('hubNoVocabulary')}</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {vocabWords.slice(0, 6).map((w) => (
              <li key={w.id} className="truncate text-sm text-ink/70">
                <span className="font-semibold text-ink">{w.english}</span> — {w.uzbek}
              </li>
            ))}
          </ul>
        )}
      </HubCard>

      {/* Quiz */}
      <HubCard
        icon={FileCheck2}
        title={t('hubQuizTitle')}
        action={
          !isStudent && (
            <button
              onClick={() => (quizFormOpen ? resetQuizForm() : setQuizFormOpen(true))}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus size={13} /> Add quiz
            </button>
          )
        }
      >
        {quizFormOpen && (
          <form onSubmit={handleQuizSubmit} className="mb-3 grid gap-2 rounded-lg border border-ink/10 p-3 sm:grid-cols-2">
            <input required placeholder="Title" value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} className="input sm:col-span-2" />
            <textarea placeholder="Description (optional)" rows={2} value={quizForm.description} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} className="input sm:col-span-2" />
            <input required type="date" value={quizForm.exam_date} onChange={(e) => setQuizForm({ ...quizForm, exam_date: e.target.value })} className="input" />
            <input required type="number" min="1" placeholder="Max score" value={quizForm.max_score} onChange={(e) => setQuizForm({ ...quizForm, max_score: e.target.value })} className="input" />
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={quizSaving} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {quizSaving ? 'Saving...' : quizEditingId ? 'Save changes' : 'Add'}
              </button>
              {quizEditingId && (
                <button type="button" onClick={resetQuizForm} className="rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold text-ink/60">Cancel</button>
              )}
            </div>
          </form>
        )}

        {lessonQuizzes.length === 0 ? (
          <p className="text-sm text-ink/40">{t('hubNoQuiz')}</p>
        ) : (
          <div className="space-y-2">
            {lessonQuizzes.map((ex) => {
              const result = isStudent ? myQuizScore(ex.id) : null;
              const graded = result?.score != null;
              return (
                <div key={ex.id} className="rounded-lg border border-ink/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {(ex.exam_type === 'Written' || ex.exam_type === 'Oral') && `${examTypeIcon(ex.exam_type)} `}
                        {ex.title}
                      </p>
                      <p className="text-xs text-ink/50">{t('hubQuizMeta', { date: ex.exam_date, max: ex.max_score })}</p>
                      {ex.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{ex.description}</p>}
                    </div>
                    {!isStudent ? (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button onClick={() => startQuizEdit(ex)} className="rounded p-1 text-brand-600 hover:bg-brand-50" aria-label="Edit quiz"><Pencil size={14} /></button>
                        <button onClick={() => setDeletingQuiz(ex)} className="rounded p-1 text-inactive hover:bg-inactive/10" aria-label="Delete quiz"><Trash2 size={14} /></button>
                      </div>
                    ) : (
                      graded && <p className="flex-shrink-0 text-sm font-bold text-brand-600">{result.score}/{ex.max_score}</p>
                    )}
                  </div>
                  {isStudent && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/40">
                        {graded ? t('hubQuizCompleted') : result?.answer_file_url ? t('hubQuizAwaitingGrading') : t('hubQuizAvailable')}
                      </span>
                      {result?.feedback && <span className="text-xs text-ink/60">{result.feedback}</span>}
                      {!graded && (
                        <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                          <Upload size={12} /> {quizUploading === ex.id ? t('hubUploading') : t('hubStartQuiz')}
                          <input
                            type="file"
                            className="hidden"
                            disabled={quizUploading === ex.id}
                            onChange={(e) => handleQuizFilePick(ex.id, e.target.files?.[0] || null)}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!isStudent && lessonQuizzes.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
            {lessonQuizzes.map((ex) => {
              const key = `ex-${ex.id}`;
              const expanded = !!expandedGrading[key];
              return (
                <div key={key}>
                  <button
                    onClick={() => toggleGrading(key)}
                    className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold text-ink/60 hover:text-ink"
                  >
                    <span>{ex.title} &middot; {examSubmittedCount(ex.id)}/{lessonRoster.length} submissions</span>
                    <span className="text-brand-600">{expanded ? 'Hide grading ▲' : 'Grade ▼'}</span>
                  </button>
                  {expanded && (
                    <div className="mt-2">
                      <ExamGradingRoster
                        examMaxScore={ex.max_score}
                        students={lessonRoster}
                        answerOf={(studentId) => examAnswerOf(ex.id, studentId)}
                        onOpenFile={handleOpenAnswerFile}
                        onSetScore={(studentId, score, feedback) => setExamScoreForStudent(ex.id, studentId, score, feedback)}
                        t={gradeT}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </HubCard>

      {/* Notes */}
      <HubCard
        icon={StickyNote}
        title={t('hubNotesTitle')}
        action={
          !isStudent && !notesEditing && (
            <button onClick={startNotesEdit} className="flex items-center gap-1 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
              <Pencil size={13} /> Edit
            </button>
          )
        }
      >
        {notesEditing ? (
          <div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={5}
              placeholder="Lesson summary, teacher notes, extra resources..."
              className="input w-full"
            />
            <div className="mt-2 flex gap-2">
              <button onClick={handleNotesSave} disabled={notesSaving} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {notesSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setNotesEditing(false)} className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/60">Cancel</button>
            </div>
          </div>
        ) : lesson.notes ? (
          <p className="whitespace-pre-wrap text-sm text-ink/70">{lesson.notes}</p>
        ) : (
          <p className="text-sm text-ink/40">{t('hubNoNotes')}</p>
        )}
      </HubCard>

      {deletingHomework && (
        <ConfirmDialog
          title="Delete homework"
          message={`Delete "${deletingHomework.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleHwDelete}
          onCancel={() => setDeletingHomework(null)}
        />
      )}
      {deletingQuiz && (
        <ConfirmDialog
          title="Delete quiz"
          message={`Delete "${deletingQuiz.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleQuizDelete}
          onCancel={() => setDeletingQuiz(null)}
        />
      )}
      {viewPdf && (
        <PdfViewer
          path={viewPdf.pdf_path}
          fileName={viewPdf.pdf_name}
          initialPage={isStudent && me ? progressByNum[lessonNumber]?.last_page || 1 : 1}
          onPageChange={persistPage}
          onClose={() => setViewPdf(null)}
        />
      )}
    </div>
  );
}
