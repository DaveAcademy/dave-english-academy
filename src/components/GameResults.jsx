// GameResults.jsx
// Shared end-of-round summary card for the newer games (Word Builder,
// Sentence Scramble, Listening Challenge, Word Detective, Grammar
// Battle) so each doesn't hand-roll its own copy of WordScramble.jsx's
// result screen. Shows Game Points (the actual points earned) as the
// primary number, with accuracy and streak as secondary stats.

import { RefreshCw, ArrowLeft, PartyPopper, Flame, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from './GameLeaderboardBlock';
import GameLevelStatus from './GameLevelStatus';

export default function GameResults({ gradientClass = 'from-brand-50 to-sky-100', score, correct, total, bestStreak, isNewBest, gameType, level, pass, leveledUp, gamePointsAwarded, gamePointsIsPerfect, extra, onPlayAgain }) {
  const { t } = useTranslation('game');
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { record } = useGameRecord(gameType);

  return (
    <div className="mx-auto max-w-sm animate-[fadeIn_0.3s_ease-out]">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${gradientClass} p-6 text-center shadow-card sm:p-8`}>
        <div className="animate-[bounceIn_0.4s_ease-out]">
          <PartyPopper size={36} className="mx-auto text-brand-500" aria-hidden="true" />
        </div>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>

        {gamePointsAwarded > 0 ? (
          <div className="mt-4 animate-[scaleIn_0.3s_ease-out_0.15s_both]">
            <p className="font-display text-5xl font-extrabold text-amber-500">+{gamePointsAwarded}</p>
            <p className="mt-1 text-sm font-semibold text-amber-600">
              {t('gamePointsEarned', { points: '', perfect: '' }).replace(/\+\d+\s*/, '').trim() || 'Game Points'}
              {gamePointsIsPerfect && <span className="ml-1">⭐</span>}
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="font-display text-5xl font-extrabold text-brand-600">{score}</p>
          </div>
        )}

        <div className="mt-3 flex items-center justify-center gap-3 text-sm font-medium text-ink/60">
          <span>{t('correctCount', { correct, total })}</span>
          <span className="text-ink/20">|</span>
          <span>{accuracy}%</span>
        </div>

        {bestStreak != null && bestStreak > 0 && (
          <div className="mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-orange-600 animate-[fadeIn_0.3s_ease-out_0.3s_both]">
            <Flame size={16} aria-hidden="true" />
            {t('bestStreakLabel')}: {bestStreak}
          </div>
        )}

        {isNewBest && (
          <div className="mt-2 flex items-center justify-center gap-1 animate-[pulse_1s_ease-in-out_infinite]">
            <Star size={14} className="text-amber-500" aria-hidden="true" />
            <p className="text-xs font-bold text-amber-500">{t('newPersonalBest')}</p>
            <Star size={14} className="text-amber-500" aria-hidden="true" />
          </div>
        )}

        {extra && <p className="mt-2 text-xs text-ink/50">{extra}</p>}

        <GameLevelStatus
          level={level}
          pass={pass}
          leveledUp={leveledUp}
          gamePointsAwarded={gamePointsAwarded}
          gamePointsIsPerfect={gamePointsIsPerfect}
        />

        <div className="mt-5 flex flex-col gap-2">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-brand-600 hover:shadow-md active:scale-[0.97]"
            >
              <RefreshCw size={16} />
              {t('playAgain')}
            </button>
          )}
          <Link
            to="/games"
            className="flex items-center justify-center gap-2 rounded-xl bg-white/80 px-4 py-2.5 text-sm font-semibold text-ink/70 shadow-sm transition-all duration-200 hover:bg-white hover:shadow active:scale-[0.97]"
          >
            <ArrowLeft size={16} />
            {t('backToGames')}
          </Link>
        </div>
      </div>

      {record && (
        <div className="mt-4 animate-[slideUp_0.3s_ease-out_0.4s_both]">
          <GameLeaderboardBlock gameType={gameType} record={record} />
        </div>
      )}
    </div>
  );
}
