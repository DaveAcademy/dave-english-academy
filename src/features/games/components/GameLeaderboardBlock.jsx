// GameLeaderboardBlock.jsx
// Top 10 + own rank + "next target" for one game's results screen (or the
// combined Overall Ranking on GameCenter) - shared by GameResults.jsx and
// GameCenter.jsx so this only needs to be written once. Framing is
// explicitly "beat the person one place above you," not "beat the champion"
// (Dave, 2026-08-17): a lone #1 chip demotivates everyone else once one
// score pulls far ahead, so this always shows the nearby competition too.
//
// "Arena" style (Dave picked this from 4 mocked directions, 2026-08-19): a
// dark scoreboard card - deliberately breaks from the light app chrome
// around it, like a stats card, so the leaderboard reads as a distinct
// "competitive" moment rather than blending into the results screen. Rank
// 1-3 get a colored left stripe (gold/silver/bronze) and a score bar sized
// relative to the #1 score, so the gap to the top is visible at a glance,
// not just the raw numbers.
import { useState } from 'react';
import { Zap, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const RANK_TIER = {
  1: { stripe: 'shadow-[inset_2px_0_0_#E3B24E]', tint: 'bg-gradient-to-r from-amber-400/20 to-transparent', num: 'text-amber-400', bar: 'from-amber-500 to-amber-300' },
  2: { stripe: 'shadow-[inset_2px_0_0_#AEB6C4]', tint: 'bg-gradient-to-r from-slate-300/15 to-transparent', num: 'text-slate-300', bar: 'from-slate-500 to-slate-300' },
  3: { stripe: 'shadow-[inset_2px_0_0_#D08A57]', tint: 'bg-gradient-to-r from-orange-400/15 to-transparent', num: 'text-orange-400', bar: 'from-orange-600 to-orange-400' },
};

function Row({ row, topScore }) {
  const tier = RANK_TIER[row.rank];
  const pct = topScore > 0 ? Math.max(6, Math.round((row.score / topScore) * 100)) : 0;
  return (
    <li
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs ${
        row.isMe
          ? 'bg-brand-400/15 font-bold text-white shadow-[inset_2px_0_0_theme(colors.brand.400)]'
          : `font-semibold text-white/80 ${tier ? `${tier.tint} ${tier.stripe}` : ''}`
      }`}
    >
      <span className={`w-4 flex-shrink-0 text-[11px] font-black ${row.isMe ? 'text-brand-400' : (tier?.num ?? 'text-white/30')}`}>
        {row.rank}
      </span>
      <span className="min-w-[3.5rem] flex-shrink truncate">{row.name}</span>
      <span className="h-1 min-w-[2rem] flex-1 overflow-hidden rounded-full bg-white/10">
        <span
          className={`block h-full rounded-full bg-gradient-to-r ${row.isMe ? 'from-brand-600 to-brand-400' : (tier?.bar ?? 'from-brand-600 to-brand-400')}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="flex-shrink-0 tabular-nums text-white">{row.score}</span>
    </li>
  );
}

export default function GameLeaderboardBlock({ record, isNewBest }) {
  const { t } = useTranslation('game');
  const [showAll, setShowAll] = useState(false);
  if (!record || record.top.length === 0) return null;

  const topScore = record.top[0].score;
  const rest = record.rest ?? [];

  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-gradient-to-b from-ink to-[#0F141C] p-3.5 text-left shadow-[0_10px_28px_-14px_rgba(0,0,0,0.6)]">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/45">
        <Zap size={13} className="text-brand-400" aria-hidden="true" />
        {t('topPlayers')}
      </p>

      <ol className="mt-2.5 space-y-0.5">
        {record.top.map((row, i) => (
          <Row key={row.studentId ?? `${row.rank}-${i}`} row={row} topScore={topScore} />
        ))}
      </ol>

      {rest.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold text-brand-400"
          >
            {showAll ? t('hideAllPlayers') : t('showAllPlayers', { count: record.top.length + rest.length })}
            {showAll ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          </button>
          {showAll && (
            <ol className="mt-2 max-h-52 space-y-0.5 overflow-y-auto">
              {rest.map((row, i) => (
                <Row key={row.studentId ?? `${row.rank}-${i}`} row={row} topScore={topScore} />
              ))}
            </ol>
          )}
        </div>
      )}

      {record.myBest != null && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          {record.isRecordHolder ? (
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Zap size={13} className="fill-amber-400 text-amber-400" aria-hidden="true" />
              {isNewBest ? t('newRecord') : t('youAreNumberOne')}
              {' · '}
              {t('yourBest', { score: record.myBest })}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-white/70">{t('yourRank', { rank: record.myRank, score: record.myBest })}</p>
              {record.nextTarget && (
                <p className="mt-1 flex w-fit items-center gap-1 rounded-full bg-brand-400/15 px-2.5 py-1 text-xs font-bold text-brand-400">
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
