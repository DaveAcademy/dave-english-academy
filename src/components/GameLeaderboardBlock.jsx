// GameLeaderboardBlock.jsx
// Top 10 + own rank + "next target" for one game's results screen (or the
// combined Overall Ranking on GameCenter) - shared by GameResults.jsx and
// GameCenter.jsx so this only needs to be written once. Framing is
// explicitly "beat the person one place above you," not "beat the champion"
// (Dave, 2026-08-17): a lone #1 chip demotivates everyone else once one
// score pulls far ahead, so this always shows the nearby competition too.
//
// Visual tiers (Dave's "premium" request, 2026-08-19): rank 1-3 render as a
// podium (medal badges, avatar initials, height-staggered), 4-10 as a
// numbered list with the caller's own row highlighted, and anything past 10
// collapses behind "show all" as a plain list - full detail isn't worth the
// visual weight that far down.
import { useState } from 'react';
import { Crown, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Podium tiers, keyed by rank, so a tie (two rows sharing rank 2) still
// gets the right medal/color/height instead of falling back to position.
const PODIUM_TIER = {
  1: {
    order: 'order-2',
    height: 'pt-0',
    ring: 'ring-amber-300',
    badge: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950',
    glow: 'shadow-[0_8px_24px_-6px_rgba(217,119,6,0.45)]',
    avatarSize: 'h-16 w-16 text-lg',
  },
  2: {
    order: 'order-1',
    height: 'pt-4',
    ring: 'ring-slate-300',
    badge: 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800',
    glow: 'shadow-[0_6px_18px_-6px_rgba(100,116,139,0.4)]',
    avatarSize: 'h-12 w-12 text-sm',
  },
  3: {
    order: 'order-3',
    height: 'pt-6',
    ring: 'ring-orange-300',
    badge: 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950',
    glow: 'shadow-[0_6px_18px_-6px_rgba(234,88,12,0.4)]',
    avatarSize: 'h-12 w-12 text-sm',
  },
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2);
}

function PodiumCard({ row }) {
  const tier = PODIUM_TIER[row.rank] ?? PODIUM_TIER[3];
  return (
    <div className={`flex flex-1 flex-col items-center ${tier.order} ${tier.height}`}>
      <div className="relative">
        {row.rank === 1 && (
          <Crown
            size={18}
            className="absolute -top-4 left-1/2 -translate-x-1/2 fill-amber-400 text-amber-500 drop-shadow-sm"
            aria-hidden="true"
          />
        )}
        <div
          className={`flex items-center justify-center rounded-full font-display font-bold text-white ring-4 ${tier.ring} ${tier.glow} ${tier.avatarSize} ${
            row.isMe ? 'bg-gradient-to-br from-brand-500 to-brand-700' : 'bg-gradient-to-br from-ink/70 to-ink'
          }`}
        >
          {initials(row.name)}
        </div>
        <span
          className={`absolute -bottom-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-xs font-black shadow-sm ${tier.badge}`}
        >
          {row.rank}
        </span>
      </div>
      <p className={`mt-2.5 max-w-[5.5rem] truncate text-center text-xs font-bold ${row.isMe ? 'text-brand-700' : 'text-ink'}`}>
        {row.name}
      </p>
      <p className="text-[11px] font-semibold text-ink/50">{row.score}</p>
    </div>
  );
}

function ListRow({ row }) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
        row.isMe ? 'bg-brand-50 font-bold text-brand-700 ring-1 ring-inset ring-brand-200' : 'font-medium text-ink/70'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-[10px] font-bold text-ink/50">
          {row.rank}
        </span>
        <span className="truncate">{row.name}</span>
      </span>
      <span className="flex-shrink-0 pl-2">{row.score}</span>
    </li>
  );
}

export default function GameLeaderboardBlock({ record, isNewBest }) {
  const { t } = useTranslation('game');
  const [showAll, setShowAll] = useState(false);
  if (!record || record.top.length === 0) return null;

  const podium = record.top.filter((r) => r.rank <= 3);
  const rankedList = record.top.filter((r) => r.rank > 3);
  const rest = record.rest ?? [];

  return (
    <div className="mt-4 rounded-xl border border-ink/[0.06] bg-white/70 p-3.5 text-left">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/50">
        <Crown size={13} className="text-amber-500" aria-hidden="true" />
        {t('topPlayers')}
      </p>

      {podium.length > 0 && (
        <div className="mt-3 flex items-end justify-center gap-2 border-b border-ink/[0.06] pb-4">
          {podium.map((row, i) => (
            <PodiumCard key={row.studentId ?? `${row.rank}-${i}`} row={row} />
          ))}
        </div>
      )}

      {rankedList.length > 0 && (
        <ol className="mt-2.5 space-y-0.5">
          {rankedList.map((row, i) => (
            <ListRow key={row.studentId ?? `${row.rank}-${i}`} row={row} />
          ))}
        </ol>
      )}

      {rest.length > 0 && (
        <div className="mt-2 border-t border-ink/10 pt-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold text-brand-600"
          >
            {showAll ? t('hideAllPlayers') : t('showAllPlayers', { count: record.top.length + rest.length })}
            {showAll ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>
          {showAll && (
            <ol className="mt-2 max-h-52 space-y-0.5 overflow-y-auto">
              {rest.map((row, i) => (
                <ListRow key={row.studentId ?? `${row.rank}-${i}`} row={row} />
              ))}
            </ol>
          )}
        </div>
      )}

      {record.myBest != null && (
        <div className="mt-3 border-t border-ink/10 pt-2.5">
          {record.isRecordHolder ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <Crown size={13} className="fill-amber-400 text-amber-500" aria-hidden="true" />
              {isNewBest ? t('newRecord') : t('youAreNumberOne')}
              {' · '}
              {t('yourBest', { score: record.myBest })}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink/70">{t('yourRank', { rank: record.myRank, score: record.myBest })}</p>
              {record.nextTarget && (
                <p className="mt-1 flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                  <Target size={12} aria-hidden="true" />
                  {t('nextTarget', { name: record.nextTarget.name, score: record.nextTarget.score, gap: record.nextTarget.gap })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
