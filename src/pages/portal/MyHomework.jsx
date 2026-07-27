// MyHomework.jsx
// Student's own view of homework - mirrors MyExams.jsx exactly (see that
// file's header comment for why the level filter and RLS split work the
// way they do).

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Download, Upload, MessageSquare } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { uploadAttachment, getAttachmentUrl } from '../../lib/db';

export default function MyHomework() {
  const { t } = useTranslation(['homework', 'common']);
  const { students, homework, homeworkStatus, submitMyHomeworkAnswer } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const myHomework = useMemo(() => {
    if (!me) return [];
    return [...homework]
      .filter((h) => !h.level || h.level === me.level)
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  }, [homework, me]);

  const statusFor = (homeworkId) => homeworkStatus.find((s) => s.homework_id === homeworkId && s.student_id === me?.id);

  // pillOf is derived from answer_file_url/score, not the raw status
  // field, for the same robustness reason as the teacher-side badges.
  const pillOf = (status) => {
    if (status?.score != null) return 'graded';
    if (status?.answer_file_url) return 'awaitingGrading';
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

  const handleUpload = async (homeworkId, file) => {
    if (!file || !me) return;
    setSubmittingId(homeworkId);
    setActionError(null);
    let uploaded;
    try {
      uploaded = await uploadAttachment(file, `homework-answers/${me.id}`);
    } catch {
      setActionError(t('uploadFileFailed'));
      setSubmittingId(null);
      return;
    }
    try {
      await submitMyHomeworkAnswer(homeworkId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name });
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

      {actionError && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{actionError}</div>}

      {myHomework.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noHomeworkAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myHomework.map((h) => {
            const status = statusFor(h.id) || { status: 'Assigned' };
            const graded = status.score != null;
            const pill = pillOf(status);
            const overdue = isOverdue(h.due_date);
            return (
              <div key={h.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold text-ink">{h.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          pill === 'graded'
                            ? 'bg-brand-50 text-brand-600'
                            : pill === 'awaitingGrading'
                              ? 'bg-active/10 text-active'
                              : 'bg-ink/5 text-ink/40'
                        }`}
                      >
                        {t(pill === 'notSubmitted' ? 'notSubmitted' : pill === 'awaitingGrading' ? 'awaitingGrading' : 'statusGraded')}
                      </span>
                    </div>
                    <p className="text-xs text-ink/50">
                      {overdue ? (
                        <span className="font-semibold text-inactive">{t('dueDateOverdue', { date: h.due_date })}</span>
                      ) : (
                        t('due', { date: h.due_date })
                      )}
                    </p>
                    {h.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{h.description}</p>}
                  </div>
                  {graded && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{t('scoreOutOf', { score: status.score })}</p>}
                </div>

                {graded && status.feedback && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{status.feedback}</p>
                )}

                {overdue && !graded && (
                  <p className="mt-2 text-xs font-semibold text-inactive">{t('deadlinePassedWarning')}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {h.file_url && (
                    <button
                      onClick={() => handleOpenFile(h.file_url)}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                    >
                      <Download size={13} /> {h.file_name || t('homeworkFileDefault')}
                    </button>
                  )}
                  {!graded && (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5">
                      <Upload size={13} />
                      {submittingId === h.id ? t('uploading') : status.answer_file_name ? t('replaceMySubmission') : t('submitMyWork')}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        className="hidden"
                        disabled={submittingId === h.id}
                        onChange={(e) => handleUpload(h.id, e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {status.answer_file_url && (
                    <button onClick={() => handleOpenFile(status.answer_file_url)} className="text-xs text-ink/50 hover:underline">
                      {t('viewMySubmission')}
                    </button>
                  )}
                  <Link
                    to={`/chat?type=homework&id=${h.id}`}
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
