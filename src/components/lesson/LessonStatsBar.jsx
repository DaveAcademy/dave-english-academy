// LessonStatsBar.jsx
// Compact progress summary for the Lesson Hub V2 lesson list: a horizontal
// completion bar plus the headline numbers (completed / in progress /
// remaining / streak / words covered). Purely presentational - the parent
// computes every value from lessonLogic.js + student_lesson_progress.
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, Flame, Languages, ListChecks, PlayCircle } from 'lucide-react';

export default function LessonStatsBar({ total, completed, inProgress, remaining, streak, vocabCount }) {
  const { t } = useTranslation('lessons');
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const stats = [
    { label: t('completedLabel'), value: completed, Icon: CheckCircle2, tone: 'text-active' },
    { label: t('inProgressLabel'), value: inProgress, Icon: PlayCircle, tone: 'text-brand-500' },
    { label: t('remainingLabel'), value: remaining, Icon: ListChecks, tone: 'text-ink/60' },
    { label: t('streakLabel'), value: streak, Icon: Flame, tone: 'text-levelB' },
    { label: t('vocabLearnedLabel'), value: vocabCount, Icon: Languages, tone: 'text-levelA' },
  ];

  return (
    <div className="rounded-xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          {t('progressPercent', { percent })}
          <span className="ml-1 text-xs font-medium text-ink/50">
            {t('totalLabel')}: {total}
          </span>
        </p>
        <span className="flex items-center gap-1 text-xs font-semibold text-ink/50">
          <CalendarClock size={13} className="text-brand-500" />
          {t('title')}
        </span>
      </div>

      {/* Completion bar */}
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/5">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-active transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>

      {/* Stat chips */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {stats.map(({ label, value, Icon, tone }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-lg bg-ink/[0.03] px-2 py-1.5">
            <Icon size={14} className={`flex-shrink-0 ${tone}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-none text-ink">{value}</span>
              <span className="block truncate text-[10px] font-medium leading-tight text-ink/50">{label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
