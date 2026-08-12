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

export default function MyExams() {
  const { t } = useTranslation(['exams', 'common']);
  const { students, exams, examScores, submitMyExamAnswer } = useAcademy();
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

  // graded / awaitingGrading / notSubmitted - purely derived from existing
  // score/answer_file_url columns, no new field.
  const statusOf = (result) => {
    if (result?.score != null) return 'graded';
    if (result?.answer_file_url) return 'awaitingGrading';
    return 'notSubmitted';
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

      {actionError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{actionError}</div>}

      {myExams.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noExamsAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myExams.map((e) => {
            const result = scoreFor(e.id);
            const graded = result?.score != null;
            const status = statusOf(result);
            const overdue = isOverdue(e);
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
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          status === 'graded'
                            ? 'bg-brand-50 text-brand-600'
                            : status === 'awaitingGrading'
                              ? 'bg-active/10 text-active'
                              : 'bg-ink/5 text-ink/40'
                        }`}
                      >
                        {t(status)}
                      </span>
                    </div>
                    <p className="text-xs text-ink/50">
                      {e.exam_date} · {t('outOfScore', { max: e.max_score })}
                      {e.deadline &&
                        (overdue ? (
                          <span className="font-semibold text-inactive"> · {t('dueDateOverdue', { date: e.deadline.slice(0, 10) })}</span>
                        ) : (
                          ` · ${t('dueDate', { date: e.deadline.slice(0, 10) })}`
                        ))}
                    </p>
                    {e.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{e.description}</p>}
                  </div>
                  {graded && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{t('scoreOutOfMax', { score: result.score, max: e.max_score })}</p>}
                </div>

                {result?.feedback && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{result.feedback}</p>
                )}

                {overdue && !graded && (
                  <p className="mt-2 text-xs font-semibold text-inactive">{t('deadlinePassedWarning')}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {e.file_url && (
                    <button
                      onClick={() => handleOpenFile(e.file_url)}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                    >
                      <Download size={13} /> {e.file_name || t('examFileDefault')}
                    </button>
                  )}
                  {e.exam_type !== 'Oral' && !graded && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
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
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5"
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
