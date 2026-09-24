// MyHomework.jsx - premium student homework portal
// Preserves authoritative backend: useAcademy (level filter, homeworkStatus/homeworkSubmissionFiles/lessons),
// storageBridge via getAttachmentUrl (viewing existing files), removeMyHomeworkSubmissionFile.
// Homework points remain MANUAL only (score/feedback rendered, never auto-awarded).
// Adds: 6-stage status mapping, progress indicators, valid/invalid submission distinction,
// premium empty state, 320px+ mobile, motion-safe animations, >=44px tap targets.

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, Download, MessageSquare, X, Image as ImageIcon,
  Clock, CheckCircle2, AlertCircle, Award, FileText, Sparkles,
  PenTool, Target, ChevronRight, Lock, Languages, Gamepad2, Swords, RefreshCw,
} from 'lucide-react';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber,
  lessonStatusFor, translatedLessonTitle,
} from '../../../lib/lessonLogic';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { levelToken } from '../../../lib/levels';
import {
  listHomeworkStages,
  getHomeworkStageProgress,
} from '../../../lib/db';
import { getAttachmentUrl } from '../../../lib/db';
import LessonSectionTabs from '../../../components/lesson/LessonSectionTabs';
import HomeworkStages from '../components/HomeworkStages';
import { HOMEWORK_PAGE_SIZE, paginate, pageRangeLabel } from '../homeworkListPaging';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';

const PILL_TONE = { graded: 'brand', awaitingGrading: 'success', notSubmitted: 'neutral' };

// 6-stage journey labels — derived from authoritative fields (score/feedback/status/files)
// without inventing new writes. Ranges kept read-only.
function deriveJourney(status, hasSubmission, graded) {
  const raw = String(status?.status || '').toLowerCase();
  if (graded) {
    const fb = String(status?.feedback || '').toLowerCase();
    const needsFix = raw.includes('needs') || raw.includes('correction') || fb.includes('correction') || fb.includes('revise') || (status?.score != null && status.score < 60);
    if (needsFix) return { key: 'needsCorrection', tone: 'danger', labelKey: 'needsCorrection' };
    if (status?.score >= 85) return { key: 'completed', tone: 'brand', labelKey: 'completed' };
    return { key: 'approved', tone: 'success', labelKey: 'approved' };
  }
  if (hasSubmission) {
    if (raw.includes('review') || raw.includes('checking')) return { key: 'underReview', tone: 'info', labelKey: 'underReview' };
    return { key: 'submitted', tone: 'success', labelKey: 'submittedLabel' };
  }
  return { key: 'notSubmitted', tone: 'neutral', labelKey: 'notSubmitted' };
}

export default function MyHomework() {
  const { t } = useTranslation(['homework', 'common', 'portal']);
  const {
    students, homework, homeworkStatus, homeworkSubmissionFiles, lessons,
    curriculumProgress, lessonProgress,
    removeMyHomeworkSubmissionFile, loading, error: loadError, setError, reloadAll,
    refreshHomeworkStatus,
  } = useAcademy();
  const { me } = useAcademy(); // single source, no fallback
  const [actionError, setActionError] = useState(null);
  const [activeHomeworkStage, setActiveHomeworkStage] = useState(null);
  const [retrying, setRetrying] = useState(false);
  // Expanded teacher-assignment card (details) and open interactive flow.
  // Separate states: details is for reading (description/files/feedback),
  // flow mounts HomeworkStages which loads its own questions on demand.
  const [teacherDetailsHwId, setTeacherDetailsHwId] = useState(null);
  const [teacherFlowHwId, setTeacherFlowHwId] = useState(null);
  // Lightweight per-homework stage counts (done/total only, no questions)
  // fetched lazily on first open - never prefetched for the whole list.
  const [teacherSummary, setTeacherSummary] = useState({});
  // Visible window into the lesson-hub list (presentation only).
  const [lessonRangeIdx, setLessonRangeIdx] = useState(0);
  // Entrance stagger is decorative - reduced-motion users get a stable list.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cardAnimation = (idx, cap = 200) =>
    prefersReducedMotion ? undefined : { animation: 'slideUp 0.35s ease-out both', animationDelay: `${Math.min(idx * 40, cap)}ms` };
  // Per-lesson four-stage progress summaries (read-only prefetch so cards
  // show overall progress without expanding every accordion).
  const [lessonStageProgress, setLessonStageProgress] = useState({});

  // Teacher-assigned rows only: standard lesson-homework rows carry a
  // lesson_id and live in the lesson-hub section (never duplicated here).
  const myHomework = useMemo(() => {
    if (!me) return [];
    return [...homework]
      .filter((h) => !h.lesson_id && (!h.level || h.level === me.level))
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  }, [homework, me]);

  const statusFor = (homeworkId) => homeworkStatus.find((s) => s.homework_id === homeworkId && s.student_id === me?.id);
  const submittedFilesFor = (homeworkId) =>
    homeworkSubmissionFiles.filter((f) => f.homework_id === homeworkId && f.student_id === me?.id).sort((a, b) => a.position - b.position);
  const lessonOf = (lessonId) => (lessonId ? lessons.find((l) => l.id === lessonId) : null);

  const pillOf = (status, homeworkId) => {
    if (status?.score != null) return 'graded';
    if (status?.answer_file_url || submittedFilesFor(homeworkId).length > 0) return 'awaitingGrading';
    return 'notSubmitted';
  };

  const isOverdue = (dueDateStr) => {
    if (!dueDateStr) return false;
    const [y, m, d] = dueDateStr.split('-').map(Number);
    if (!y || !m || !d) return false;
    const due = new Date(y, m - 1, d);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return todayLocal > due;
  };

  // --- Lesson homework (derived, no new rows) ---------------------------
  // One homework hub per lesson the student can see — same scope, order,
  // and unlock rules as MyLessons (lessonLogic.js). Standard lesson
  // homework is therefore automatically available without any per-student
  // teacher assignment; teacher-assigned rows (myHomework above) stay a
  // separate section below for special assignments.
  const lessonPace = teacherPaceFor(curriculumProgress, me?.level);
  const lessonCap = lessonCapFor(curriculumProgress, me?.level);
  const lessonItems = useMemo(() => {
    if (!me) return [];
    return [...lessons]
      .filter((l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level)
      .sort((a, b) => {
        const an = a.curriculum_lessons?.lesson_number;
        const bn = b.curriculum_lessons?.lesson_number;
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [lessons, me]);
  // Paginated window into the sequential lesson list (10 hubs at a time).
  // Slice-only: statuses, progress, grading, and unlock rules all read the
  // full lessonItems array and are unaffected by the visible window.
  const lessonRange = paginate(lessonItems, lessonRangeIdx, HOMEWORK_PAGE_SIZE);
  const visibleLessonItems = lessonRange.items;
  const lessonProgressByNum = useMemo(
    () => progressByLessonNumber(lessonProgress, lessonItems),
    [lessonProgress, lessonItems]
  );
  const lessonHwStatus = (lesson) => lessonStatusFor(lesson, lessonPace, lessonProgressByNum, lessonCap);
  const linkedHomeworkFor = (lessonId) =>
    homework.filter((h) => h.lesson_id === lessonId && (!h.level || h.level === me?.level));
  // The standard (reusable, non-assignment) homework row for a lesson, if seeded.
  const standardHomeworkFor = (lessonId) => linkedHomeworkFor(lessonId)[0] || null;
  const lessonTitleOf = (lesson) =>
    translatedLessonTitle(t, lesson.curriculum_lessons?.lesson_number, lesson.topic || lesson.curriculum_lessons?.title || '');
  const vocabCountOf = (lesson) => lesson.lesson_vocabulary?.[0]?.count ?? 0;

  const handleOpenFile = async (path) => {
    setActionError(null);
    try {
      const url = await getAttachmentUrl(path);
      if (url) window.open(url, '_blank', 'noopener');
      else setActionError(t('openFileFailed'));
    } catch { setActionError(t('openFileFailed')); }
  };

  const handleRemoveSubmitted = async (id) => {
    setActionError(null);
    try { await removeMyHomeworkSubmissionFile(id); } catch { setActionError(t('removeImageFailed')); }
  };

  // overview stats
  const stats = useMemo(() => {
    let submitted = 0; let graded = 0;
    for (const h of myHomework) {
      const s = statusFor(h.id);
      const hasSub = Boolean(s?.answer_file_url) || submittedFilesFor(h.id).length > 0;
      if (hasSub) submitted += 1;
      if (s?.score != null) graded += 1;
    }
    const total = myHomework.length;
    const remaining = Math.max(0, total - submitted);
    return { total, submitted, graded, remaining };
  }, [myHomework, homeworkStatus, homeworkSubmissionFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const completionPct = stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0;

  // Lazy lightweight stage counts for ONE teacher assignment (done/total
  // only - questions stay unloaded until HomeworkStages mounts on open).
  // Results are cached, so reopening is free. Failures stay silent: the
  // slim indicator simply doesn't render.
  const ensureTeacherSummary = async (hwId) => {
    if (!me || teacherSummary[hwId]) return;
    try {
      const [stages, rows] = await Promise.all([
        listHomeworkStages(hwId),
        getHomeworkStageProgress(hwId, me.id),
      ]);
      const list = stages || [];
      const byId = {};
      for (const p of Array.isArray(rows) ? rows : []) {
        if (p && p.stage_id != null) byId[p.stage_id] = p;
      }
      const done = list.filter((s) => byId[s.id]?.status === 'completed').length;
      setTeacherSummary((prev) => ({ ...prev, [hwId]: { done, total: list.length } }));
    } catch { /* summary stays hidden */ }
  };

  const handleRetry = async () => {
    setRetrying(true);
    setError('');
    try { await reloadAll(); }
    catch { setError(t('loadFailed')); }
    finally { setRetrying(false); }
  };

  // Teacher-assignment stage data is intentionally NOT prefetched here:
  // collapsed cards need only status/progress/CTA state (already in
  // homeworkStatus), counts load via ensureTeacherSummary on first open,
  // and questions load inside HomeworkStages on mount.

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const loadLessonProgress = async () => {
      const items = lessonItems.map((l) => ({ lesson: l, hw: standardHomeworkFor(l.id) })).filter((x) => x.hw);
      const results = await Promise.all(items.map(async ({ lesson, hw }) => {
        try {
          const [stages, rows] = await Promise.all([
            listHomeworkStages(hw.id),
            getHomeworkStageProgress(hw.id, me.id),
          ]);
          const list = stages || [];
          const byId = {};
          for (const p of Array.isArray(rows) ? rows : []) {
            if (p && p.stage_id != null) byId[p.stage_id] = p;
          }
          const done = list.filter((s) => byId[s.id]?.status === 'completed').length;
          return [hw.id, { done, total: list.length }];
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const next = {};
      for (const r of results) {
        if (r) next[r[0]] = r[1];
      }
      setLessonStageProgress(next);
    };
    loadLessonProgress();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonItems, me, homework]);

  // Identity still resolving is not "not linked" - skeleton first, and a
  // failed load is an error screen with retry, never a false not-linked
  // state and never an empty list. A global error with homework already on
  // screen degrades to the banner instead of wiping the list.
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl min-w-0">
        <LessonSectionTabs />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (loadError && myHomework.length === 0 && lessonItems.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl min-w-0">
        <LessonSectionTabs />
        <div className="rounded-2xl border border-ink/[0.06] bg-white px-6 py-10 text-center shadow-card">
          <AlertCircle className="mx-auto text-inactive/60" size={24} aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink">{t('loadFailed')}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">{t('loadFailedHint')}</p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-white hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <RefreshCw size={12} aria-hidden="true" /> {t('common:tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <header className="mb-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('myTitle')}</h1>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('mySubtitle')}</p>
          </div>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:order-2">
            <div className="flex-1 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('portal:mpHomeworkProgress')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">
                {t('portal:mpFilterSubmitted')}: {stats.submitted} / {stats.total}
              </p>
            </div>
            <div className="flex-1 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('portal:mpFilterTodo')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink/60">
                {stats.remaining}
              </p>
            </div>
            <div className="flex-1 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('portal:mpFilterGraded')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-brand-600">
                {stats.graded}
              </p>
            </div>
          </div>
        </div>
      </header>

      <LessonSectionTabs />
      <ErrorBanner>{actionError}</ErrorBanner>

      {(
        <>
          {/* Standard lesson homework — one hub per lesson, derived from
              lessons (no assignment rows needed). Click a card to open the
              lesson hub with PDF, vocabulary, practice, and quiz. */}
          {lessonItems.length > 0 && (
            <section aria-label={t('homework:lessonHomeworkTitle')} className="mb-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight text-ink">{t('homework:lessonHomeworkTitle')}</h2>
                  <p className="mt-0.5 text-sm text-ink/55">{t('homework:lessonHomeworkSubtitle')}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100">
                    <BookOpen size={11} aria-hidden /> {t('homework:lessonModelNote')}
                  </p>
                </div>
                <Link to="/my-lessons" className="text-xs font-semibold text-brand-600 hover:underline">
                  {t('homework:allLessons')}
                </Link>
              </div>
              {lessonRange.totalPages > 1 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="hw-lesson-range" className="text-xs font-bold uppercase tracking-wide text-ink/40">
                    {t('homework:title')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setLessonRangeIdx(lessonRange.page - 1)}
                    disabled={lessonRange.page === 0}
                    aria-label={t('homework:rangePrev')}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-ink/10 bg-white px-3 text-base font-bold text-ink/70 shadow-sm hover:bg-ink/5 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <select
                    id="hw-lesson-range"
                    aria-label={t('homework:rangeLabel')}
                    value={lessonRange.page}
                    onChange={(e) => setLessonRangeIdx(Number(e.target.value))}
                    className="min-h-[44px] rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {Array.from({ length: lessonRange.totalPages }, (_, p) => {
                      const win = paginate(lessonItems, p, HOMEWORK_PAGE_SIZE);
                      return (
                        <option key={p} value={p}>
                          {pageRangeLabel(win.items, win.start)}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => setLessonRangeIdx(lessonRange.page + 1)}
                    disabled={lessonRange.page >= lessonRange.totalPages - 1}
                    aria-label={t('homework:rangeNext')}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-ink/10 bg-white px-3 text-base font-bold text-ink/70 shadow-sm hover:bg-ink/5 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {visibleLessonItems.map((l) => {
                  const num = l.curriculum_lessons?.lesson_number;
                  const lst = lessonHwStatus(l);
                  const locked = lst === 'locked';
                  const linked = linkedHomeworkFor(l.id);
                  const linkedDone = linked.filter((h) => {
                    const s = statusFor(h.id);
                    return s?.score != null || Boolean(s?.answer_file_url) || submittedFilesFor(h.id).length > 0;
                  }).length;
                  const vocabCount = vocabCountOf(l);
                  const standardHw = standardHomeworkFor(l.id);
                  return (
                    <article
                      key={l.id}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-card transition-shadow hover:shadow-[0_4px_24px_rgba(27,36,48,0.08)] ${locked ? 'border-ink/[0.06] opacity-90' : lst === LESSON_STATUS.COMPLETED ? 'border-active/20' : 'border-ink/[0.06]'}`}
                    >
                      <div className={`h-1 w-full ${lst === LESSON_STATUS.COMPLETED ? 'bg-active' : lst === LESSON_STATUS.IN_PROGRESS ? 'bg-brand-500' : 'bg-ink/5'}`} />
                      <div className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold ring-1 ${lst === LESSON_STATUS.COMPLETED ? 'bg-active/10 text-active ring-active/20' : locked ? 'bg-ink/5 text-ink/40 ring-ink/10' : 'bg-brand-50 text-brand-700 ring-brand-100'}`}>
                            {locked ? <Lock size={16} /> : (num ?? <BookOpen size={18} />)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link to={`/my-lessons/${l.id}`} className="break-words font-display text-[15px] font-bold leading-tight text-ink hover:text-brand-600 hover:underline sm:text-base">
                                {num != null ? `#${num} · ` : ''}{lessonTitleOf(l)}
                              </Link>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1 ${lst === LESSON_STATUS.COMPLETED ? 'bg-active/10 text-active ring-active/20' : lst === LESSON_STATUS.IN_PROGRESS ? 'bg-brand-50 text-brand-700 ring-brand-100' : locked ? 'bg-ink/5 text-ink/50 ring-ink/10' : 'bg-ink/5 text-ink/60 ring-ink/10'}`}>
                                {lst === 'locked' ? t('homework:lhLocked') : lst === LESSON_STATUS.COMPLETED ? t('homework:lhCompleted') : lst === LESSON_STATUS.IN_PROGRESS ? t('homework:lhInProgress') : t('homework:lhNotStarted')}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
                              {vocabCount > 0 && (
                                <span className="inline-flex items-center gap-1"><Languages size={12} className="text-ink/30" />{t('homework:lhWords', { count: vocabCount })}</span>
                              )}
                              {linked.length > 0 && (
                                <span className="inline-flex items-center gap-1"><FileText size={11} className="text-ink/30" />{t('homework:lhAssignments', { done: linkedDone, total: linked.length })}</span>
                              )}
                            </div>
                            {(() => {
                              const prog = standardHw ? lessonStageProgress[standardHw.id] : null;
                              if (!prog || !prog.total) return null;
                              const complete = prog.done >= prog.total;
                              return (
                                <div
                                  className="mt-1.5 flex items-center gap-1.5"
                                  role="img"
                                  aria-label={t('homework:stagesProgressLabel', { done: prog.done, total: prog.total })}
                                >
                                  <span className="flex items-center gap-1" aria-hidden>
                                    {Array.from({ length: prog.total }).map((_, i) => (
                                      <span
                                        key={i}
                                        className={`h-1.5 rounded-full ${i < prog.done ? 'w-5 bg-brand-500' : 'w-1.5 bg-ink/10'}`}
                                      />
                                    ))}
                                  </span>
                                  <span className={`text-[11px] font-bold tabular-nums ${complete ? 'text-active' : 'text-ink/45'}`}>
                                    {prog.done}/{prog.total}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          <Link to={`/my-lessons/${l.id}`} aria-label={t('homework:openLesson')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 text-ink/50 transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                            <ChevronRight size={16} />
                          </Link>
                        </div>
                        {!locked && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
                            {standardHw && (
                              <button
                                type="button"
                                onClick={() => setActiveHomeworkStage(activeHomeworkStage?.lessonId === l.id ? null : { lessonId: l.id, stageKey: undefined })}
                                aria-expanded={activeHomeworkStage?.lessonId === l.id}
                                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              >
                                {lst === LESSON_STATUS.COMPLETED ? t('ctaReview') : lst === LESSON_STATUS.IN_PROGRESS ? t('ctaContinue') : t('ctaStart')}
                              </button>
                            )}
                            <Link to={`/my-lessons/${l.id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                              <BookOpen size={13} /> {t('homework:openLesson')}
                            </Link>
                            {standardHw ? (
                              <>
                                {[
                                  { key: 'vocabulary', icon: Languages, label: t('homework:lhVocabulary'), tint: 'text-brand-500' },
                                  { key: 'grammar', icon: PenTool, label: t('homework:lhSentences'), tint: 'text-amber-500' },
                                  { key: 'practice', icon: Target, label: t('homework:lhQuizzes'), tint: 'text-emerald-500' },
                                  { key: 'review', icon: Sparkles, label: t('homework:lhReview'), tint: 'text-violet-500' },
                                ].map(({ key, icon: StageIcon, label, tint }) => {
                                  const isActive = activeHomeworkStage?.lessonId === l.id && activeHomeworkStage?.stageKey === key;
                                  return (
                                    <button
                                      key={key}
                                      onClick={() => setActiveHomeworkStage(isActive ? null : { lessonId: l.id, stageKey: key })}
                                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${isActive ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink/10 bg-white text-ink/70 hover:bg-ink/5'}`}
                                    >
                                      <StageIcon size={13} className={isActive ? undefined : tint} /> {label}
                                    </button>
                                  );
                                })}
                              </>
                            ) : (
                              <>
                                <Link to={`/my-vocabulary?lesson=${l.id}`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                                  <Languages size={13} /> {t('homework:lhVocabulary')}
                                </Link>
                                <Link to="/grammar-battle" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                                  <Swords size={13} /> {t('homework:lhGrammar')}
                                </Link>
                                <Link to="/games" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                                  <Gamepad2 size={13} /> {t('homework:lhPractice')}
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                             {!locked && standardHw && activeHomeworkStage?.lessonId === l.id && (
                               <div className="mt-3 border-t border-ink/5 pt-3">
                                 <HomeworkStages
                                   homeworkId={standardHw.id}
                                   studentId={me?.id}
                                   focusStageKey={activeHomeworkStage.stageKey}
                                   onFinalized={() => { refreshHomeworkStatus?.(); }}
                                 />
                               </div>
                             )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          {myHomework.length === 0 ? (
            lessonItems.length > 0 ? (
              <p className="rounded-xl border border-ink/[0.06] bg-white px-4 py-3 text-center text-xs text-ink/45 shadow-card">
                {t('homework:noTeacherHomework')}
              </p>
            ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="bg-gradient-to-br from-brand-50 via-white to-paper px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-ink/[0.06]">
              <Sparkles className="text-brand-500" size={22} aria-hidden="true" />
            </div>
            <h2 className="mx-auto mt-4 max-w-[28ch] font-display text-xl font-bold leading-tight text-ink">
              {t('portal:mpJourneyStart')}
            </h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">
              {t('portal:mpJourneyHint')}
            </p>
            <div className="mx-auto mt-6 flex max-w-[36ch] items-center justify-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2">
              <BookOpen size={14} className="text-brand-600" />
              <span className="text-xs font-semibold text-brand-700">{t('portal:mpNoHomeworkAssigned')}</span>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"><FileText size={12} /> {t('portal:mpPdfIncluded')}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink/60"><Award size={12} /> {t('portal:mpManualGrading')}</span>
            </div>
          </div>
          <div className="grid gap-0 border-t border-ink/5 bg-paper/60 sm:grid-cols-3">
            {[
              { n: '01', t2: 'Download', d: 'Open the lesson PDF' },
              { n: '02', t2: 'Submit', d: 'Complete your assignment' },
              { n: '03', t2: 'Feedback', d: 'Teacher points & notes' },
            ].map((s) => (
              <div key={s.n} className="px-6 py-4 text-center sm:border-r sm:border-ink/5 sm:last:border-0">
                <p className="font-display text-xs font-bold tracking-widest text-brand-600">{s.n}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{s.t2}</p>
                <p className="text-xs text-ink/45">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
          )
        ) : (
        <>
          <div className="mb-3">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">{t('homework:teacherHomeworkTitle')}</h2>
            <p className="mt-0.5 text-sm text-ink/55">{t('homework:teacherHomeworkSubtitle')}</p>
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1 text-[11px] font-semibold text-ink/60 ring-1 ring-ink/10">
              <Award size={11} aria-hidden /> {t('homework:teacherModelNote')}
            </p>
          </div>
          <div className="space-y-3">
            {myHomework.map((h, idx) => {
              const status = statusFor(h.id) || { status: 'Assigned' };
              const graded = status.score != null;
              const pill = pillOf(status, h.id);
              const overdue = isOverdue(h.due_date);
              const lesson = lessonOf(h.lesson_id);
              const submittedFiles = submittedFilesFor(h.id);
              const hasSubmission = submittedFiles.length > 0 || Boolean(status.answer_file_url);
              const journey = deriveJourney(status, hasSubmission, graded);
              // Primary CTA label from journey state: Start (nothing yet),
              // Continue (work in flight or needs correction), Review (graded).
              const ctaLabel = journey.key === 'notSubmitted' ? t('ctaStart') : journey.key === 'needsCorrection' ? t('ctaContinue') : graded ? t('ctaReview') : t('ctaContinue');
              const flowOpen = teacherFlowHwId === h.id;
              const detailsOpen = teacherDetailsHwId === h.id;
              const isValidSubmission = hasSubmission && submittedFiles.length > 0;
              const isInvalidSubmission = hasSubmission && submittedFiles.length === 0 && Boolean(status.answer_file_url);

              return (
                <article
                  key={h.id}
                  className={`group min-w-0 overflow-hidden rounded-2xl border bg-white shadow-card transition-shadow hover:shadow-[0_4px_24px_rgba(27,36,48,0.08)] ${overdue && !graded ? 'border-inactive/20' : 'border-ink/[0.06]'}`}
                  style={cardAnimation(idx)}
                >
                  {/* top accent for overdue/graded */}
                  <div className={`h-1 w-full ${graded ? 'bg-brand-500' : hasSubmission ? 'bg-active' : overdue ? 'bg-inactive' : 'bg-ink/5'}`} />

                  <div className="p-3 sm:p-4">
                    {/* header row */}
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${graded ? 'bg-brand-50 text-brand-600 ring-brand-100' : hasSubmission ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-paper text-ink/40 ring-ink/5'}`}>
                        {graded ? <Award size={18} aria-hidden="true" /> : hasSubmission ? <CheckCircle2 size={18} aria-hidden="true" /> : <BookOpen size={18} aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{h.title}</h3>
                          {/* prominent status badge using granular journey status */}
                          <StatusPill tone={journey.tone}>
                            {journey.key === 'notSubmitted' ? t('portal:mpNotSubmitted') :
                             journey.key === 'submitted' ? t('portal:mpFilterSubmitted') :
                             journey.key === 'underReview' ? t('portal:mpJourneyReviewing') :
                             journey.key === 'needsCorrection' ? t('portal:mpJourneyNeedsCorrection') :
                             journey.key === 'approved' ? t('portal:mpJourneyGreatWork') :
                             t('portal:mpJourneyCompleted')}
                          </StatusPill>
                          {graded && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                              <Award size={10} /> {t('scoreOutOf', { score: status.score })}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-ink/30" aria-hidden="true" />
                            {overdue ? (
                              <span className="font-semibold text-inactive">{t('dueDateOverdue', { date: h.due_date })}</span>
                            ) : (
                              <span>{t('due', { date: h.due_date })}</span>
                            )}
                          </span>
                          {lesson ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-medium text-ink/60">
                              <FileText size={11} aria-hidden="true" /> {t('portal:mpLessonShort', { number: lesson.curriculum_lessons?.lesson_number ?? '·', topic: lesson.topic })}
                            </span>
                          ) : h.lesson_id ? (
                            <span className="text-ink/30">{t('noLinkedLesson')}</span>
                          ) : null}
                          {h.level && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{levelToken(h.level)}</span>}
                        </div>

                        {/* lesson PDF meta */}
                        {lesson?.pdf_path && (
                          <p className="mt-1 text-xs text-ink/40">{t('portal:mpLessonPdfHint', { topic: lesson.topic })}</p>
                        )}
                      </div>
                    </div>

                      {/* requirement (details only) */}
                      {detailsOpen && h.description && (
                       <div className="mt-3 rounded-xl border border-ink/[0.06] bg-paper/60 px-3 py-2.5">
                         <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">What to do</p>
                         <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{h.description}</p>
                       </div>
                     )}
                      {/* Lesson PDF hint — make action explicit (details only) */}
                       {detailsOpen && lesson?.pdf_path && !graded && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5">
                          <FileText size={14} className="shrink-0 text-brand-600" />
                          <p className="text-xs font-medium leading-relaxed text-brand-800">{t('portal:mpLessonPdfHint', { topic: lesson.topic })} — download the PDF and complete it by hand.</p>
                        </div>
                      )}

                    {/* slim stage progress (lazy counts only) + primary CTA */}
                    {(() => {
                      const prog = teacherSummary[h.id];
                      if (!prog || !prog.total) return null;
                      const complete = prog.done >= prog.total;
                      return (
                        <div
                          className="mt-1.5 flex items-center gap-1.5"
                          role="img"
                          aria-label={t('stagesProgressLabel', { done: prog.done, total: prog.total })}
                        >
                          <span className="flex items-center gap-1" aria-hidden="true">
                            {Array.from({ length: prog.total }).map((_, i) => (
                              <span
                                key={i}
                                className={`h-1.5 rounded-full ${i < prog.done ? 'w-5 bg-brand-500' : 'w-1.5 bg-ink/10'}`}
                              />
                            ))}
                          </span>
                          <span className={`text-[11px] font-bold tabular-nums ${complete ? 'text-active' : 'text-ink/45'}`}>
                            {prog.done}/{prog.total}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const open = !flowOpen;
                          setTeacherFlowHwId(open ? h.id : null);
                          if (open) ensureTeacherSummary(h.id);
                        }}
                        aria-expanded={flowOpen}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {flowOpen ? t('lhHideQA') : ctaLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const open = !detailsOpen;
                          setTeacherDetailsHwId(open ? h.id : null);
                          if (open) ensureTeacherSummary(h.id);
                        }}
                        aria-expanded={detailsOpen}
                        className="inline-flex min-h-[44px] items-center rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {detailsOpen ? t('detailsHide') : t('detailsShow')}
                      </button>
                      <Link
                        to={`/chat?type=homework&id=${h.id}`}
                        className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <MessageSquare size={14} aria-hidden="true" /> {t('discuss')}
                      </Link>
                    </div>

                    {/* interactive stage flow - mounts on open and loads its
                        own questions; Vocabulary → Sentences → Tests → Review
                        with existing locking and auto-advance. Opening it is
                        the Submit action: nothing is finalized here. */}
                    {flowOpen && (
                      <div className="mt-3 border-t border-ink/5 pt-3">
                        <HomeworkStages
                          homeworkId={h.id}
                          studentId={me?.id}
                          onFinalized={() => { refreshHomeworkStatus?.(); }}
                        />
                      </div>
                    )}

                  {/* stage content lives in the interactive flow above (mounted on open) - no read-only duplicate here */}

                  {detailsOpen && (
                  <>
                   {/* submission summary + valid/invalid */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                       <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ring-1 ${hasSubmission ? (isValidSubmission ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-200') : 'bg-ink/5 text-ink/50 ring-ink/10'}`}>
                         {hasSubmission ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                         {hasSubmission ? (submittedFiles.length > 0 ? t('portal:mpImagesSubmitted', { count: submittedFiles.length }) : t('portal:mpSubmissionOnFile')) : t('portal:mpNoSubmissionYet')}
                         {isInvalidSubmission && t('portal:mpLegacyFileOnly')}
                       </span>
                       {status.submitted_at && <span className="text-ink/40">{t('portal:mpSubmittedOn', { date: new Date(status.submitted_at).toLocaleDateString() })}</span>}
                       {hasSubmission && !graded && <span className="font-medium text-amber-700">{t('portal:mpJourneyReceived')}</span>}
                       {hasSubmission && graded && <span className="text-ink/30">{t('portal:mpValidSubmission')}</span>}
                       {!hasSubmission && overdue && <span className="font-semibold text-inactive">{t('portal:mpDeadlinePassedInline')}</span>}
                     </div>
                      {/* teacher feedback */}
                    {graded && status.feedback && (
                      <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700/70">{t('portal:teacherFeedbackLabel')}</p>
                        <p className="mt-1 text-sm leading-relaxed text-brand-800">{status.feedback}</p>
                        <p className="mt-2 text-[11px] font-medium text-brand-600/70">{t('portal:mpTeacherFeedbackHint')}</p>
                      </div>
                    )}

                    {overdue && !graded && (
                      <p className="mt-3 rounded-lg bg-inactive/5 px-3 py-2 text-xs font-semibold leading-relaxed text-inactive ring-1 ring-inactive/10">{t('deadlinePassedWarning')}</p>
                    )}

                    {submittedFiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {submittedFiles.map((f, i) => (
                          <span key={f.id} className="inline-flex items-center gap-1 rounded-xl border border-ink/10 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/70 shadow-sm">
                            <button onClick={() => handleOpenFile(f.file_url)} className="inline-flex items-center gap-1 hover:text-brand-600 hover:underline">
                              <ImageIcon size={12} /> {t('imageN', { n: i + 1 })}
                            </button>
                            {!graded && (
                              <button onClick={() => handleRemoveSubmitted(f.id)} aria-label={t('removeImage')} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-inactive">
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                    )}

                    {/* quiet secondary actions (details only) */}
                    {detailsOpen && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
                        {h.file_url && (
                          <button
                            onClick={() => handleOpenFile(h.file_url)}
                            className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Download size={14} className="shrink-0" aria-hidden="true" /> <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[240px]">{h.file_name || t('homeworkFileDefault')}</span>
                          </button>
                        )}
                        {status.answer_file_url && (
                          <button onClick={() => handleOpenFile(status.answer_file_url)} className="inline-flex min-h-[44px] items-center rounded-md px-3 py-2.5 text-xs font-medium text-ink/50 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1">
                            {t('viewMySubmission')}
                          </button>
                        )}
                        {lesson && (
                          <Link
                            to={`/my-lessons/${lesson.id}`}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <BookOpen size={14} aria-hidden="true" /> {t('homework:openLesson')}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
            )}
          </>
        )}
    </div>
  );
}
