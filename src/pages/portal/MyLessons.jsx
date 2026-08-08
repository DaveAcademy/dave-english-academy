// MyLessons.jsx
// Lesson Hub V2 - the student's lesson library.
//
// Same filter scope as before (a student sees shared lessons plus their own
// level/group's), but built as a real learning surface instead of a plain
// list: a Continue Learning banner pointing at the next unfinished lesson,
// a progress bar with headline stats, search + level/month/status filters,
// month grouping, and Duolingo-style status on every card (locked / not
// started / in progress / completed). All unlock/status/stats logic comes
// from lessonLogic.js so MyLessons, LessonHub and the portal home derive
// the same answers from the same rules.
//
// PDF access is enforced server-side by can_read_lesson_pdf (migration
// 0094) - this page's lock badges are a convenience, not the boundary.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import LessonCard from '../../components/lesson/LessonCard';
import LessonStatsBar from '../../components/lesson/LessonStatsBar';
import MonthGroup from '../../components/lesson/MonthGroup';
import PdfViewer from '../../components/PdfViewer';
import {
  LESSON_STATUS, teacherPaceFor, lessonCapFor, progressByLessonNumber,
  lessonStatusFor, nextUnfinishedLesson, completionStreak,
} from '../../lib/lessonLogic';
import { LEVELS } from '../../lib/levels';

const LEVEL_OPTIONS = LEVELS;
const STATUS_OPTIONS = [
  { value: LESSON_STATUS.COMPLETED, key: 'filterCompleted' },
  { value: LESSON_STATUS.IN_PROGRESS, key: 'filterInProgress' },
  { value: LESSON_STATUS.NOT_STARTED, key: 'filterNotStarted' },
  { value: 'locked', key: 'filterLocked' },
  { value: 'unlocked', key: 'filterUnlocked' },
];

export default function MyLessons() {
  const { t } = useTranslation(['lessons', 'common']);
  const { students, lessons, curriculumProgress, lessonProgress, me } = useAcademy();

  // --- Search + filters -------------------------------------------------
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewPdf, setViewPdf] = useState(null);

  const resetFilters = () => {
    setQuery('');
    setLevelFilter('all');
    setMonthFilter('all');
    setStatusFilter('all');
  };

  // A student sees shared lessons (no level/group) plus their own level or
  // group's - the same scope PortalHome's upcoming widget uses.
  const scopeFilter = useMemo(() => {
    if (!me) return () => false;
    return (l) => (!l.group_name && !l.level) || l.group_name === me.group_name || l.level === me.level;
  }, [me]);

  // Curriculum order - lesson_number first, legacy lessons after.
  const myLessons = useMemo(() => {
    if (!me) return [];
    return [...lessons]
      .filter(scopeFilter)
      .sort((a, b) => {
        const an = a.curriculum_lessons?.lesson_number;
        const bn = b.curriculum_lessons?.lesson_number;
        if (an != null && bn != null) return an - bn;
        if (an != null) return -1;
        if (bn != null) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [lessons, me, scopeFilter]);

  const pace = teacherPaceFor(curriculumProgress, me?.level);
  const cap = lessonCapFor(curriculumProgress, me?.level);
  const progressByNum = useMemo(() => progressByLessonNumber(lessonProgress, myLessons), [lessonProgress, myLessons]);

  const statusByLesson = useMemo(() => {
    const map = new Map();
    for (const l of myLessons) map.set(l.id, lessonStatusFor(l, pace, progressByNum, cap));
    return map;
  }, [myLessons, pace, progressByNum, cap]);

  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let vocabCount = 0;
    for (const l of myLessons) {
      const s = statusByLesson.get(l.id);
      if (s === LESSON_STATUS.COMPLETED) {
        completed += 1;
        vocabCount += l.lesson_vocabulary?.[0]?.count ?? 0;
      } else if (s === LESSON_STATUS.IN_PROGRESS) {
        inProgress += 1;
      }
    }
    const total = myLessons.length;
    return {
      total,
      completed,
      inProgress,
      remaining: total - completed,
      streak: completionStreak(lessonProgress),
      vocabCount,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [myLessons, statusByLesson, lessonProgress]);

  const next = useMemo(
    () => nextUnfinishedLesson(myLessons, pace, progressByNum, undefined, cap),
    [myLessons, pace, progressByNum, cap]
  );

  const monthOptions = useMemo(() => {
    const months = new Set(myLessons.map((l) => l.curriculum_lessons?.month).filter((m) => m != null));
    return [...months].sort((a, b) => a - b);
  }, [myLessons]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return myLessons.filter((l) => {
      if (levelFilter !== 'all' && l.level !== levelFilter) return false;
      const month = l.curriculum_lessons?.month ?? null;
      if (monthFilter !== 'all' && month !== Number(monthFilter)) return false;
      if (statusFilter !== 'all') {
        const s = statusByLesson.get(l.id);
        if (statusFilter === 'unlocked') { if (s === 'locked') return false; }
        else if (s !== statusFilter) return false;
      }
      if (q) {
        const title = (l.topic || l.curriculum_lessons?.title || '').toLowerCase();
        const num = l.curriculum_lessons?.lesson_number;
        if (!title.includes(q) && !String(num ?? '').includes(q)) return false;
      }
      return true;
    });
  }, [myLessons, query, levelFilter, monthFilter, statusFilter, statusByLesson]);

  const filtersActive = query.trim() !== '' || levelFilter !== 'all' || monthFilter !== 'all' || statusFilter !== 'all';

  const groups = useMemo(() => {
    const byMonth = new Map();
    for (const l of filtered) {
      const m = l.curriculum_lessons?.month ?? 'other';
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(l);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => {
        if (a === 'other') return 1;
        if (b === 'other') return -1;
        return a - b;
      })
      .map(([month, items]) => ({
        month,
        label: month === 'other' ? t('otherLessons') : t('monthN', { n: month }),
        items,
      }));
  }, [filtered, t]);

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Your account isn't linked to a student record yet.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
      </header>

      {/* Continue Learning banner */}
      {next ? (
        <Link
          to={`/my-lessons/${next.id}`}
          className="group mb-5 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 p-4 shadow-card transition-transform hover:scale-[1.01] sm:p-5"
        >
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl" aria-hidden="true">
            🚀
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold uppercase tracking-wide text-white/70">{t('continueLearning')}</span>
            <span className="mt-0.5 block truncate font-display text-lg font-bold text-white">
              {t('continueWithLesson', { topic: next.topic || next.curriculum_lessons?.title })}
            </span>
            {next.curriculum_lessons?.lesson_number != null && (
              <span className="mt-0.5 block text-xs text-white/70">
                {t('continueNextStep', { percent: stats.percent, number: next.curriculum_lessons.lesson_number })}
              </span>
            )}
          </span>
          <ArrowRight size={22} className="flex-shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : myLessons.length > 0 ? (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-active/20 bg-active/5 p-4 shadow-card sm:p-5">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div>
            <p className="font-display text-base font-bold text-ink">{t('allCaughtUp')}</p>
            <p className="text-xs text-ink/60">{t('allCaughtUpSub')}</p>
          </div>
        </div>
      ) : null}

      {myLessons.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('noLessonsYet')}</p>
        </div>
      ) : (
        <>
          <LessonStatsBar
            total={stats.total}
            completed={stats.completed}
            inProgress={stats.inProgress}
            remaining={stats.remaining}
            streak={stats.streak}
            vocabCount={stats.vocabCount}
          />

          {/* Search + filters */}
          <div className="mt-4 rounded-xl bg-white p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-2">
                <Search size={15} className="flex-shrink-0 text-ink/40" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
                  aria-label={t('searchPlaceholder')}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} className="flex-shrink-0 text-ink/40 hover:text-ink" aria-label={t('common:search')}>
                    <X size={14} />
                  </button>
                )}
              </label>

              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="input w-auto py-2 text-sm" aria-label={t('common:allLevels')}>
                <option value="all">{t('common:allLevels')}</option>
                {LEVEL_OPTIONS.map((lv) => (
                  <option key={lv} value={lv}>{t(`common:level${lv}`)}</option>
                ))}
              </select>

              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input w-auto py-2 text-sm" aria-label={t('allMonths')}>
                <option value="all">{t('allMonths')}</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>{t('monthN', { n: m })}</option>
                ))}
              </select>

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto py-2 text-sm" aria-label={t('common:allStatuses')}>
                <option value="all">{t('common:allStatuses')}</option>
                {STATUS_OPTIONS.map(({ value, key }) => (
                  <option key={value} value={value}>{t(key)}</option>
                ))}
              </select>

              {filtersActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-1 rounded-lg border border-ink/10 px-3 py-2 text-xs font-semibold text-ink/60 hover:bg-ink/5"
                >
                  <RotateCcw size={13} /> {t('resetFilters')}
                </button>
              )}
            </div>
          </div>

          {/* Month-grouped lesson list */}
          {filtered.length === 0 ? (
            <div className="mt-4 rounded-xl bg-white p-10 text-center shadow-card">
              <Sparkles size={22} className="mx-auto text-ink/30" aria-hidden="true" />
              <p className="mt-2 font-display text-base font-semibold text-ink">{t('noLessonsMatch')}</p>
              {filtersActive && (
                <button onClick={resetFilters} className="mt-2 text-sm font-semibold text-brand-500 hover:underline">
                  {t('resetFilters')}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {groups.map((group) => (
                <MonthGroup key={group.month} label={group.label} count={group.items.length} forceOpen={filtersActive}>
                  {group.items.map((l) => (
                    <LessonCard
                      key={l.id}
                      lesson={l}
                      status={statusByLesson.get(l.id)}
                      openHref={`/my-lessons/${l.id}`}
                      onViewPdf={(lesson) => setViewPdf(lesson)}
                      vocabHref={`/my-vocabulary?lesson=${l.id}`}
                      discussHref={l.discussion_enabled ? `/chat?type=lesson&id=${l.id}` : null}
                    />
                  ))}
                </MonthGroup>
              ))}
            </div>
          )}
        </>
      )}

      {viewPdf && (
        <PdfViewer path={viewPdf.pdf_path} fileName={viewPdf.pdf_name} onClose={() => setViewPdf(null)} />
      )}
    </div>
  );
}
