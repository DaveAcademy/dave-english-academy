// MyRanking.jsx — 10/10 ranking experience
// Hierarchy: YOUR RANK hero → LEADERBOARD (dominant) → YOUR LESSON POINTS
// - Achievements intentionally absent (per product rule)
// - Uses authoritative RPCs only: get_group_leaderboard, get_student_ranking_summary,
//   get_my_point_history, getRecognitionAwards. No client-side rank math.

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Crown, Medal, ArrowUp, ArrowDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { getGroupLeaderboard, getRecognitionAwards, getStudentRankingSummary, getMyPointHistory } from '../../../lib/db';
import { formatMonthDay } from '../../../utils/date';
import { SkeletonList, SkeletonCard } from '../../../shared/components/Skeleton';

const PERIODS = ['week', 'month', 'all_time'];

const PERIOD_RANK_KEY = {
  week: 'level_rank_week',
  month: 'level_rank_month',
  all_time: 'level_rank_all_time',
};

const PERIOD_POINTS_KEY = {
  week: 'week_points',
  month: 'month_points',
  all_time: 'lifetime_points',
};

const AWARD_TYPE_INFO = {
  student_of_week: { icon: '⭐', key: 'awardStudentOfWeek' },
  student_of_month: { icon: '🏆', key: 'awardStudentOfMonth' },
  most_improved: { icon: '📈', key: 'awardMostImproved' },
  best_attendance: { icon: '🎯', key: 'awardBestAttendance' },
  best_homework: { icon: '📝', key: 'awardBestHomework' },
  best_behavior: { icon: '🌟', key: 'awardBestBehavior' },
};

function formatPoints(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}

function displayName(row) {
  if (!row) return '';
  const real = row.real_name ?? row.name ?? '';
  const eng = row.english_name ?? null;
  if (eng && eng !== real) return `${real} (${eng})`;
  return real;
}

function RankBadge({ rank }) {
  // Top-3 get restrained medal treatment, rest numeric — compact for 320px
  if (rank === 1) return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-1 ring-amber-500/20" aria-hidden="true"><Crown size={14} /></span>;
  if (rank === 2) return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/10 text-ink/70 shadow-sm ring-1 ring-ink/10" aria-hidden="true"><Medal size={14} /></span>;
  if (rank === 3) return <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-600/15 text-amber-700 shadow-sm ring-1 ring-amber-600/15" aria-hidden="true"><Medal size={14} /></span>;
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.06] text-xs font-bold tabular-nums text-ink/60 ring-1 ring-ink/[0.04]">
      {rank}
    </span>
  );
}

export default function MyRanking() {
  const { t, i18n } = useTranslation(['portal', 'dashboard', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me } = useAcademy();

  const [period, setPeriod] = useState('month');
  const [leaderboard, setLeaderboard] = useState(null);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [awards, setAwards] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pointHistory, setPointHistory] = useState(null);
  const [pointHistoryError, setPointHistoryError] = useState(false);

  // Summary: week/month/lifetime (period-agnostic, fetched once per student)
  useEffect(() => {
    if (!me?.id) return undefined;
    let cancelled = false;
    setSummary(null);
    getStudentRankingSummary(me.id)
      .then((row) => { if (!cancelled) setSummary(row || null); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [me?.id]);

  // Leaderboard: level-scoped, period-specific (the authoritative ranking)
  useEffect(() => {
    if (!me?.level) return undefined;
    let cancelled = false;
    setLeaderboard(null);
    setLeaderboardError(false);
    getGroupLeaderboard(me.level, period)
      .then((rows) => { if (!cancelled) setLeaderboard(rows || []); })
      .catch(() => { if (!cancelled) { setLeaderboard([]); setLeaderboardError(true); } });
    return () => { cancelled = true; };
  }, [me?.level, period]);

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    getRecognitionAwards(me.id)
      .then((rows) => { if (!cancelled) setAwards(rows || []); })
      .catch(() => { if (!cancelled) setAwards([]); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    if (!me?.id) return undefined;
    let cancelled = false;
    setPointHistory(null);
    setPointHistoryError(false);
    getMyPointHistory()
      .then((rows) => { if (!cancelled) setPointHistory(rows || []); })
      .catch(() => { if (!cancelled) { setPointHistory([]); setPointHistoryError(true); } });
    return () => { cancelled = true; };
  }, [me?.id]);

  const myRow = useMemo(() => {
    if (!leaderboard || !me?.id) return null;
    return leaderboard.find((r) => r.student_id === me.id) || null;
  }, [leaderboard, me?.id]);

  // Hero values: prefer leaderboard row (period-accurate), fall back to summary
  const heroRank = myRow?.rank ?? (summary ? summary[PERIOD_RANK_KEY[period]] ?? null : null);
  const heroPoints = myRow?.points ?? (summary ? summary[PERIOD_POINTS_KEY[period]] ?? null : null);
  const heroRankChange = myRow?.rank_change ?? null;

  // Lesson points: compact recent history (ranking-relevant points only)
  // get_my_point_history already returns newest first; limit to 8 to stay compact.
  const lessonPoints = useMemo(() => {
    if (!pointHistory) return null;
    // Filter out baseline if you want pure earned points; but baseline is informative — keep but de-emphasize.
    return pointHistory.slice(0, 8);
  }, [pointHistory]);

  if (!me) {
    return (
      <div className="mx-auto max-w-[880px]">
        <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('dashboard:notLinkedYet')}</p>
          <p className="mt-1 text-sm text-ink/50">{t('dashboard:notLinkedSubtitle', { defaultValue: '' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[880px]">
      {/* Page header — lightweight, keeps focus on hero */}
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('portal:myRankingTitle')}</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/50">{t('portal:rankingSubtitle')}</p>
      </header>

      {/* ── 1 · HERO: YOUR RANK ────────────────────────────────────────── */}
      <section aria-labelledby="your-rank-heading" className="mb-6">
        <h2 id="your-rank-heading" className="sr-only">Your Rank</h2>
        <div className="overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-[0_2px_8px_rgba(27,36,48,0.04),0_8px_24px_rgba(27,36,48,0.06)]">
          <div className="h-[3px] w-full bg-brand-500" aria-hidden="true" />
          {summary === null && leaderboard === null ? (
            <div className="px-5 py-6 sm:px-6">
              <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded bg-ink/5" />
                <div className="h-10 w-20 animate-pulse rounded bg-ink/5" />
                <div className="h-4 w-32 animate-pulse rounded bg-ink/5" />
              </div>
            </div>
          ) : heroRank == null && heroPoints == null ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">{t('portal:rankingNoData', { defaultValue: 'Ranking data is not available yet.' })}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('portal:rankingNoDataHint', { defaultValue: 'Your teacher will publish points after the next class. Check back soon.' })}</p>
            </div>
          ) : (
            <div className="px-5 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-7">
              {/* Left: rank + points */}
              <div className="min-w-0 text-center sm:text-left">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
                  <Trophy size={12} aria-hidden="true" /> {t('portal:yourRankLabel', { defaultValue: 'Your rank' })}
                </p>
                <div className="mt-3 flex items-baseline justify-center gap-3 sm:justify-start">
                  <span className="font-display text-[44px] font-extrabold leading-none tracking-tight text-ink sm:text-[52px]" aria-label={`Rank ${heroRank ?? '—'}`}>
                    #{heroRank ?? '—'}
                  </span>
                  <span className="hidden h-8 w-px bg-ink/10 sm:block" aria-hidden="true" />
                  <span className="text-left">
                    <span className="block font-display text-xl font-bold leading-none text-ink sm:text-2xl">{formatPoints(heroPoints)} <span className="text-sm font-semibold text-ink/40">{t('portal:points')}</span></span>
                    <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-ink/45">{t(`portal:period_${period}`)}</span>
                  </span>
                </div>
                {/* Movement — only when RPC provides a real delta; never invented */}
                {heroRankChange != null && heroRankChange !== 0 && (
                  <p className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${heroRankChange > 0 ? 'border-active/15 bg-active/10 text-active' : 'border-inactive/15 bg-inactive/10 text-inactive'}`}>
                    {heroRankChange > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                    {heroRankChange > 0
                      ? t('portal:rankUp', { count: heroRankChange, defaultValue: `↑ ${heroRankChange} this period` })
                      : t('portal:rankDown', { count: Math.abs(heroRankChange), defaultValue: `↓ ${Math.abs(heroRankChange)} this period` })}
                  </p>
                )}
                {heroRankChange === 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/[0.04] px-2.5 py-1 text-xs font-semibold text-ink/50">
                    <Minus size={12} aria-hidden="true" /> {t('portal:rankSteady', { defaultValue: 'No change' })}
                  </p>
                )}
                <p className="mt-2 text-xs font-medium text-ink/40">
                  {t('portal:levelLabelShort', { defaultValue: 'Level {{level}}', level: me.level })}
                  {leaderboard && leaderboard.length > 0 ? ` · ${t('portal:mpLeaderboardStudents', { count: leaderboard.length, level: me.level })}` : ''}
                </p>
              </div>

              {/* Right: subtle context on desktop — not a competing card */}
              <div className="mt-4 flex justify-center sm:mt-0 sm:flex-col sm:items-end sm:justify-center">
                <div className="rounded-2xl border border-ink/[0.06] bg-paper px-4 py-3 text-center shadow-sm sm:min-w-[160px] sm:text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:totalPointsLabel')}</p>
                  <p className="mt-0.5 font-display text-lg font-bold text-ink">{formatPoints(summary?.lifetime_points ?? myRow?.points)}</p>
                  <p className="text-[11px] font-medium text-ink/40">{t('portal:rankingHeroHint', { defaultValue: 'All-time total' })}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 2 · LEADERBOARD (dominant) ─────────────────────────────────── */}
      <section aria-labelledby="leaderboard-heading" className="mb-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 id="leaderboard-heading" className="font-display text-base font-bold tracking-tight text-ink">
            {t('portal:leaderboardTitle', { level: me.level })}
          </h2>
          {/* Period tabs — clear, no invented categories; wraps at 320px */}
          <div role="tablist" aria-label={t('portal:rankingPeriodLabel', { defaultValue: 'Ranking period' })} className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => {
              const isActive = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                    isActive ? 'bg-ink text-white shadow-sm' : 'border border-ink/[0.06] bg-white text-ink/60 shadow-card hover:border-ink/15 hover:text-ink'
                  }`}
                >
                  {t(`portal:period_${p}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table chrome — compact header, not decorative */}
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2 border-b border-ink/[0.06] bg-paper/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink/40 sm:grid-cols-[52px_1fr_110px] sm:px-4" aria-hidden="true">
            <span className="text-center">Rank</span>
            <span>Student</span>
            <span className="text-right">Points</span>
          </div>

          {leaderboard === null ? (
            <div className="p-4">
              <div className="space-y-2">
                <SkeletonCard lines={1} />
                <SkeletonCard lines={1} />
                <SkeletonCard lines={1} />
                <SkeletonCard lines={1} />
                <SkeletonCard lines={1} />
              </div>
            </div>
          ) : leaderboardError ? (
            <div className="px-5 py-10 text-center">
              <AlertCircle className="mx-auto text-inactive/60" size={24} aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">{t('portal:rankingLoadFailed', { defaultValue: 'Could not load the leaderboard.' })}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">{t('portal:rankingLoadFailedHint', { defaultValue: 'Check your connection and try again.' })}</p>
              <button
                type="button"
                onClick={() => {
                  setLeaderboard(null);
                  setLeaderboardError(false);
                  getGroupLeaderboard(me.level, period)
                    .then((rows) => setLeaderboard(rows || []))
                    .catch(() => { setLeaderboard([]); setLeaderboardError(true); });
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-white hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <RefreshCw size={12} aria-hidden="true" /> {t('common:tryAgain')}
              </button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">{t('dashboard:noData')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-ink/50">{t('portal:rankingEmptyHint', { defaultValue: 'The leaderboard will appear after the first class scores are published.' })}</p>
            </div>
          ) : (
            <ol className="divide-y divide-ink/[0.04]" aria-label={t('portal:leaderboardTitle', { level: me.level })}>
              {leaderboard.map((row) => {
                const isMe = me && row.student_id === me.id;
                return (
                  <li
                    key={row.student_id}
                    className={`grid grid-cols-[44px_1fr_auto] items-center gap-2 px-3 py-2.5 transition-colors sm:grid-cols-[52px_1fr_110px] sm:px-4 sm:py-3 ${isMe ? 'relative bg-brand-50/80 ring-1 ring-brand-100' : 'bg-white hover:bg-paper/40'}`}
                    aria-current={isMe ? 'true' : undefined}
                  >
                    {isMe && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand-500" aria-hidden="true" />}
                    {/* Rank */}
                    <span className="flex justify-center" aria-label={`Rank ${row.rank}`}>
                      <RankBadge rank={row.rank} />
                    </span>
                    {/* Student — real (English), truncated safely */}
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-semibold leading-tight ${isMe ? 'text-ink' : 'text-ink'}`}>{displayName(row)}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {isMe && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            You
                          </span>
                        )}
                        {row.attendance_rate != null && (
                          <span className="text-[11px] font-medium text-ink/40">{t('portal:attendanceRateLabel', { rate: row.attendance_rate })}</span>
                        )}
                      </span>
                    </span>
                    {/* Points — always visible, tabular */}
                    <span className="text-right">
                      <span className={`block text-sm font-bold tabular-nums leading-none ${isMe ? 'text-ink' : 'text-ink'}`}>{formatPoints(row.points)}</span>
                      <span className="text-[11px] font-medium text-ink/35">{t('portal:points')}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {leaderboard && leaderboard.length > 0 && (
          <p className="mt-2 px-1 text-xs text-ink/35">{t('portal:rankingLevelNote', { defaultValue: 'Ranking within Level {{level}} only.', level: me.level })}</p>
        )}
      </section>

      {/* ── 3 · YOUR LESSON POINTS (compact, ranking-relevant) ─────────── */}
      <section aria-labelledby="lesson-points-heading" className="mb-6">
        <h2 id="lesson-points-heading" className="mb-2 font-display text-sm font-bold tracking-tight text-ink">
          {t('portal:yourLessonPointsTitle', { defaultValue: 'Your lesson points' })}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          {pointHistory === null ? (
            <div className="p-4"><SkeletonList count={4} lines={1} /></div>
          ) : pointHistoryError ? (
            <div className="px-5 py-8 text-center">
              <AlertCircle className="mx-auto text-inactive/60" size={20} aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">{t('portal:lessonPointsFailed', { defaultValue: 'Could not load lesson points.' })}</p>
              <button
                type="button"
                onClick={() => {
                  setPointHistory(null);
                  setPointHistoryError(false);
                  getMyPointHistory()
                    .then((rows) => setPointHistory(rows || []))
                    .catch(() => { setPointHistory([]); setPointHistoryError(true); });
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-ink ring-1 ring-ink/10 hover:bg-paper"
              >
                <RefreshCw size={12} aria-hidden="true" /> {t('common:tryAgain')}
              </button>
            </div>
          ) : lessonPoints.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">{t('portal:pointHistoryEmpty')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('portal:lessonPointsEmptyHint', { defaultValue: 'Points from class scores will appear here after your teacher records them.' })}</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/[0.04]">
              {lessonPoints.map((row, idx) => {
                const pts = Number(row.points);
                const isNeg = pts < 0;
                return (
                  <li key={`${row.lesson_date}-${row.reason}-${idx}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-paper text-xs" aria-hidden="true">{row.category_icon || '•'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{row.reason || row.category_name || t('portal:categoryOther')}</span>
                      <span className="block text-xs text-ink/45">
                        {row.lesson_date ? formatMonthDay(new Date(row.lesson_date), dateLocale) : ''}
                        {row.lesson_date && row.category_name ? ' · ' : ''}{row.category_name || ''}
                        {row.is_correction ? ` · ${t('portal:correctionLabel', { defaultValue: 'correction' })}` : ''}
                      </span>
                    </span>
                    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${isNeg ? 'bg-inactive/10 text-inactive' : 'bg-active/10 text-active'}`}>
                      {pts > 0 ? `+${formatPoints(pts)}` : formatPoints(pts)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {lessonPoints && lessonPoints.length > 0 && pointHistory.length > lessonPoints.length && (
          <p className="mt-2 px-1 text-xs text-ink/35">{t('portal:lessonPointsMore', { count: pointHistory.length - lessonPoints.length, defaultValue: `+{{count}} more in full history` })}</p>
        )}
      </section>

      {/* ── 4 · Recognition (secondary, only when present) ─────────────── */}
      {awards && awards.length > 0 && (
        <section aria-labelledby="recognition-heading" className="mb-6">
          <h2 id="recognition-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">{t('portal:recognitionTitle')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {awards.map((a) => {
              const info = AWARD_TYPE_INFO[a.award_type] || { icon: '🏅', key: 'awardStudentOfWeek' };
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-levelB/10 text-lg" aria-hidden="true">{info.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{t(`portal:${info.key}`)}</span>
                    <span className="block text-xs text-ink/50">
                      {formatMonthDay(new Date(a.period_start), dateLocale)} – {formatMonthDay(new Date(a.period_end), dateLocale)}
                      {a.is_co_winner ? ` · ${t('portal:coWinnerLabel')}` : ''}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
