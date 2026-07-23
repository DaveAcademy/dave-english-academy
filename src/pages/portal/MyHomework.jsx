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
  const statusLabels = { Assigned: t('statusAssigned'), Submitted: t('statusSubmitted'), Graded: t('statusGraded') };
  const { students, homework, homeworkStatus, submitMyHomeworkAnswer } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);

  const myHomework = useMemo(() => {
    if (!me) return [];
    return [...homework]
      .filter((h) => !h.level || h.level === me.level)
      .sort((a, b) => new Date(b.due_date) - new Date(a.due_date));
  }, [homework, me]);

  const statusFor = (homeworkId) => homeworkStatus.find((s) => s.homework_id === homeworkId && s.student_id === me?.id);

  const handleOpenFile = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleUpload = async (homeworkId, file) => {
    if (!file || !me) return;
    setSubmittingId(homeworkId);
    try {
      const uploaded = await uploadAttachment(file, 'homework-answers');
      await submitMyHomeworkAnswer(homeworkId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name });
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

      {myHomework.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noHomeworkAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myHomework.map((h) => {
            const status = statusFor(h.id) || { status: 'Assigned' };
            const graded = status.status === 'Graded';
            return (
              <div key={h.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{h.title}</p>
                    <p className="text-xs text-ink/50">{t('dueStatus', { date: h.due_date, status: statusLabels[status.status] })}</p>
                  </div>
                  {graded && status.score != null && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{t('scoreOutOf', { score: status.score })}</p>}
                </div>

                {graded && status.feedback && (
                  <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{status.feedback}</p>
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
