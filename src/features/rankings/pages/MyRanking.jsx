// MyRanking.jsx — Premium game-style Student Gaming Ranking
// Hierarchy: HERO (YOUR RANK) → TOP 3 PODIUM → LEADERBOARD → YOUR POINTS LOG
// Ranking data unchanged: same RPCs, same calculations, same rank logic.
// Design overhaul only — premium game leaderboard feel.

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Crown, Medal, ArrowUp, ArrowDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { levelToken } from '../../../lib/levels';
import {
  getGroupLeaderboard,
  getRecognitionAwards,
  getStudentRankingSummary,
  getMyPointHistory,
  listClassGroups,
  getWeeklyClassLeaderboard,
  getMonthlyClassLeaderboard,
} from '../../../lib/db';
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

const LEVEL_COLORS = { A: 'bg-levelA', A1: 'bg-levelA1', B: 'bg-levelB', C: 'bg-levelC' };

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

function MedalsPodium({ leaderboard }) {
  const top3 = leaderboard.slice(0, 3);
  if (top3.length === 0) return null;

  const positions = [1, 2, 3];
  const positionLabels = ['1st', '2nd', '3rd'];
  const positionColors = [
    'from-amber-400 to-amber-500',
    'from-gray-300 to-gray-400',
    'from-amber-600 to-amber-700',
  ];
  const positionBorders = [
    'border-amber-300/40',
    'border-gray-300/40',
    'border-amber-500/40',
  ];
  const positionBg = [
    'bg-amber-50/60',
    'bg-gray-50/60',
    'bg-amber-50/40',
  ];

  return (
    <div className="mb-6">
      <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">Top 3</p>
      <div className="grid grid-cols-3 gap-3">
        {positions.map((pos, idx) => {
          const row = top3[idx];
          if (!row) return (
            <div key={pos} className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card opacity-40">
              <div className="h-10 w-10 mx-auto rounded-full bg-ink/5" />
              <div className="mt-3 h-3 w-16 rounded bg-ink/5 mx-auto" />
              <div className="mt-2 h-3 w-12 rounded bg-ink/5 mx-auto" />
            </div>
          );
          return (
            <div
              key={row.student_id}
              className={`relative overflow-hidden rounded-2xl border ${positionBorders[idx]} ${positionBg[idx]} p-4 shadow-card transition-all hover:-translate-y-1`}
            >
              <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${positionColors[idx]}`} aria-hidden="true" />
              <div className="flex flex-col items-center text-center">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-ink/[0.06]`}>
                  {pos === 1 && <Crown size={18} className="text-amber-500" />}
                  {pos === 2 && <Medal size={18} className="text-gray-500" />}
                  {pos === 3 && <Medal size={18} className="text-amber-700" />}
                </div>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/40">{positionLabels[idx]}</span>
                <span className="mt-0.5 truncate text-xs font-semibold text-ink">{displayName(row)}</span>
                <span className="font-display text-lg font-extrabold text-ink">{formatPoints(row.points)}</span>
                <span className="text-[10px] text-ink/40">pts</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-amber-500/20"><Crown size={15} /></span>;
  if (rank === 2) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-600 shadow-sm ring-2 ring-gray-300/30"><Medal size={15} /></span>;
  if (rank === 3) return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600/15 text-amber-700 shadow-sm ring-2 ring-amber-600/20"><Medal size={15} /></span>;
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-sm font-bold tabular-nums text-ink/50 ring-1 ring-ink/[0.04]">
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
  const [groupId, setGroupId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [awards, setAwards] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pointHistory, setPointHistory] = useState(null);
  const [pointHistoryError, setPointHistoryError] = useState(false);

  useEffect(() => {
    if (!me?.id) return undefined;
    let cancelled = false;
    setSummary(null);
    getStudentRankingSummary(me.id)
      .then((row) => { if (!cancelled) setSummary(row || null); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [me?.id]);

  useEffect(() => {
    if (!me?.level) return undefined;
    let cancelled = false;
    setGroupId(null);
    listClassGroups(me.level)
      .then((groups) => {
        if (cancelled) return;
        const rows = groups || [];
        if (rows.length === 0) { setGroupId(null); return; }
        if (rows.length === 1) { setGroupId(String(rows[0].id)); return; }
        const match = me.group_name ? rows.find((g) => g.name === me.group_name) : null;
        setGroupId(match ? String(match.id) : String(rows[0].id));
      })
      .catch(() => { if (!cancelled) setGroupId(null); });
    return () => { cancelled = true; };
  }, [me?.level, me?.group_name]);

  useEffect(() => {
    if (!me?.level) return undefined;
    if (period !== 'all_time' && !groupId) return undefined;
    let cancelled = false;
    setLeaderboard(null);
    setLeaderboardError(false);
    const load = async () => {
      if (period === 'all_time') {
        return getGroupLeaderboard(me.level, period);
      }
      const rows =
        period === 'week'
          ? await getWeeklyClassLeaderboard(groupId, null)
          : await getMonthlyClassLeaderboard(groupId, null);
      if (!rows || rows.length === 0) return [];
      const totalKey = period === 'week' ? 'week_total' : 'month_total';
      const rankKey = period === 'week' ? 'week_rank' : 'month_rank';
      const byStudent = new Map();
      for (const r of rows) {
        if (!byStudent.has(r.student_id)) {
          byStudent.set(r.student_id, {
            student_id: r.student_id,
            real_name: r.real_name,
            english_name: r.english_name ?? null,
            points: Number(r[totalKey]),
            rank: r[rankKey],
            attendance_rate: null,
            rank_change: null,
          });
        }
      }
      return [...byStudent.values()].sort((a, b) => a.rank - b.rank);
    };
    load()
      .then((rows) => { if (!cancelled) setLeaderboard(rows || []); })
      .catch(() => { if (!cancelled) { setLeaderboard([]); setLeaderboardError(true); } });
    return () => { cancelled = true; };
  }, [me?.level, groupId, period, refreshKey]);

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

  const heroRank = myRow?.rank ?? (summary ? summary[PERIOD_RANK_KEY[period]] ?? null : null);
  const heroPoints = myRow?.points ?? (summary ? summary[PERIOD_POINTS_KEY[period]] ?? null : null);
  const heroRankChange = myRow?.rank_change ?? null;

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
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('portal:myRankingTitle')}</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/50">{t('portal:rankingSubtitle')}</p>
      </header>

      {/* ── HERO: YOUR RANK ─────────────────────────────────── */}
      <section aria-labelledby="your-rank-heading" className="mb-6">
        <h2 id="your-rank-heading" className="sr-only">Your Rank</h2>
        <div className="overflow-hidden rounded-[20px] border border-ink/[0.06] bg-white shadow-[0_2px_8px_rgba(27,36,48,0.04),0_8px_24px_rgba(27,36,48,0.06)]">
          <div className="h-[3px] w-full bg-gradient-to-r from-brand-500 to-brand-400" aria-hidden="true" />
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
              <div className="min-w-0 flex-1 text-center sm:text-left">
                {/* Level badge + rank label */}
                <div className="inline-flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white ${LEVEL_COLORS[me.level] || 'bg-ink'}`}>
                    {levelToken(me.level)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700">
                    <Trophy size={11} aria-hidden="true" /> {t('portal:yourRankLabel', { defaultValue: 'Your Rank' })}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline justify-center gap-3 sm:justify-start">
                  <span className="font-display text-[48px] font-extrabold leading-none tracking-tight text-ink sm:text-[56px]" aria-label={`Rank ${heroRank ?? '—'}`}>
                    #{heroRank ?? '—'}
                  </span>
                  <span className="hidden h-10 w-px bg-ink/10 sm:block" aria-hidden="true" />
                  <span className="text-left">
                    <span className="block font-display text-xl font-bold leading-none text-ink sm:text-2xl">{formatPoints(heroPoints)} <span className="text-sm font-semibold text-ink/40">{t('portal:points')}</span></span>
                    <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-ink/45">{t(`portal:period_${period}`)}</span>
                  </span>
                </div>

                {/* Rank movement */}
                {heroRankChange != null && heroRankChange !== 0 && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${heroRankChange > 0 ? 'border-active/15 bg-active/10 text-active' : 'border-inactive/15 bg-inactive/10 text-inactive'}`}>
                    {heroRankChange > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                    {heroRankChange > 0
                      ? t('portal:rankUp', { count: heroRankChange, defaultValue: `↑ ${heroRankChange} this period` })
                      : t('portal:rankDown', { count: Math.abs(heroRankChange), defaultValue: `↓ ${Math.abs(heroRankChange)} this period` })}
                  </div>
                )}
                {heroRankChange === 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/[0.04] px-3 py-1.5 text-xs font-semibold text-ink/50">
                    <Minus size={12} aria-hidden="true" /> {t('portal:rankSteady', { defaultValue: 'No change' })}
                  </div>
                )}

                {/* Level + student count */}
                <div className="mt-3 flex items-center gap-1.5 justify-center sm:justify-start">
                  <span className="flex h-2 w-2 rounded-full bg-active" aria-hidden="true" />
                  <span className="text-xs font-medium text-ink/40">
                    {t('portal:levelLabelShort', { defaultValue: 'Level {{level}}', level: levelToken(me.level) })}
                    {leaderboard && leaderboard.length > 0 ? ` · ${leaderboard.length} players` : ''}
                  </span>
                </div>
              </div>

              {/* Right: Lifetime total + rank position bar */}
              <div className="mt-4 flex justify-center sm:mt-0 sm:flex-col sm:items-end sm:justify-center">
                <div className="rounded-2xl border border-ink/[0.06] bg-paper px-5 py-4 text-center shadow-sm sm:min-w-[170px]">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:totalPointsLabel')}</p>
                  <p className="mt-0.5 font-display text-xl font-bold text-ink">{formatPoints(summary?.lifetime_points ?? myRow?.points)}</p>
                  <p className="mt-1 text-[11px] font-medium text-ink/40">{t('portal:rankingHeroHint', { defaultValue: 'All-time total' })}</p>
                  {/* Progress bar showing rank position */}
                  {leaderboard && leaderboard.length > 0 && heroRank != null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] text-ink/35">
                        <span>#1</span>
                        <span className="font-bold text-brand-600">Your position</span>
                        <span>#{leaderboard.length}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-700 ease-out"
                          style={{ width: `${Math.max(2, (1 - (heroRank - 1) / Math.max(1, leaderboard.length - 1)) * 100)}%` }}
                          role="progressbar"
                          aria-valuenow={heroRank}
                          aria-valuemin={1}
                          aria-valuemax={leaderboard.length}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── TOP 3 PODIUM ────────────────────────────────────── */}
      {leaderboard && leaderboard.length >= 3 && (
        <section aria-labelledby="podium-heading" className="mb-6">
          <h2 id="podium-heading" className="sr-only">Top 3 Players</h2>
          <MedalsPodium leaderboard={leaderboard} />
        </section>
      )}

      {/* ── LEADERBOARD ─────────────────────────────────────── */}
      <section aria-labelledby="leaderboard-heading" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="leaderboard-heading" className="font-display text-base font-bold tracking-tight text-ink">
            {t('portal:leaderboardTitle', { level: levelToken(me.level) })}
          </h2>
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

        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2 border-b border-ink/[0.06] bg-paper/60 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-ink/40 sm:grid-cols-[48px_1fr_100px] sm:px-4" aria-hidden="true">
            <span className="text-center">Rank</span>
            <span>Player</span>
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
                onClick={() => { setLeaderboard(null); setLeaderboardError(false); setRefreshKey((k) => k + 1); }}
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
            <ol className="divide-y divide-ink/[0.04]" aria-label={t('portal:leaderboardTitle', { level: levelToken(me.level) })}>
              {leaderboard.map((row) => {
                const isMe = me && row.student_id === me.id;
                const isTop3 = row.rank <= 3;
                return (
                  <li
                    key={row.student_id}
                    className={`relative grid grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2.5 transition-all sm:grid-cols-[48px_1fr_100px] sm:px-4 sm:py-3 ${
                      isMe
                        ? 'bg-brand-50/70 ring-1 ring-brand-200/60'
                        : isTop3
                          ? 'bg-amber-50/30'
                          : 'bg-white hover:bg-paper/40'
                    }`}
                    aria-current={isMe ? 'true' : undefined}
                  >
                    {/* Left accent bar */}
                    {isMe && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand-500" aria-hidden="true" />}
                    {isTop3 && !isMe && <span className="absolute inset-y-0 left-0 w-[2px] bg-amber-400/50" aria-hidden="true" />}

                    {/* Rank badge */}
                    <span className="flex justify-center" aria-label={`Rank ${row.rank}`}>
                      <RankBadge rank={row.rank} />
                    </span>

                    {/* Student info */}
                    <span className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`block truncate text-sm font-semibold leading-tight ${isMe ? 'text-brand-700' : isTop3 ? 'text-ink' : 'text-ink'}`}>
                          {displayName(row)}
                        </span>
                        {isMe && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            You
                          </span>
                        )}
                        {isTop3 && !isMe && (
                          <span className="shrink-0 text-[10px]" aria-hidden="true">
                            {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : '🥉'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {row.attendance_rate != null && (
                          <span className="text-[10px] font-medium text-ink/40">{row.attendance_rate}%</span>
                        )}
                        {isMe && heroRankChange != null && heroRankChange !== 0 && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${heroRankChange > 0 ? 'text-active' : 'text-inactive'}`}>
                            {heroRankChange > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                            {Math.abs(heroRankChange)}
                          </span>
                        )}
                      </div>
                    </span>

                    {/* Points */}
                    <span className="text-right">
                      <span className={`block text-sm font-bold tabular-nums leading-none ${isMe ? 'text-brand-700' : 'text-ink'}`}>{formatPoints(row.points)}</span>
                      <span className="text-[10px] font-medium text-ink/35">pts</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {leaderboard && leaderboard.length > 0 && (
          <p className="mt-2 px-1 text-xs text-ink/35">{t('portal:rankingLevelNote', { defaultValue: 'Ranking within Level {{level}} only.', level: levelToken(me.level) })}</p>
        )}
      </section>

      {/* ── YOUR POINTS LOG ─────────────────────────────────── */}
      <section aria-labelledby="lesson-points-heading" className="mb-6">
        <h2 id="lesson-points-heading" className="mb-2 font-display text-sm font-bold tracking-tight text-ink">
          {t('portal:yourLessonPointsTitle', { defaultValue: 'Your Points Log' })}
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
          ) : pointHistory.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-ink">{t('portal:pointHistoryEmpty')}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('portal:lessonPointsEmptyHint', { defaultValue: 'Points from class scores will appear here after your teacher records them.' })}</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink/[0.04]">
              {pointHistory.map((row, idx) => {
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
          {pointHistory && pointHistory.length > 8 && (
            <p className="mt-2 px-1 text-xs text-ink/35">{t('portal:lessonPointsMore', { count: pointHistory.length - 8, defaultValue: `+{{count}} more in full history` })}</p>
          )}
        </div>
      </section>

      {/* ── RECOGNITION (secondary, only when present) ──────── */}
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