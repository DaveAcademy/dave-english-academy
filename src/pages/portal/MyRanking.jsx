// MyRanking.jsx
// Points/ranking is not financial information, so it's fine to show the
// student the full board alongside their own highlighted position. Uses
// the get_leaderboard() RPC (not the local students/attendance/exam data)
// because a student's own RLS-scoped reads only ever include their own
// rows - there's no other-student data to rank against client-side.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getGroupLeaderboard, getRecognitionAwards, getStudentRankingSummary, listAchievementDefinitions, getStudentAchievements } from '../../lib/db';
import { formatMonthDay } from '../../utils/date';
import PointsSummary from '../../components/PointsSummary';
import Panel from '../../components/Panel';

const RARITY_STYLE = {
  common: 'bg-ink/10 text-ink/60',
  rare: 'bg-brand-500/10 text-brand-500',
  epic: 'bg-levelB/20 text-levelB',
};

const PERIODS = ['week', 'month', 'all_time'];

const AWARD_TYPE_INFO = {
  student_of_week: { icon: '🏆', key: 'awardStudentOfWeek' },
  student_of_month: { icon: '🏅', key: 'awardStudentOfMonth' },
  most_improved: { icon: '📈', key: 'awardMostImproved' },
  best_attendance: { icon: '✅', key: 'awardBestAttendance' },
  best_homework: { icon: '📚', key: 'awardBestHomework' },
  best_behavior: { icon: '⭐', key: 'awardBestBehavior' },
};

export default function MyRanking() {
  const { t, i18n } = useTranslation(['portal', 'dashboard', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { students } = useAcademy();
  const me = students[0];
  const [period, setPeriod] = useState('week');
  const [leaderboard, setLeaderboard] = useState(null);
  const [awards, setAwards] = useState(null);
  const [summary, setSummary] = useState(null);
  const [achievementDefs, setAchievementDefs] = useState(null);
  const [achievementDefsError, setAchievementDefsError] = useState(false);
  const [earnedAchievements, setEarnedAchievements] = useState(null);
  const [earnedAchievementsError, setEarnedAchievementsError] = useState(false);

  // This Week / This Month / Total Points, all three at once - the same
  // week_bounds()/month_bounds()-summed ledger figures as the leaderboard
  // below, just for the student's own row and independent of whatever
  // period tab is selected there. get_student_ranking_summary() (0023)
  // was built for exactly this (PortalHome's hero stat) so it's reused
  // as-is rather than composing it from three separate calls.
  useEffect(() => {
    if (!me?.id) return undefined;
    let cancelled = false;
    setSummary(null);
    getStudentRankingSummary(me.id)
      .then((row) => {
        if (!cancelled) setSummary(row || null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.id]);

  // Scoped to the student's own level - ranking against students in other
  // levels wouldn't mean anything (see get_group_leaderboard()'s pt.level
  // join in migration 0023).
  useEffect(() => {
    if (!me?.level) return undefined;
    let cancelled = false;
    setLeaderboard(null);
    getGroupLeaderboard(me.level, period)
      .then((rows) => {
        if (!cancelled) setLeaderboard(rows || []);
      })
      .catch(() => {
        if (!cancelled) setLeaderboard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me?.level, period]);

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    getRecognitionAwards(me.id)
      .then((rows) => {
        if (!cancelled) setAwards(rows || []);
      })
      .catch(() => {
        if (!cancelled) setAwards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  // Achievements: catalog + this student's earned rows, fetched
  // independently (like awards/leaderboard above) so one failing request
  // doesn't block the others.
  useEffect(() => {
    let cancelled = false;
    setAchievementDefsError(false);
    listAchievementDefinitions()
      .then((rows) => {
        if (!cancelled) setAchievementDefs(rows || []);
      })
      .catch(() => {
        if (!cancelled) {
          setAchievementDefs([]);
          setAchievementDefsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me?.id) return undefined;
    let cancelled = false;
    setEarnedAchievements(null);
    setEarnedAchievementsError(false);
    getStudentAchievements(me.id)
      .then((rows) => {
        if (!cancelled) setEarnedAchievements(rows || []);
      })
      .catch(() => {
        if (!cancelled) {
          setEarnedAchievements([]);
          setEarnedAchievementsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me?.id]);

  const earnedKeys = new Set((earnedAchievements || []).map((a) => a.achievement?.key));
  const lockedAchievements = (achievementDefs || []).filter((d) => !earnedKeys.has(d.key));

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('portal:myRankingTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('portal:rankingSubtitle')}</p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-base font-bold text-ink">{t('portal:myPointsSummaryTitle')}</h2>
        <PointsSummary
          week={summary?.week_points}
          month={summary?.month_points}
          lifetime={summary?.lifetime_points}
          weekLabel={t('portal:pointsSummaryWeek')}
          monthLabel={t('portal:pointsSummaryMonth')}
          lifetimeLabel={t('portal:pointsSummaryLifetime')}
          loading={!summary}
        />
      </section>

      <section className="mb-6">
        <Panel title={t('portal:recognitionTitle')}>
          {awards === null ? (
            <p className="py-4 text-center text-sm text-ink/50">{t('common:loading')}</p>
          ) : awards.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink/50">{t('portal:recognitionEmpty')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {awards.map((a) => {
                const info = AWARD_TYPE_INFO[a.award_type] || { icon: '🎖️', key: 'awardStudentOfWeek' };
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-levelB/10 text-lg">
                      {info.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-ink">{t(`portal:${info.key}`)}</p>
                      <p className="text-xs text-ink/50">
                        {formatMonthDay(new Date(a.period_start), dateLocale)} – {formatMonthDay(new Date(a.period_end), dateLocale)}
                        {a.is_co_winner ? ` · ${t('portal:coWinnerLabel')}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </section>

      <section className="mb-6">
        <Panel title={t('portal:achievementsTitle')}>
          {earnedAchievements === null || achievementDefs === null ? (
            <p className="py-4 text-center text-sm text-ink/50">{t('common:loading')}</p>
          ) : achievementDefsError || earnedAchievementsError ? (
            <p className="py-4 text-center text-sm text-ink/50">{t('dashboard:sectionUnavailable')}</p>
          ) : earnedAchievements.length === 0 && lockedAchievements.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink/50">{t('portal:achievementsEmpty')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {earnedAchievements.map((a) => (
                <div key={a.achievement?.key} className="flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-lg">
                    {a.achievement?.icon || '🏆'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="break-words font-semibold text-ink">{a.achievement?.name}</p>
                      {a.achievement?.rarity && (
                        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${RARITY_STYLE[a.achievement.rarity] || RARITY_STYLE.common}`}>
                          {a.achievement.rarity}
                        </span>
                      )}
                    </div>
                    {a.achievement?.description && <p className="text-xs text-ink/50">{a.achievement.description}</p>}
                    <p className="mt-1 text-xs text-ink/40">
                      {formatMonthDay(new Date(a.earned_at), dateLocale)}
                      {a.bonus_transaction?.points > 0 && ` · +${a.bonus_transaction.points} ${t('portal:points')}`}
                    </p>
                  </div>
                </div>
              ))}
              {lockedAchievements.map((d) => (
                <div key={d.key} className="flex items-start gap-3 rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3 opacity-60 shadow-card sm:p-4">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-ink/5 text-lg grayscale">{d.icon || '🔒'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-ink/70">{d.name}</p>
                    {d.description && <p className="text-xs text-ink/40">{d.description}</p>}
                    <p className="mt-1 text-xs font-semibold uppercase text-ink/30">{t('portal:achievementLocked')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <h2 className="font-display text-base font-bold text-ink">{t('portal:leaderboardTitle', { level: me?.level })}</h2>
      {leaderboard != null && leaderboard.length > 0 && (
        <p className="mb-2 text-xs text-ink/40">{leaderboard.length} students in Level {me?.level}</p>
      )}
      <section className="mb-2 flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              period === p ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-card hover:text-ink'
            }`}
          >
            {t(`portal:period_${p}`)}
          </button>
        ))}
      </section>

      {leaderboard === null ? (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center text-sm text-ink/50 shadow-card">{t('common:loading')}</div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('dashboard:noData')}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {leaderboard.map((row) => {
            const isMe = me && row.student_id === me.id;
            return (
              <div
                key={row.student_id}
                className={`flex items-center gap-3 rounded-xl border p-3 shadow-card sm:p-4 ${isMe ? 'border-brand-600 bg-brand-500 text-white' : 'border-ink/[0.06] bg-white text-ink'}`}
              >
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal(row.rank - 1)} ${medalText(row.rank - 1)}`}
                >
                  {row.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.real_name}</p>
                  {row.attendance_rate != null && (
                    <p className={`text-xs ${isMe ? 'text-white/70' : 'text-ink/40'}`}>
                      {t('portal:attendanceRateLabel', { rate: row.attendance_rate })}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                  <p className={`text-sm font-bold ${isMe ? 'text-white' : 'text-brand-500'}`}>
                    {row.points} {t('portal:points')}
                  </p>
                  {row.rank_change != null && row.rank_change !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 text-xs font-semibold ${
                        row.rank_change > 0 ? (isMe ? 'text-white' : 'text-active') : isMe ? 'text-white/80' : 'text-inactive'
                      }`}
                    >
                      {row.rank_change > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                      {Math.abs(row.rank_change)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
