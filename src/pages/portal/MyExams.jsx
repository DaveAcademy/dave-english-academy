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

export default function MyExams() {
  const { t } = useTranslation(['exams', 'common']);
  const { students, exams, examScores, submitMyExamAnswer } = useAcademy();
  const me = students[0];
  const [submittingId, setSubmittingId] = useState(null);

  const myExams = useMemo(() => {
    if (!me) return [];
    return [...exams]
      .filter((e) => !e.level || e.level === me.level)
      .sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
  }, [exams, me]);

  const scoreFor = (examId) => examScores.find((s) => s.exam_id === examId && s.student_id === me?.id);

  const handleOpenFile = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleUpload = async (examId, file) => {
    if (!file || !me) return;
    setSubmittingId(examId);
    try {
      const uploaded = await uploadAttachment(file, 'exam-answers');
      await submitMyExamAnswer(examId, me.id, { fileUrl: uploaded.path, fileName: uploaded.name });
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

      {myExams.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noExamsAssignedYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myExams.map((e) => {
            const result = scoreFor(e.id);
            const graded = result?.score != null;
            return (
              <div key={e.id} className="rounded-xl bg-white p-3 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                    <FileCheck2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{e.title}</p>
                    <p className="text-xs text-ink/50">
                      {e.exam_date} · {t('outOfScore', { max: e.max_score })}
                      {e.deadline && ` · ${t('dueDate', { date: e.deadline.slice(0, 10) })}`}
                    </p>
                  </div>
                  {graded && <p className="flex-shrink-0 text-sm font-bold text-brand-500">{t('scoreOutOfMax', { score: result.score, max: e.max_score })}</p>}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {e.file_url && (
                    <button
                      onClick={() => handleOpenFile(e.file_url)}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                    >
                      <Download size={13} /> {e.file_name || t('examFileDefault')}
                    </button>
                  )}
                  {!graded && (
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
                  {result?.answer_file_url && (
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
