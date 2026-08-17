// GameLeaderboardBlock.jsx
// Top 5 + own rank + "next target" for one game's results screen -
// shared by GameResults.jsx and the 4 original games' inline result
// screens so this only needs to be written once. Framing is explicitly
// "beat the person one place above you," not "beat the champion" (Dave,
// 2026-08-17): a lone #1 chip demotivates everyone else once one score
// pulls far ahead, so this always shows the nearby competition instead.
import { Trophy, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function GameLeaderboardBlock({ record, isNewBest }) {
  const { t } = useTranslation('game');
  if (!record || record.top.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-white/70 p-3 text-left">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/50">
        <Trophy size={13} className="text-amber-500" aria-hidden="true" />
        {t('topPlayers')}
      </p>
      <ol className="mt-2 space-y-1">
        {record.top.map((row, i) => (
          <li
            key={row.studentId ?? `${row.rank}-${i}`}
            className={`flex items-center justify-between text-xs ${row.isMe ? 'font-bold text-brand-700' : 'font-medium text-ink/70'}`}
          >
            <span className="truncate">
              {/* MEDALS/number keyed by row.rank, not array position i - a
                  5-way tie for #1 (real production data: vocabulary_quiz,
                  word_match) must show 🥇 five times, never 🥇🥈🥉4️⃣5️⃣. */}
              {MEDALS[row.rank - 1] ?? `${row.rank}.`} {row.name}
            </span>
            <span className="flex-shrink-0 pl-2">{row.score}</span>
          </li>
        ))}
      </ol>

      {record.myBest != null && (
        <div className="mt-3 border-t border-ink/10 pt-2">
          {record.isRecordHolder ? (
            <p className="text-xs font-bold text-amber-700">
              {isNewBest ? t('newRecord') : t('youAreNumberOne')}
              {' · '}
              {t('yourBest', { score: record.myBest })}
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink/70">{t('yourRank', { rank: record.myRank, score: record.myBest })}</p>
              {record.nextTarget && (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-brand-600">
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
