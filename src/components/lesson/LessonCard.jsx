// LessonCard.jsx
// One row in the Lesson Hub V2 lesson list. Shows everything a student
// needs to pick their next lesson at a glance: number, title, level/month/
// type, vocabulary count, PDF availability, and the student's own status
// (locked / not started / in progress / completed). The whole main row is
// a link to the lesson page; the small icon buttons on the right shortcut
// straight to the PDF and vocabulary. Status and lock state are computed
// by the parent (via lessonLogic.js) and passed in - this card never
// re-derives unlock rules, so MyLessons and LessonHub stay consistent.
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, FileText, Languages, Lock, MessageSquare, Play, Circle } from 'lucide-react';
import { LevelBadge } from '../Badge';

const STATUS_STYLES = {
  completed: 'bg-active/10 text-active',
  in_progress: 'bg-brand-50 text-brand-600',
  not_started: 'bg-ink/5 text-ink/60',
  locked: 'bg-ink/10 text-ink/40',
};

const BADGE_STYLES = {
  completed: 'bg-brand-500 text-white',
  in_progress: 'bg-brand-100 text-brand-600',
  not_started: 'bg-ink/5 text-ink/60',
  locked: 'bg-ink/10 text-ink/40',
};

function StatusIcon({ status }) {
  if (status === 'completed') return <Check size={13} strokeWidth={3} />;
  if (status === 'in_progress') return <Play size={13} fill="currentColor" />;
  if (status === 'locked') return <Lock size={13} />;
  return <Circle size={13} />;
}

function StatusLabel({ status }) {
  const { t } = useTranslation('lessons');
  const key = { completed: 'statusCompleted', in_progress: 'statusInProgress', not_started: 'statusNotStarted', locked: 'statusLocked' }[status];
  return t(key);
}

export default function LessonCard({ lesson, status, openHref, onViewPdf, vocabHref, discussHref }) {
  const { t } = useTranslation('lessons');
  const locked = status === 'locked';
  const number = lesson.curriculum_lessons?.lesson_number;
  const month = lesson.curriculum_lessons?.month;
  const lessonType = lesson.curriculum_lessons?.lesson_type;
  const vocabCount = lesson.lesson_vocabulary?.[0]?.count;
  const title = lesson.topic || lesson.curriculum_lessons?.title;
  const typeKey = { normal: 'typeNormal', review: 'typeReview', test: 'typeTest' }[lessonType];

  return (
    <div className={`flex items-stretch overflow-hidden rounded-xl border bg-white shadow-card transition-shadow hover:shadow-md ${locked ? 'border-ink/5 opacity-80' : 'border-ink/5'}`}>
      {/* Colored status edge */}
      <span className={`w-1 flex-shrink-0 ${locked ? 'bg-ink/10' : status === 'completed' ? 'bg-active' : status === 'in_progress' ? 'bg-brand-500' : 'bg-transparent'}`} aria-hidden="true" />

      <Link
        to={openHref}
        className="flex min-w-0 flex-1 items-center gap-3 p-3"
        aria-label={locked ? `${t('statusLocked')}: ${title}` : `${t('openLesson')}: ${title}`}
      >
        {/* Number / status badge */}
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${BADGE_STYLES[status]}`}>
          {number != null ? number : <BookOpen size={16} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 ${locked ? 'text-ink/50' : 'text-ink'}`}>
            <span className="truncate font-semibold">
              {number != null && <span className="text-ink/40">#{number} · </span>}
              {title}
            </span>
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
            {lesson.level && <LevelBadge level={lesson.level} />}
            {month != null && (
              <span className="rounded-full bg-ink/5 px-2 py-0.5 font-semibold text-ink/60">
                {t('monthN', { n: month })}
              </span>
            )}
            {typeKey && typeKey !== 'typeNormal' && (
              <span className={`rounded-full px-2 py-0.5 font-semibold ${lessonType === 'review' ? 'bg-levelB/10 text-levelB' : 'bg-levelC/10 text-levelC'}`}>
                {t(typeKey)}
              </span>
            )}
            {vocabCount > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-ink/5 px-2 py-0.5 font-semibold text-ink/60">
                <Languages size={11} /> {vocabCount}
              </span>
            )}
            {lesson.pdf_path && !locked && (
              <span className="flex items-center gap-0.5 rounded-full bg-ink/5 px-2 py-0.5 font-semibold text-ink/60">
                <FileText size={11} /> PDF
              </span>
            )}
          </span>
        </span>

        <span className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
          <StatusIcon status={status} /> <StatusLabel status={status} />
        </span>

        <ChevronRight size={16} className={`flex-shrink-0 ${locked ? 'text-ink/30' : 'text-ink/40'}`} aria-hidden="true" />
      </Link>

      {/* Quick actions - siblings to the Link, so no interactive-inside-a */}
      {!locked && (
        <div className="flex flex-shrink-0 flex-col justify-center gap-1 border-l border-ink/5 px-2">
          {lesson.pdf_path && onViewPdf && (
            <button
              type="button"
              onClick={() => onViewPdf(lesson)}
              title={t('viewPdf')}
              aria-label={t('viewPdf')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink/60 hover:bg-brand-50 hover:text-brand-500"
            >
              <FileText size={15} />
            </button>
          )}
          {vocabHref && (
            <Link
              to={vocabHref}
              title={t('vocabulary')}
              aria-label={t('vocabulary')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink/60 hover:bg-brand-50 hover:text-brand-500"
            >
              <Languages size={15} />
            </Link>
          )}
          {discussHref && (
            <Link
              to={discussHref}
              title={t('discuss')}
              aria-label={t('discuss')}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink/60 hover:bg-brand-50 hover:text-brand-500"
            >
              <MessageSquare size={15} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
