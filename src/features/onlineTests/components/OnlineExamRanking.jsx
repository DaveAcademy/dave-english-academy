// OnlineExamRanking.jsx — gaming-style leaderboard over submitted Online
// Test attempts. Read-only view of get_online_exam_ranking(); ranking order
// and values come from the server unchanged. Visual language follows the
// Game Sessions / Pets rankings: Top 3 podium, compact ranked rows,
// own-row highlight. No score inputs, no writes.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Crown, Medal } from 'lucide-react';
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

function isMine(row, me) {
  return me != null && String(row.student_id) === String(me.id);
}

// Rank medallion: crown/medal for 1-3, numbered disc otherwise.
// Same convention as the Game Sessions RankBadge.
function RankBadge({ rank }) {
  if (rank === 1) return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-amber-500/20"><Crown size={15} /></span>;
  if (rank === 2) return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 shadow-sm ring-2 ring-gray-300/30"><Medal size={15} /></span>;
  if (rank === 3) return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-600/15 text-amber-700 shadow-sm ring-2 ring-amber-600/20"><Medal size={15} /></span>;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-sm font-bold tabular-nums text-ink/50 ring-1 ring-ink/[0.04]">
      {rank}
    </span>
  );
}

const PODIUM_TIER = {
  1: { ring: 'ring-2 ring-amber-300', bg: 'bg-gradient-to-b from-amber-50 to-white', num: 'text-amber-600' },
  2: { ring: 'ring-1 ring-slate-200', bg: 'bg-gradient-to-b from-slate-50 to-white', num: 'text-slate-500' },
  3: { ring: 'ring-1 ring-orange-200', bg: 'bg-gradient-to-b from-orange-50 to-white', num: 'text-orange-500' },
};

function PodiumCard({ row, mine, t }) {
  const tier = PODIUM_TIER[row.rank] ?? PODIUM_TIER[3];
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl px-2 py-4 text-center shadow-sm motion-safe:transition-transform ${tier.ring} ${tier.bg} ${
        row.rank === 1 ? 'sm:-translate-y-2 sm:py-5 sm:shadow-card' : ''
      } ${mine ? 'outline outline-2 outline-brand-400' : ''}`}
    >
      <RankBadge rank={row.rank} />
      <span className={`mt-1.5 font-display font-extrabold tabular-nums leading-none ${row.rank === 1 ? 'text-2xl' : 'text-xl'} ${tier.num}`}>
        {row.average}%
      </span>
      <span className="mt-1.5 w-full truncate px-1 text-[13px] font-bold text-ink" title={displayName(row)}>
        {displayName(row)}
      </span>
      {mine && (
        <span className="mt-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{t('youBadge')}</span>
      )}
      <span className="mt-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink/70">
        {t('testsDone', { count: row.tests })} · {t('percentScore', { pct: row.best_score })}
      </span>
    </div>
  );
}

function RankRow({ row, mine, t }) {
  return (
    <li
      className={`rounded-xl px-3 py-2 motion-safe:transition-colors ${
        mine ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-ink/[0.03] hover:bg-ink/[0.05]'
      }`}
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={row.rank} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {displayName(row)}
          {mine && (
            <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">{t('youBadge')}</span>
          )}
        </span>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-ink ring-1 ring-ink/[0.06]">
          {row.average}%
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-12 text-[11px] font-semibold tabular-nums text-ink/50">
        <span>{t('testsDone', { count: row.tests })}</span>
        <span>{t('colBest')}: {t('percentScore', { pct: row.best_score })}</span>
      </div>
    </li>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="mb-2 mt-5 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40 first:mt-0">{children}</p>
  );
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

  const myRow = rows?.find((r) => isMine(r, me)) ?? null;
  const top3 = (rows ?? []).slice(0, 3);
  const top5 = (rows ?? []).slice(0, 5);
  const top10 = (rows ?? []).slice(0, 10);

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
          {myRow ? (
            <div className="mb-4 flex items-center gap-3 overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white px-4 py-3 shadow-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                <Trophy size={16} />
              </span>
              <p className="text-sm font-bold text-brand-800">
                {t('yourRank', { rank: myRow.rank, average: myRow.average })}
              </p>
            </div>
          ) : (
            <p className="mb-4 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-xs font-semibold text-ink/55 shadow-card">
              {t('notRankedYet')}
            </p>
          )}

          {top3.length > 0 && (
            <section aria-label={t('podiumTitle')}>
              <SectionTitle>{t('podiumTitle')}</SectionTitle>
              <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
                {top3.map((row) => (
                  <PodiumCard key={row.student_id} row={row} mine={isMine(row, me)} t={t} />
                ))}
              </div>
            </section>
          )}

          <section aria-label={t('top5Title')}>
            <SectionTitle>{t('top5Title')}</SectionTitle>
            <ol className="space-y-1.5">
              {top5.map((row) => (
                <RankRow key={row.student_id} row={row} mine={isMine(row, me)} t={t} />
              ))}
            </ol>
          </section>

          {top10.length > 5 && (
            <section aria-label={t('top10Title')}>
              <SectionTitle>{t('top10Title')}</SectionTitle>
              <ol className="space-y-1.5">
                {top10.map((row) => (
                  <RankRow key={row.student_id} row={row} mine={isMine(row, me)} t={t} />
                ))}
              </ol>
            </section>
          )}

          {rows.length > 10 && (
            <section aria-label={t('allStudentsTitle')}>
              <SectionTitle>{t('allStudentsTitle')}</SectionTitle>
              <ol className="space-y-1.5">
                {rows.slice(10).map((row) => (
                  <RankRow key={row.student_id} row={row} mine={isMine(row, me)} t={t} />
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
