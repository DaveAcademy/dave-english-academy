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
  const { t } = useTranslation(['homework', 'common']);
  const {
    students, homework, homeworkStatus, homeworkSubmissionFiles, lessons,
    submitMyHomeworkFiles, removeMyHomeworkSubmissionFile, loading,
  } = useAcademy();
  const me = students[0];
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
    return { total: myHomework.length, submitted, graded, notSubmitted: Math.max(0, myHomework.length - submitted) };
  }, [myHomework, homeworkStatus, homeworkSubmissionFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const completionPct = stats.total ? Math.round((stats.graded / stats.total) * 100) : 0;

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('myTitle')}</h1>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('mySubtitle')}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink/35">Points are awarded manually by your teacher — no auto-grading.</p>
          </div>
          {!loading && stats.total > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-ink/[0.06] bg-white px-3 py-2 shadow-card">
              <div className="hidden text-right sm:block">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Progress</p>
                <p className="text-xs font-bold text-ink">{stats.graded}/{stats.total} graded</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-ink/[0.06] p-1">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand-600 ring-1 ring-ink/5">
                  {completionPct}%
                </div>
              </div>
            </div>
          )}
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
              Your homework journey begins here
            </h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">
              Every lesson unlocks a new assignment. Submit your work, get personal feedback from your teacher, and watch your progress grow — step by step.
            </p>
            <div className="mx-auto mt-6 flex max-w-[36ch] items-center justify-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-2">
              <BookOpen size={14} className="text-brand-600" />
              <span className="text-xs font-semibold text-brand-700">No homework assigned for your level yet — check back after your next lesson.</span>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"><FileText size={12} /> PDF lesson included</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink/60"><Award size={12} /> Manual teacher grading</span>
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
          {/* summary strip */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Total', value: stats.total, sub: 'assignments', tone: 'text-ink' },
              { label: 'Submitted', value: stats.submitted, sub: 'with files', tone: 'text-active' },
              { label: 'Graded', value: stats.graded, sub: 'with points', tone: 'text-brand-600' },
              { label: 'To do', value: stats.notSubmitted, sub: 'not submitted', tone: 'text-ink/60' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-ink/[0.06] bg-white px-3 py-3 shadow-card">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink/35">{k.label}</p>
                <p className={`mt-0.5 font-display text-xl font-bold ${k.tone}`}>{k.value}</p>
                <p className="text-[11px] text-ink/40">{k.sub}</p>
              </div>
            ))}
          </div>
          {stats.total > 0 && (
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${completionPct}%` }} />
            </div>
          )}

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
                          <StatusPill tone={PILL_TONE[pill]}>
                            {t(pill === 'notSubmitted' ? 'notSubmitted' : pill === 'awaitingGrading' ? 'statusSubmitted' : 'statusGraded')}
                          </StatusPill>
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
                              <FileText size={11} /> L{lesson.curriculum_lessons?.lesson_number ?? '·'} · {lesson.topic}
                            </span>
                          ) : h.lesson_id ? (
                            <span className="text-ink/30">{t('noLinkedLesson')}</span>
                          ) : null}
                          {h.level && <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">{h.level}</span>}
                        </div>

                        {/* lesson PDF meta */}
                        {lesson?.pdf_path && (
                          <p className="mt-1 text-xs text-ink/40">Lesson PDF: {lesson.topic} — open the lesson file for context.</p>
                        )}
                      </div>
                    </div>

                    {/* requirement */}
                    {h.description && (
                      <div className="mt-3 rounded-xl border border-ink/[0.06] bg-paper/60 px-3 py-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Homework requirement</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{h.description}</p>
                      </div>
                    )}

                    {/* status journey */}
                    <div className="mt-3 rounded-xl bg-ink/[0.02] px-3 py-2.5 ring-1 ring-ink/[0.04]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">Status</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${journey.tone === 'brand' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100' : journey.tone === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : journey.tone === 'danger' ? 'bg-red-50 text-red-600 ring-1 ring-red-100' : journey.tone === 'info' ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' : 'bg-ink/5 text-ink/60'}`}>
                          {journey.key === 'notSubmitted' ? 'Not submitted' : journey.key === 'submitted' ? 'Submitted' : journey.key === 'underReview' ? 'Under review' : journey.key === 'needsCorrection' ? 'Needs correction' : journey.key === 'approved' ? 'Approved' : 'Completed'}
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
                        {journey.key === 'notSubmitted' && 'Upload clear photos of your work to submit.'}
                        {journey.key === 'submitted' && 'Your work was received — teacher will review soon.'}
                        {journey.key === 'underReview' && 'Teacher is reviewing your submission.'}
                        {journey.key === 'approved' && 'Great work — approved by your teacher.'}
                        {journey.key === 'needsCorrection' && 'Teacher left feedback — please revise and resubmit.'}
                        {journey.key === 'completed' && 'Completed with distinction — keep it up!'}
                      </p>
                    </div>

                    {/* submission summary + valid/invalid */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ring-1 ${hasSubmission ? (isValidSubmission ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-200') : 'bg-ink/5 text-ink/50 ring-ink/10'}`}>
                        {hasSubmission ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {hasSubmission ? (submittedFiles.length > 0 ? `${submittedFiles.length} image${submittedFiles.length > 1 ? 's' : ''} submitted` : 'Submission on file') : 'No submission yet'}
                        {isInvalidSubmission && ' — legacy file only'}
                      </span>
                      {status.submitted_at && <span className="text-ink/40">Submitted {new Date(status.submitted_at).toLocaleDateString()}</span>}
                      {hasSubmission && <span className="text-ink/30">· Valid submission</span>}
                      {!hasSubmission && overdue && <span className="font-semibold text-inactive">· Deadline passed</span>}
                    </div>

                    {/* teacher feedback */}
                    {graded && status.feedback && (
                      <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700/70">Teacher feedback</p>
                        <p className="mt-1 text-sm leading-relaxed text-brand-800">{status.feedback}</p>
                        <p className="mt-2 text-[11px] font-medium text-brand-600/70">Points were awarded manually by your teacher.</p>
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
                          className="inline-flex min-h-[44px] min-w-0 max-w-full items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
                        >
                          <Download size={14} className="shrink-0" /> <span className="min-w-0 max-w-[52vw] truncate sm:max-w-[240px]">{h.file_name || t('homeworkFileDefault')}</span>
                        </button>
                      )}
                      {!graded && roomLeft > 0 && (
                        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-ink/10 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink/70 shadow-sm transition-colors hover:bg-ink/5">
                          <Upload size={14} />
                          {t('selectImages', { max: MAX_IMAGES })}
                          <input
                            type="file"
                            accept="image/*"
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
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
                        >
                          {submittingId === h.id ? t('uploading') : t('uploadImagesCount', { count: pending.length })}
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
