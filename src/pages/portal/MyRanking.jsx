// MyRanking.jsx
// Points/ranking is not financial information, so it's fine to show the
// student the full board alongside their own highlighted position. Uses
// the get_leaderboard() RPC (not the local students/attendance/exam data)
// because a student's own RLS-scoped reads only ever include their own
// rows - there's no other-student data to rank against client-side.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard, getMyPointHistory, getRecognitionAwards } from '../../lib/db';
import { formatMonthDay } from '../../utils/date';

// Fixed sets from the database (point_categories.key / recognition_awards
// .award_type's check constraint) - translated locally by name/key match
// rather than plumbing a translation key through the RPC/table, so no
// migration is needed to localize them. Falls back to the raw English
// value for anything unrecognized (e.g. a category an admin adds later).
const CATEGORY_NAME_KEYS = {
  'Starting Points': 'categoryStartingPoints',
  Attendance: 'categoryAttendance',
  Homework: 'categoryHomework',
  Participation: 'categoryParticipation',
  Speaking: 'categorySpeaking',
  Vocabulary: 'categoryVocabulary',
  'Test/Exam': 'categoryExam',
  Behavior: 'categoryBehavior',
  Bonus: 'categoryBonus',
  Penalty: 'categoryPenalty',
  Other: 'categoryOther',
};

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
  const [leaderboard, setLeaderboard] = useState(null);
  const [history, setHistory] = useState(null);
  const [awards, setAwards] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then((rows) => {
        if (cancelled) return;
        setLeaderboard([...(rows || [])].sort((a, b) => b.points - a.points || a.real_name.localeCompare(b.real_name)));
      })
      .catch(() => {
        if (!cancelled) setLeaderboard([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyPointHistory()
      .then((rows) => {
        if (!cancelled) setHistory(rows || []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const categoryLabel = (name) => t(CATEGORY_NAME_KEYS[name] || 'categoryOther', { defaultValue: name });

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('portal:myRankingTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('portal:rankingSubtitle')}</p>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 font-display text-base font-bold text-ink">{t('portal:recognitionTitle')}</h2>
        {awards === null ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('common:loading')}</div>
        ) : awards.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-card">
            <p className="text-sm text-ink/50">{t('portal:recognitionEmpty')}</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {awards.map((a) => {
              const info = AWARD_TYPE_INFO[a.award_type] || { icon: '🎖️', key: 'awardStudentOfWeek' };
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-levelB/10 text-lg">
                    {info.icon}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-ink">{t(`portal:${info.key}`)}</p>
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
      </section>

      {leaderboard === null ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-ink/50 shadow-card">{t('common:loading')}</div>
      ) : leaderboard.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">{t('dashboard:noData')}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {leaderboard.map((row, i) => (
            <div
              key={row.student_id}
              className={`flex items-center gap-3 rounded-xl p-3 shadow-card ${
                me && row.student_id === me.id ? 'bg-brand-500 text-white' : 'bg-white text-ink'
              }`}
            >
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${medal(i)} ${medalText(i)}`}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{row.real_name}</p>
              </div>
              <p className={`text-sm font-bold ${me && row.student_id === me.id ? 'text-white' : 'text-brand-500'}`}>
                {row.points} {t('portal:points')}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 font-display text-base font-bold text-ink">{t('portal:pointHistoryTitle')}</h2>
        {history === null ? (
          <div className="rounded-xl bg-white p-6 text-center text-sm text-ink/50 shadow-card">{t('common:loading')}</div>
        ) : history.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-card">
            <p className="text-sm text-ink/50">{t('portal:pointHistoryEmpty')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-card">
            {history.map((h, i) => (
              <div
                key={`${h.lesson_date}-${i}`}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-ink/5' : ''}`}
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ink/5 text-base">
                  {h.category_icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {categoryLabel(h.category_name)}
                    {h.reason ? <span className="text-ink/50"> · {h.reason}</span> : null}
                  </p>
                  <p className="text-xs text-ink/40">{formatMonthDay(new Date(h.lesson_date), dateLocale)}</p>
                </div>
                <span className={`flex-shrink-0 text-sm font-bold ${h.points >= 0 ? 'text-active' : 'text-inactive'}`}>
                  {h.points >= 0 ? '+' : ''}
                  {h.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
