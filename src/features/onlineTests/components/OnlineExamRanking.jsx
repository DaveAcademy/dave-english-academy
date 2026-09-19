// OnlineExamRanking.jsx — derived leaderboard over submitted Online Test
// attempts. Read-only view of get_online_exam_ranking(); no score inputs,
// no writes. Own row highlighted via Academy student id.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { getOnlineExamRanking } from '../lib/onlineTestApi';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';

function displayName(row) {
  const real = row.real_name ?? '';
  const eng = row.english_name ?? null;
  if (eng && eng !== real) return `${real} (${eng})`;
  return real;
}

export default function OnlineExamRanking() {
  const { t } = useTranslation(['onlineTest', 'common']);
  const { me } = useAcademy();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await getOnlineExamRanking());
    } catch {
      setError(t('loadFailed'));
      setRows([]);
    }
  }, [t]);

  useEffect(() => { if (me) load(); }, [me, load]);

  const myRow = rows?.find((r) => String(r.student_id) === String(me?.id)) ?? null;

  return (
    <div className="min-w-0">
      <ErrorBanner>{error}</ErrorBanner>
      {rows === null ? (
        <SkeletonList count={5} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-ink/[0.06] bg-white px-6 py-10 text-center shadow-card">
          <Trophy className="mx-auto text-ink/15" size={28} aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink">{t('emptyRanking')}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink/50">{t('emptyRankingHint')}</p>
        </div>
      ) : (
        <>
          {myRow && (
            <p className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700">
              {t('yourRank', { rank: myRow.rank, average: myRow.average })}
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
            <ol className="divide-y divide-ink/[0.04]">
              <li className="grid grid-cols-[2.5rem_1fr_3rem_4rem_4rem] items-center gap-2 bg-paper px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-ink/45 sm:grid-cols-[3rem_1fr_3.5rem_5rem_5rem] sm:px-5" aria-hidden="true">
                <span>{t('colRank')}</span>
                <span>{t('colStudent')}</span>
                <span className="text-right">{t('colTests')}</span>
                <span className="text-right">{t('colAverage')}</span>
                <span className="text-right">{t('colBest')}</span>
              </li>
              {rows.map((row) => {
                const isMe = String(row.student_id) === String(me?.id);
                return (
                  <li
                    key={row.student_id}
                    className={`grid grid-cols-[2.5rem_1fr_3rem_4rem_4rem] items-center gap-2 px-4 py-3 sm:grid-cols-[3rem_1fr_3.5rem_5rem_5rem] sm:px-5 ${isMe ? 'bg-brand-50/70' : ''}`}
                  >
                    <span className="text-sm font-bold tabular-nums text-ink/60">{row.rank}</span>
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{displayName(row)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-ink/70">{row.tests}</span>
                    <span className="text-right text-sm font-bold tabular-nums text-ink">{row.average}%</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-ink/70">{row.best_score}%</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
