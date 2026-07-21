// MyRanking.jsx
// Points/ranking is not financial information, so it's fine to show the
// student the full board alongside their own highlighted position. Uses
// the get_leaderboard() RPC (not the local students/attendance/exam data)
// because a student's own RLS-scoped reads only ever include their own
// rows - there's no other-student data to rank against client-side.

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getLeaderboard } from '../../lib/db';

export default function MyRanking() {
  const { t } = useTranslation(['portal', 'dashboard', 'common']);
  const { students } = useAcademy();
  const me = students[0];
  const [leaderboard, setLeaderboard] = useState(null);

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

  const medal = (i) => (i === 0 ? 'bg-levelB' : i === 1 ? 'bg-ink/20' : i === 2 ? 'bg-levelA' : 'bg-ink/5');
  const medalText = (i) => (i <= 2 ? 'text-white' : 'text-ink/50');

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('portal:myRankingTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('portal:rankingSubtitle')}</p>
      </header>

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
    </div>
  );
}
