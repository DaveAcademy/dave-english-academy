// MyHomework.jsx
// Student's own view of homework - mirrors MyExams.jsx exactly (see that
// file's header comment for why the level filter and RLS split work the
// way they do).
//
// H4: submission is now up to 5 images per homework (homework_submission_
// files), not a single generic file. Local "pending" state (picked but
// not yet uploaded) is kept per-homework-id so switching between cards
// doesn't lose a half-built selection. Object URLs are revoked on
// removal/replace/unmount to avoid leaking memory.

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Download, Upload, MessageSquare, X, Image as ImageIcon } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { uploadAttachment, getAttachmentUrl } from '../../lib/db';
import LessonSectionTabs from '../../components/lesson/LessonSectionTabs';
import StatusPill from '../../components/StatusPill';
import ErrorBanner from '../../components/ErrorBanner';
import { SkeletonList } from '../../components/Skeleton';

// Same semantic tones StatCard/AttentionCard/StatusPill use elsewhere, so
// "graded" / "submitted" / "not submitted" read as the same colors as
// everywhere else in the app instead of a one-off pill palette.
const PILL_TONE = { graded: 'brand', awaitingGrading: 'success', notSubmitted: 'neutral' };

const MAX_IMAGES = 5;

export default function MyHomework() {
  const { t } = useTranslation(['homework', 'common']);
  const {
    students,
    homework,
    homeworkStatus,
    homeworkSubmissionFiles,
    lessons,
    submitMyHomeworkFiles,
    removeMyHomeworkSubmissionFile,
    loading,
  } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  // { [homeworkId]: { file, previewUrl }[] }
  const [pendingByHomework, setPendingByHomework] = useState({});
  const pendingRef = useRef(pendingByHomework);
  pendingRef.current = pendingByHomework;

  // Revoke every still-outstanding preview URL on unmount only - not on
  // every render, hence the ref instead of a `pendingByHomework` dep.
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
    homeworkSubmissionFiles
      .filter((f) => f.homework_id === homeworkId && f.student_id === me?.id)
      .sort((a, b) => a.position - b.position);

  const lessonOf = (lessonId) => (lessonId ? lessons.find((l) => l.id === lessonId) : null);

  // pillOf checks either the legacy single-file column or the new
  // multi-file table - a submission counts if either has anything,
  // since a new submission never writes the legacy column.
  const pillOf = (status, homeworkId) => {
    if (status?.score != null) return 'graded';
    if (status?.answer_file_url || submittedFilesFor(homeworkId).length > 0) return 'awaitingGrading';
    return 'notSubmitted';
  };

  // due_date is a plain DATE column (no time/timezone component) - it
  // represents a calendar day, not an instant. Comparing
  // `new Date(due_date) < new Date()` would parse the date as UTC
  // midnight and mark it overdue hours before the due day even ends for
  // anyone east of UTC (e.g. Tashkent, UTC+5, sees it flip to overdue at
  // 5am local on the due date itself). Instead compare local calendar
  // days directly: overdue only once "today" (in the viewer's own local
  // time) is strictly after the due date's calendar day.
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
    } catch {
      setActionError(t('openFileFailed'));
    }
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
      } catch {
        uploadFailed = true;
        break;
      }
    }
    if (uploaded.length > 0) {
      try {
        await submitMyHomeworkFiles(homeworkId, me.id, uploaded);
        clearPending(homeworkId);
        if (uploadFailed) setActionError(t('partialUploadFailed'));
      } catch {
        setActionError(t('submitAnswerFailed'));
      }
    } else {
      setActionError(t('uploadFileFailed'));
    }
    setSubmittingId(null);
  };

  const handleRemoveSubmitted = async (id) => {
    setActionError(null);
    try {
      await removeMyHomeworkSubmissionFile(id);
    } catch {
      setActionError(t('removeImageFailed'));
    }
  };

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('myTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('mySubtitle')}</p>
      </header>

      <LessonSectionTabs />

      <ErrorBanner>{actionError}</ErrorBanner>

      {loading ? (
        <SkeletonList count={3} />
      ) : myHomework.length === 0 ? (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noHomeworkAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myHomework.map((h) => {
            const status = statusFor(h.id) || { status: 'Assigned' };
            const graded = status.score != null;
            const pill = pillOf(status, h.id);
            const overdue = isOverdue(h.due_date);
            const lesson = lessonOf(h.lesson_id);
            const pending = pendingByHomework[h.id] || [];
            const submittedFiles = submittedFilesFor(h.id);
            const roomLeft = Math.max(0, MAX_IMAGES - submittedFiles.length - pending.length);
            return (
              <div key={h.id} className="rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="break-words font-semibold text-ink">{h.title}</p>
                      <StatusPill tone={PILL_TONE[pill]}>
                        {/* The academy doesn't use a homework grading workflow - homework is
                            just submitted and reviewed manually, so the pill only ever needs to
                            say "Submitted", not "Submitted, awaiting grading". */}
                        {t(pill === 'notSubmitted' ? 'notSubmitted' : pill === 'awaitingGrading' ? 'statusSubmitted' : 'statusGraded')}
                      </StatusPill>
                    </div>
                    <p className="text-xs text-ink/50">
                      {overdue ? (
                        <span className="font-semibold text-inactive">{t('dueDateOverdue', { date: h.due_date })}</span>
                      ) : (
                        t('due', { date: h.due_date })
                      )}
                      {lesson && ` · ${t('lessonLabel', { topic: lesson.topic, date: new Date(lesson.scheduled_at).toLocaleDateString() })}`}
                    </p>
                    {h.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{h.description}</p>}
                  </div>
                  {graded && <p className="flex-shrink-0 whitespace-nowrap text-sm font-bold text-brand-500">{t('scoreOutOf', { score: status.score })}</p>}
                </div>

                {graded && status.feedback && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{status.feedback}</p>
                )}

                {overdue && !graded && (
                  <p className="mt-2 text-xs font-semibold text-inactive">{t('deadlinePassedWarning')}</p>
                )}

                {submittedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {submittedFiles.map((f, i) => (
                      <span key={f.id} className="flex items-center gap-1 rounded-lg border border-ink/10 px-2 py-1 text-xs text-ink/60">
                        <button onClick={() => handleOpenFile(f.file_url)} className="flex items-center gap-1 hover:underline">
                          <ImageIcon size={11} /> {t('imageN', { n: i + 1 })}
                        </button>
                        {!graded && (
                          <button onClick={() => handleRemoveSubmitted(f.id)} aria-label={t('removeImage')} className="text-inactive hover:text-inactive">
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {pending.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pending.map((item, i) => (
                      <div key={item.previewUrl} className="relative h-16 w-16 overflow-hidden rounded-lg border border-ink/10">
                        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                        <button
                          onClick={() => handleRemovePending(h.id, i)}
                          aria-label={t('removeImage')}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {h.file_url && (
                    <button
                      onClick={() => handleOpenFile(h.file_url)}
                      className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-2 text-xs font-semibold text-brand-500 hover:bg-brand-50 sm:py-1.5"
                    >
                      <Download size={13} className="flex-shrink-0" /> <span className="min-w-0 max-w-[55vw] truncate sm:max-w-[220px]">{h.file_name || t('homeworkFileDefault')}</span>
                    </button>
                  )}
                  {!graded && roomLeft > 0 && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-ink/60 hover:bg-ink/5 sm:py-1.5">
                      <Upload size={13} />
                      {t('selectImages', { max: MAX_IMAGES })}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={submittingId === h.id}
                        onChange={(e) => {
                          handlePickFiles(h.id, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  {!graded && pending.length > 0 && (
                    <button
                      onClick={() => handleUploadPending(h.id)}
                      disabled={submittingId === h.id}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:py-1.5"
                    >
                      {submittingId === h.id ? t('uploading') : t('uploadImagesCount', { count: pending.length })}
                    </button>
                  )}
                  {status.answer_file_url && (
                    <button onClick={() => handleOpenFile(status.answer_file_url)} className="py-2 text-xs text-ink/50 hover:underline sm:py-0">
                      {t('viewMySubmission')}
                    </button>
                  )}
                  <Link
                    to={`/chat?type=homework&id=${h.id}`}
                    className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-ink/60 hover:bg-ink/5 sm:ml-auto sm:py-1.5"
                  >
                    <MessageSquare size={13} /> {t('discuss')}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
