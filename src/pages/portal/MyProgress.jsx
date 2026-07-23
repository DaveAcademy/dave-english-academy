// MyProgress.jsx

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';

const STATUS_ICON = { Present: CheckCircle2, Late: Clock, Absent: XCircle };
const STATUS_COLOR = { Present: 'text-active', Late: 'text-levelB', Absent: 'text-inactive' };

export default function MyProgress() {
  const { t } = useTranslation(['portal', 'attendance', 'dashboard']);
  const { students, lessons, lessonAttendance, exams, examScores } = useAcademy();
  const me = students[0];

  const attendanceRows = useMemo(() => {
    const lessonsById = Object.fromEntries(lessons.map((l) => [l.id, l]));
    return lessonAttendance
      .map((a) => ({ ...a, lesson: lessonsById[a.lesson_id] }))
      .filter((a) => a.lesson)
      .sort((a, b) => new Date(b.lesson.scheduled_at) - new Date(a.lesson.scheduled_at));
  }, [lessonAttendance, lessons]);

  const examRows = useMemo(() => {
    const examsById = Object.fromEntries(exams.map((e) => [e.id, e]));
    return examScores
      .map((s) => ({ ...s, exam: examsById[s.exam_id] }))
      .filter((s) => s.exam)
      .sort((a, b) => new Date(b.exam.exam_date) - new Date(a.exam.exam_date));
  }, [examScores, exams]);

  const attendedCount = attendanceRows.filter((a) => a.status !== 'Absent').length;

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('dashboard:notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('portal:myProgressTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">
          {t('portal:attendedOfLessons', { count: attendedCount, total: attendanceRows.length })}
        </p>
      </header>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">{t('portal:lessonAttendance')}</h2>
      {attendanceRows.length === 0 ? (
        <div className="mb-6 rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('portal:noLessonsRecorded')}</div>
      ) : (
        <div className="mb-6 space-y-2">
          {attendanceRows.map((a) => {
            const Icon = STATUS_ICON[a.status];
            return (
              <div key={a.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
                <div>
                  <p className="font-semibold text-ink">{a.lesson.topic}</p>
                  <p className="text-xs text-ink/50">{new Date(a.lesson.scheduled_at).toLocaleDateString()}</p>
                </div>
                <span className={`flex items-center gap-1 text-sm font-semibold ${STATUS_COLOR[a.status]}`}>
                  <Icon size={16} /> {t(`attendance:${a.status.toLowerCase()}`)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink/50">{t('portal:examScores')}</h2>
      {examRows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('portal:noExamScoresYet')}</div>
      ) : (
        <div className="space-y-2">
          {examRows.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
              <div>
                <p className="font-semibold text-ink">{s.exam.title}</p>
                <p className="text-xs text-ink/50">{s.exam.exam_date}</p>
              </div>
              <p className="text-sm font-bold text-brand-500">
                {s.score} / {s.exam.max_score}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
