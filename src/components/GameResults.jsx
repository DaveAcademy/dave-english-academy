// GameResults.jsx
// Shared end-of-round summary card for the newer games (Word Builder,
// Sentence Scramble, Listening Challenge, Word Detective, Grammar
// Battle) so each doesn't hand-roll its own copy of WordScramble.jsx's
// result screen. Deliberately minimal: score, accuracy, best streak,
// optional extra stat line, play again / back to portal. Does not
// replace the 4 existing games' inline result screens - not required by
// this task and out of scope to touch their internals.

import { RefreshCw, ArrowLeft, PartyPopper, Flame, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useGameRecord from '../hooks/useGameRecord';

export default function GameResults({ gradientClass = 'from-brand-50 to-sky-100', score, correct, total, bestStreak, isNewBest, gameType, extra, onPlayAgain }) {
  const { t } = useTranslation('game');
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { record } = useGameRecord(gameType);

  return (
    <div className="mx-auto max-w-sm">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${gradientClass} p-6 text-center shadow-card sm:p-8`}>
        <PartyPopper size={36} className="mx-auto text-brand-500" aria-hidden="true" />
        <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
        <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{score}</p>
        <p className="mt-1 text-sm font-medium text-ink/60">{t('correctCount', { correct, total })}</p>
        <p className="mt-1 text-xs font-semibold text-ink/40">{t('accuracyLine', { accuracy })}</p>

        {bestStreak != null && bestStreak > 0 && (
          <p className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-orange-600">
            <Flame size={14} aria-hidden="true" /> {t('bestStreakLine', { streak: bestStreak })}
          </p>
        )}

        {extra}

        {isNewBest && (
          <p className="mt-3 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">{t('newBest')}</p>
        )}

        {record?.holder && (
          <div className="mt-4 rounded-xl bg-white/70 p-3 text-left">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/50">
              <Trophy size={13} className="text-amber-500" aria-hidden="true" />
              {record.isRecordHolder && isNewBest ? t('newRecord') : record.isRecordHolder ? t('youHoldRecord') : t('bestRecord')}
            </p>
            {!record.isRecordHolder && (
              <p className="mt-1 text-sm font-semibold text-ink">{record.holder.name} &middot; {record.holder.score}</p>
            )}
            <p className="mt-1 text-xs font-medium text-ink/60">
              {record.isRecordHolder ? t('yourBest', { score: record.myBest }) : t('pointsToRecord', { gap: record.gap })}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={onPlayAgain}
            className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
          >
            <RefreshCw size={16} aria-hidden="true" /> {t('playAgain')}
          </button>
          <Link
            to="/games"
            className="flex items-center justify-center gap-1.5 rounded-full bg-white px-5 py-3 text-sm font-bold text-ink/70 shadow-sm transition-transform active:scale-95"
          >
            <ArrowLeft size={16} aria-hidden="true" /> {t('backToPortal')}
          </Link>
        </div>
      </div>
    </div>
  );
}
