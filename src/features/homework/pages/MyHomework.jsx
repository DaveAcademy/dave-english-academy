// MyHomework.jsx - premium student homework portal
// Preserves authoritative backend: useAcademy (level filter, homeworkStatus/homeworkSubmissionFiles/lessons),
// storageBridge via uploadAttachment/getAttachmentUrl, submitMyHomeworkFiles/removeMyHomeworkSubmissionFile.
// Homework points remain MANUAL only (score/feedback rendered, never auto-awarded).
// Adds: 6-stage status mapping, progress indicators, valid/invalid submission distinction,
// premium empty state, 320px+ mobile, motion-safe animations, >=44px tap targets.

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, Download, Upload, MessageSquare, X, Image as ImageIcon,
  Clock, CheckCircle2, AlertCircle, Award, FileText, Sparkles,
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { uploadAttachment, getAttachmentUrl } from '../../../lib/db';
import LessonSectionTabs from '../../../components/lesson/LessonSectionTabs';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';

const PILL_TONE = { graded: 'brand', awaitingGrading: 'success', notSubmitted: 'neutral' };
const MAX_IMAGES = 5;

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

const JOURNEY_ORDER = ['notSubmitted', 'submitted', 'underReview', 'approved', 'needsCorrection', 'completed'];

export default function MyHomework() {
  const { t } = useTranslation(['homework', 'common', 'portal']);
  const {
    students, homework, homeworkStatus, homeworkSubmissionFiles, lessons,
    submitMyHomeworkFiles, removeMyHomeworkSubmissionFile, loading,
  } = useAcademy();
  const { me } = useAcademy(); // single source, no fallback
  const [submittingId, setSubmittingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingByHomework, setPendingByHomework] = useState({});
  const pendingRef = useRef(pendingByHomework);
  pendingRef.current = pendingByHomework;

  useEffect(
    () => () => {
      Object.values(pendingRef.current).forEach((items) => items.forEach((i) => URL.revokeObjectURL(i.previewUrl)));
    },
    []
  );

  const myHomework = useMemo(() => {
    if (!me) return [];
    return [...homework]
      .filter((h) => !h.level || h.level === me.level)
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

  const handleOpenFile = async (path) => {
    setActionError(null);
    try {
      const url = await getAttachmentUrl(path);
      if (url) window.open(url, '_blank', 'noopener');
      else setActionError(t('openFileFailed'));
    } catch { setActionError(t('openFileFailed')); }
  };

  const clearPending = (homeworkId) => {
    setPendingByHomework((prev) => {
      (prev[homeworkId] || []).forEach((i) => URL.revokeObjectURL(i.previewUrl));
      const next = { ...prev };
      delete next[homeworkId];
      return next;
    });
  };

  const handlePickFiles = (homeworkId, fileList) => {
    const picked = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) return;
    const already = submittedFilesFor(homeworkId).length + (pendingByHomework[homeworkId] || []).length;
    const room = Math.max(0, MAX_IMAGES - already);
    const accepted = picked.slice(0, room);
    if (accepted.length < picked.length) setActionError(t('maxImagesReached', { max: MAX_IMAGES }));
    const withPreviews = accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPendingByHomework((prev) => ({ ...prev, [homeworkId]: [...(prev[homeworkId] || []), ...withPreviews] }));
  };

  const handleRemovePending = (homeworkId, index) => {
    setPendingByHomework((prev) => {
      const items = prev[homeworkId] || [];
      const removed = items[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return { ...prev, [homeworkId]: items.filter((_, i) => i !== index) };
    });
  };

  const handleUploadPending = async (homeworkId) => {
    const pending = pendingByHomework[homeworkId] || [];
    if (pending.length === 0 || !me) return;
    setSubmittingId(homeworkId);
    setActionError(null);
    const uploaded = [];
    let uploadFailed = false;
    for (const item of pending) {
      try {
        const result = await uploadAttachment(item.file, `homework-answers/${me.id}`);
        uploaded.push({ fileUrl: result.path, fileName: result.name, fileType: result.type });
      } catch { uploadFailed = true; break; }
    }
    if (uploaded.length > 0) {
      try {
        await submitMyHomeworkFiles(homeworkId, me.id, uploaded);
        clearPending(homeworkId);
        if (uploadFailed) setActionError(t('partialUploadFailed'));
      } catch { setActionError(t('submitAnswerFailed')); }
    } else setActionError(t('uploadFileFailed'));
    setSubmittingId(null);
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

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
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

      {loading ? (
        <SkeletonList count={3} />
      ) : myHomework.length === 0 ? (
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
              { n: '02', t2: 'Submit', d: 'Upload clear photos' },
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
      ) : (
        <>
          <div className="space-y-3">
            {myHomework.map((h, idx) => {
              const status = statusFor(h.id) || { status: 'Assigned' };
              const graded = status.score != null;
              const pill = pillOf(status, h.id);
              const overdue = isOverdue(h.due_date);
              const lesson = lessonOf(h.lesson_id);
              const pending = pendingByHomework[h.id] || [];
              const submittedFiles = submittedFilesFor(h.id);
              const hasSubmission = submittedFiles.length > 0 || Boolean(status.answer_file_url);
              const roomLeft = Math.max(0, MAX_IMAGES - submittedFiles.length - pending.length);
              const journey = deriveJourney(status, hasSubmission, graded);
              const curIndex = JOURNEY_ORDER.indexOf(journey.key);
              const isValidSubmission = hasSubmission && submittedFiles.length > 0;
              const isInvalidSubmission = hasSubmission && submittedFiles.length === 0 && Boolean(status.answer_file_url);

              return (
                <article
                  key={h.id}
                  className={`group overflow-hidden rounded-2xl border bg-white shadow-card transition-shadow hover:shadow-[0_4px_24px_rgba(27,36,48,0.08)] ${overdue && !graded ? 'border-inactive/20' : 'border-ink/[0.06]'}`}
                  style={{ animation: `slideUp 0.35s ease-out both`, animationDelay: `${Math.min(idx * 40, 200)}ms` }}
                >
                  {/* top accent for overdue/graded */}
                  <div className={`h-1 w-full ${graded ? 'bg-brand-500' : hasSubmission ? 'bg-active' : overdue ? 'bg-inactive' : 'bg-ink/5'}`} />

                  <div className="p-3 sm:p-4">
                    {/* header row */}
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${graded ? 'bg-brand-50 text-brand-600 ring-brand-100' : hasSubmission ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-paper text-ink/40 ring-ink/5'}`}>
                        {graded ? <Award size={18} /> : hasSubmission ? <CheckCircle2 size={18} /> : <BookOpen size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h2 className="break-words font-display text-[15px] font-bold leading-tight text-ink sm:text-base">{h.title}</h2>
                          {/* prominent status badge using granular journey status */}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ring-1 ${
                            journey.tone === 'brand' ? 'bg-brand-50 text-brand-700 ring-brand-100' :
                            journey.tone === 'success' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' :
                            journey.tone === 'danger' ? 'bg-red-50 text-red-600 ring-red-100' :
                            journey.tone === 'info' ? 'bg-sky-50 text-sky-700 ring-sky-100' :
                            'bg-ink/5 text-ink/60 ring-ink/10'
                          }`}>
                            {journey.key === 'notSubmitted' ? t('portal:mpNotSubmitted') :
                             journey.key === 'submitted' ? t('portal:mpFilterSubmitted') :
                             journey.key === 'underReview' ? t('portal:mpJourneyReviewing') :
                             journey.key === 'needsCorrection' ? t('portal:mpJourneyNeedsCorrection') :
                             journey.key === 'approved' ? t('portal:mpJourneyGreatWork') :
                             t('portal:mpJourneyCompleted')}
                          </span>
                          {graded && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                              <Award size={10} /> {t('scoreOutOf', { score: status.score })}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/50">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-ink/30" />
                            {overdue ? (
                              <span className="font-semibold text-inactive">{t('dueDateOverdue', { date: h.due_date })}</span>
                            ) : (
                              <span>{t('due', { date: h.due_date })}</span>
                            )}
                          </span>
                          {lesson ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 font-medium text-ink/60">
                              <FileText size={11} /> {t('portal:mpLessonShort', { number: lesson.curriculum_lessons?.lesson_number ?? '·', topic: lesson.topic })}
                            </span>
                          ) : h.lesson_id ? (
                            <span className="text-ink/30">{t('noLinkedLesson')}</span>
                          ) : null}
                          {h.level && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{h.level}</span>}
                        </div>

                        {/* lesson PDF meta */}
                        {lesson?.pdf_path && (
                          <p className="mt-1 text-xs text-ink/40">{t('portal:mpLessonPdfHint', { topic: lesson.topic })}</p>
                        )}
                      </div>
                    </div>

                     {/* requirement */}
                     {h.description && (
                       <div className="mt-3 rounded-xl border border-ink/[0.06] bg-paper/60 px-3 py-2.5">
                         <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">What to do</p>
                         <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{h.description}</p>
                       </div>
                     )}
                     {/* Lesson PDF hint — make action explicit */}
                     {lesson?.pdf_path && !graded && (
                       <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2.5">
                         <FileText size={14} className="shrink-0 text-brand-600" />
                         <p className="text-xs font-medium leading-relaxed text-brand-800">{t('portal:mpLessonPdfHint', { topic: lesson.topic })} — download the PDF, complete it by hand, then photograph every page.</p>
                       </div>
                     )}

                    {/* status journey */}
                    <div className="mt-3 rounded-xl bg-ink/[0.02] px-3 py-2.5 ring-1 ring-ink/[0.04]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpStatus')}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${journey.tone === 'brand' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : journey.tone === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : journey.tone === 'danger' ? 'bg-red-50 text-red-600 ring-1 ring-red-100' : journey.tone === 'info' ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' : 'bg-ink/5 text-ink/60'}`}>
                          {journey.key === 'notSubmitted' ? t('portal:mpNotSubmitted') : journey.key === 'submitted' ? t('portal:mpFilterSubmitted') : journey.key === 'underReview' ? t('portal:mpJourneyReviewing') : journey.key === 'needsCorrection' ? t('portal:mpJourneyNeedsCorrection') : journey.key === 'approved' ? t('portal:mpJourneyGreatWork') : t('portal:mpJourneyCompleted')}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        {JOURNEY_ORDER.map((k) => {
                          const i = JOURNEY_ORDER.indexOf(k);
                          const active = i <= curIndex;
                          const isCurrent = i === curIndex;
                          return (
                            <div key={k} className="flex flex-1 items-center gap-1">
                              <div className={`h-1.5 flex-1 rounded-full transition-colors ${active ? (journey.tone === 'danger' ? 'bg-inactive' : journey.tone === 'brand' ? 'bg-brand-500' : 'bg-active') : 'bg-ink/10'} ${isCurrent ? 'ring-2 ring-ink/10' : ''}`} />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink/50">
                        {journey.key === 'notSubmitted' && t('portal:mpJourneyUpload')}
                        {journey.key === 'submitted' && t('portal:mpJourneyReceived')}
                        {journey.key === 'underReview' && t('portal:mpJourneyReviewing')}
                        {journey.key === 'approved' && t('portal:mpJourneyGreatWork')}
                        {journey.key === 'needsCorrection' && t('portal:mpJourneyNeedsCorrection')}
                        {journey.key === 'completed' && t('portal:mpJourneyCompleted')}
                      </p>
                    </div>

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
                     {/* Photo quality guidance — compact, near upload */}
                     {!graded && (
                       <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                         <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800"><ImageIcon size={12} /> Photo tips — {t('portal:mpValidSubmission')}</p>
                         <ul className="mt-1.5 grid gap-1 text-xs leading-relaxed text-amber-900/80 sm:grid-cols-2">
                           <li>• Take clear, well-lit photos — avoid blur or shadows.</li>
                           <li>• Show the whole page — answers must be readable.</li>
                           <li>• Upload all pages of the completed lesson.</li>
                           <li>• Handwritten work only — don&apos;t screenshot the PDF.</li>
                           <li className="sm:col-span-2">• Up to {MAX_IMAGES} photos per homework — they stay together as one submission.</li>
                         </ul>
                       </div>
                     )}

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

                    {pending.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pending.map((item, i) => (
                          <div key={item.previewUrl} className="relative h-20 w-20 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm" style={{ animation: 'scaleIn 0.2s ease-out' }}>
                            <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                            <button
                              onClick={() => handleRemovePending(h.id, i)}
                              aria-label={t('removeImage')}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/80"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                     <div className="mt-3 flex flex-wrap items-center gap-2">
                       {h.file_url && (
                         <button
                           onClick={() => handleOpenFile(h.file_url)}
                           className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                         >
                           <Download size={14} className="shrink-0" /> <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[240px]">{h.file_name || t('homeworkFileDefault')}</span>
                         </button>
                       )}
                       {!graded && roomLeft > 0 && (
                         <label className="inline-flex min-h-[46px] cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-100 focus-within:ring-2 focus-within:ring-brand-500">
                           <Upload size={16} className="shrink-0" />
                           Take photo / Choose images
                           <span className="hidden text-xs font-medium text-brand-600 sm:inline">— up to {roomLeft} more</span>
                           <input
                             type="file"
                             accept="image/*"
                             capture="environment"
                             multiple
                             className="hidden"
                             disabled={submittingId === h.id}
                             onChange={(e) => { handlePickFiles(h.id, e.target.files); e.target.value = ''; }}
                           />
                         </label>
                       )}
                       {!graded && pending.length > 0 && (
                         <button
                           onClick={() => handleUploadPending(h.id)}
                           disabled={submittingId === h.id}
                           className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-ink/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                         >
                           <Upload size={14} />
                           {submittingId === h.id ? t('uploading') : t('uploadImagesCount', { count: pending.length })}
                           <span className="hidden text-xs font-normal text-white/70 sm:inline">— will be visible to teacher</span>
                         </button>
                       )}
                      {status.answer_file_url && (
                        <button onClick={() => handleOpenFile(status.answer_file_url)} className="inline-flex min-h-[44px] items-center px-3 py-2.5 text-xs font-medium text-ink/50 hover:text-brand-600 hover:underline">
                          {t('viewMySubmission')}
                        </button>
                      )}
                      <Link
                        to={`/chat?type=homework&id=${h.id}`}
                        className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm transition-colors hover:bg-ink/5"
                      >
                        <MessageSquare size={14} /> {t('discuss')}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
