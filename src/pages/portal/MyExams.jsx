// MyExams.jsx
// Student's own view of exams - RLS already scopes exam_scores to just
// this student's rows, and exams themselves are readable by any signed-in
// user (see migration 0005's exams_read_all policy), so `exams` here is
// already the right set; the level filter below is just about not
// showing a student exams meant for a different level.

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileCheck2, Download, Upload, MessageSquare } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { uploadAttachment, getAttachmentUrl } from '../../lib/db';
import LessonSectionTabs from '../../components/lesson/LessonSectionTabs';
import { examTypeIcon } from '../../utils/examLabel';
import { formatDateOnly } from '../../utils/date';
import StatusPill from '../../components/StatusPill';
import ErrorBanner from '../../components/ErrorBanner';
import { SkeletonList } from '../../components/Skeleton';

// Same semantic tones StatCard/AttentionCard/StatusPill use elsewhere
// (see the identical mapping in MyHomework.jsx), extended with the two
// exam-only states.
const STATUS_TONE = { graded: 'brand', awaitingGrading: 'success', upcoming: 'info', expired: 'danger', resultPending: 'neutral', notSubmitted: 'neutral' };

export default function MyExams() {
  const { t, i18n } = useTranslation(['exams', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students, exams, examScores, submitMyExamAnswer, loading } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const myExams = useMemo(() => {
    if (!me) return [];
    return [...exams]
      .filter((e) => !e.level || e.level === me.level)
      .sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
  }, [exams, me]);

  const scoreFor = (examId) => examScores.find((s) => s.exam_id === examId && s.student_id === me?.id);

  // graded / awaitingGrading / expired / notSubmitted / resultPending /
  // upcoming - purely derived from existing score/answer_file_url columns
  // plus the exam_date and deadline, no new schema field. Priority matters:
  // a graded or submitted exam must never read as expired or upcoming just
  // because its date has since passed or was scheduled ahead, so those
  // checks come first; "upcoming" only applies once nothing has been graded
  // or submitted yet. Oral (Speaking) exams have no submission step at all
  // (see the upload button below, hidden for exam_type === 'Oral'), so
  // "notSubmitted"/"expired" - both of which read as "you were supposed to
  // upload something" - are never accurate for them; isOral collapses that
  // branch to a neutral "result not available yet" instead.
  const statusOf = (result, overdue, upcoming, isOral) => {
    if (result?.score != null) return 'graded';
    if (result?.answer_file_url) return 'awaitingGrading';
    if (upcoming) return 'upcoming';
    if (isOral) return 'resultPending';
    if (overdue) return 'expired';
    return 'notSubmitted';
  };

  // exam_date is a plain `date` column (no time-of-day), always compared as
  // a local calendar day - same reasoning as isOverdue below. An exam is
  // "upcoming" only while its exam_date is strictly after today.
  const isUpcoming = (exam) => {
    if (!exam.exam_date) return false;
    const [y, m, d] = exam.exam_date.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return false;
    const examDay = new Date(y, m - 1, d);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return examDay > todayLocal;
  };

  // exam.deadline is a timestamptz column, but it's always written from a
  // plain <input type="date"> (see Exams.jsx), so in practice it represents
  // a calendar day, not an instant. Comparing `new Date(deadline) < new
  // Date()` parses the date as UTC midnight and marks it overdue hours
  // before the due day even ends for anyone east of UTC (e.g. Tashkent,
  // UTC+5, sees it flip to overdue at 5am local on the due date itself) -
  // same bug class already fixed for homework in MyHomework.jsx. Compare
  // local calendar days directly instead: overdue only once "today" (in the
  // viewer's own local time) is strictly after the deadline's calendar day.
  const isOverdue = (exam) => {
    if (!exam.deadline) return false;
    const [y, m, d] = exam.deadline.slice(0, 10).split('-').map(Number);
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

  const handleUpload = async (examId, file) => {
    if (!file || !me) return;
    setSubmittingId(examId);
    setActionError(null);
    let uploaded;
    try {
      uploaded = await uploadAttachment(file, `exam-answers/${me.id}`);
    } catch {
      setActionError(t('uploadFileFailed'));
      setSubmittingId(null);
      return;
    }
    try {
      await submitMyExamAnswer(examId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name });
    } catch {
      setActionError(t('submitAnswerFailed'));
    } finally {
      setSubmittingId(null);
    }
  };

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
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
      ) : myExams.length === 0 ? (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <FileCheck2 className="mx-auto mb-3 text-ink/15" size={32} aria-hidden="true" />
          <p className="font-display text-lg font-semibold text-ink">{t('noExamsAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myExams.map((e) => {
            const result = scoreFor(e.id);
            const graded = result?.score != null;
            const isOral = e.exam_type === 'Oral';
            const overdue = isOverdue(e);
            const upcoming = isUpcoming(e);
            const status = statusOf(result, overdue, upcoming, isOral);
            const expired = status === 'expired';
            return (
              <div key={e.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg">
                    {e.exam_type === 'Written' || e.exam_type === 'Oral' ? examTypeIcon(e.exam_type) : <FileCheck2 size={18} className="text-brand-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold text-ink">{e.title}</p>
                      {(e.exam_type === 'Written' || e.exam_type === 'Oral') && (
                        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-ink/50">
                          {t(`examType.${e.exam_type}`)}
                        </span>
                      )}
                      <StatusPill tone={STATUS_TONE[status]}>{t(status)}</StatusPill>
                    </div>
                    <p className="text-xs text-ink/50">
                      {formatDateOnly(e.exam_date, dateLocale)} · {t('outOfScore', { max: e.max_score })}
                      {/* Deadline is an answer-submission deadline - meaningless for Oral
                          exams, which have no submission step at all. */}
                      {e.deadline && !isOral &&
                        (expired ? (
                          <span className="font-semibold text-inactive"> · {t('dueDateOverdue', { date: formatDateOnly(e.deadline.slice(0, 10), dateLocale) })}</span>
                        ) : (
                          ` · ${t('dueDate', { date: formatDateOnly(e.deadline.slice(0, 10), dateLocale) })}`
                        ))}
                    </p>
                    {upcoming && (
                      <p className="mt-1 text-sm text-brand-700">
                        {t('upcomingExamDate', { date: formatDateOnly(e.exam_date, dateLocale) })} · {t('upcomingPrepareMessage')}
                      </p>
                    )}
                    {e.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{e.description}</p>}
                  </div>
                  {graded && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{t('scoreOutOfMax', { score: result.score, max: e.max_score })}</p>}
                </div>

                {result?.feedback && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{result.feedback}</p>
                )}

                {expired && (
                  <p className="mt-2 text-xs font-semibold text-inactive">{t('deadlinePassedWarning')}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {e.file_url && (
                    <button
                      onClick={() => handleOpenFile(e.file_url)}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:bg-brand-50"
                    >
                      <Download size={13} /> {e.file_name || t('examFileDefault')}
                    </button>
                  )}
                  {e.exam_type !== 'Oral' && !graded && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5">
                      <Upload size={13} />
                      {submittingId === e.id ? t('uploading') : result?.answer_file_name ? t('replaceMyAnswer') : t('uploadMyAnswer')}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        className="hidden"
                        disabled={submittingId === e.id}
                        onChange={(ev) => handleUpload(e.id, ev.target.files?.[0])}
                      />
                    </label>
                  )}
                  {e.exam_type !== 'Oral' && result?.answer_file_url && (
                    <button
                      onClick={() => handleOpenFile(result.answer_file_url)}
                      className="text-xs text-ink/50 hover:underline"
                    >
                      {t('viewMySubmittedAnswer')}
                    </button>
                  )}
                  <Link
                    to={`/chat?type=exam&id=${e.id}`}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 transition-colors hover:bg-ink/5"
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
