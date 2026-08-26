// Hangman.jsx
// Hangman (Game & Practice System, migration 0179) - replaces Listening
// Challenge in the visible Game Center (2026-08-19: on-device TTS proved
// unreliable on Android, no client-side fix possible). Pure text/tap
// game - no audio, no images, can't hit the same device problem.
//
// Classic letter-by-letter guessing against the Uzbek translation as a
// hint. Wrong guesses cost lives (6, standard hangman); the client only
// ever submits the fully-assembled word once solved (or '' + skipped on
// a loss) - grading (does that match lesson_vocabulary.english) happens
// in submitGameRound() on the server, same as Word Scramble/Word Builder.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ArrowLeft, CheckCircle2, XCircle, PartyPopper, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import { getHangmanRound, submitGameRound } from '../../../lib/storageBridge';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import GameLevelStatus, { LevelBadge } from '../components/GameLevelStatus';

const MAX_WRONG = 6;
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export default function Hangman() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, english, uzbek }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [guessed, setGuessed] = useState(new Set());
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | null
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { record } = useGameRecord('hangman', !!result);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setGuessed(new Set());
    setWrongCount(0);
    setFeedback(null);
    setError(null);
    try {
      const { roundId: rid, level: lvl, words } = await getHangmanRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words);
    } catch (err) {
      setError(err.message || String(err));
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startRound();
  }, [startRound]);

  const current = round?.[index];
  const solved = current && !feedback && current.english.toLowerCase().split('').every((ch) => guessed.has(ch));

  const recordAnswer = (answer, skipped) => {
    const isCorrect = !skipped && answer.toLowerCase() === current.english.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    setAnswers((prev) => [...prev, { vocabulary_id: current.id, answer, used_hint: false, skipped }]);
  };

  // Auto-record the moment the word is fully revealed or lives run out -
  // no separate "check" step needed since every letter is graded as it's
  // tapped (unlike WordScramble's typed-then-submit flow).
  useEffect(() => {
    if (!current || feedback) return;
    if (solved) {
      recordAnswer(current.english, false);
    } else if (wrongCount >= MAX_WRONG) {
      recordAnswer('', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, wrongCount, current, feedback]);

  const handleGuess = (letter) => {
    if (feedback || guessed.has(letter)) return;
    const next = new Set(guessed);
    next.add(letter);
    setGuessed(next);
    if (!current.english.toLowerCase().includes(letter)) {
      setWrongCount((c) => c + 1);
    }
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      setIndex((i) => i + 1);
      setGuessed(new Set());
      setWrongCount(0);
      setFeedback(null);
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('hangman', roundId, answers);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !result) {
    return <p className="p-10 text-center text-sm text-ink/40">{t('loading')}</p>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-sm animate-[fadeIn_0.3s_ease-out]">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-50 to-purple-100 p-6 text-center shadow-card sm:p-8">
          <div className="animate-[bounceIn_0.4s_ease-out]">
            <PartyPopper size={36} className="mx-auto text-fuchsia-500" aria-hidden="true" />
          </div>
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          {result.game_points_awarded > 0 ? (
            <div className="mt-4 animate-[scaleIn_0.3s_ease-out_0.15s_both]">
              <p className="font-display text-5xl font-extrabold text-amber-500">+{result.game_points_awarded}</p>
              <p className="mt-1 text-sm font-semibold text-amber-600">Game Points{result.game_points_is_perfect ? ' ⭐' : ''}</p>
            </div>
          ) : (
            <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{result.score}</p>
          )}
          <div className="mt-2 flex items-center justify-center gap-3 text-sm font-medium text-ink/60">
            <span>{t('correctCount', { correct: result.words_correct, total: result.words_total })}</span>
          </div>
          {result.is_new_best && (
            <p className="mt-3 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 animate-[pulse_1s_ease-in-out_infinite]">{t('newBest')}</p>
          )}

          <GameLevelStatus
            level={result.level}
            pass={result.pass}
            leveledUp={result.leveled_up}
            gamePointsAwarded={result.game_points_awarded}
            gamePointsIsPerfect={result.game_points_is_perfect}
          />

          <GameLeaderboardBlock record={record} isNewBest={result.is_new_best} />

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={startRound}
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

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-rose-600">{t('loadError')}</p>
      </div>
    );
  }

  if (!round || round.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('noWords')}</p>
      </div>
    );
  }

  const livesLeft = MAX_WRONG - wrongCount;

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🪢 {t('hangmanTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-purple-100 p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: MAX_WRONG }).map((_, i) => (
            <Heart
              key={i}
              size={18}
              className={`transition-all duration-300 ${i < livesLeft ? 'fill-rose-500 text-rose-500 scale-100' : 'text-ink/15 scale-75 opacity-40'}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <p className="mt-3 text-center text-xs font-bold uppercase tracking-wide text-fuchsia-700/60">{current.uzbek}</p>

        <div className="mt-2 flex flex-wrap justify-center gap-1.5" aria-label={current.english}>
          {current.english.split('').map((ch, i) => {
            const revealed = guessed.has(ch.toLowerCase()) || feedback;
            return (
              <span
                key={i}
                className={`flex h-10 w-8 flex-shrink-0 items-center justify-center border-b-4 border-fuchsia-400 font-display text-xl font-bold text-fuchsia-900 sm:h-12 sm:w-9 sm:text-2xl transition-all duration-200 ${revealed ? 'animate-letter-reveal' : ''}`}
              >
                {revealed ? ch.toUpperCase() : ''}
              </span>
            );
          })}
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-bold animate-[scaleIn_0.2s_ease-out] ${
              feedback === 'correct' ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {feedback === 'correct' ? (
              <>
                <CheckCircle2 size={18} aria-hidden="true" /> {t('correct')}
              </>
            ) : (
              <>
                <XCircle size={18} aria-hidden="true" /> {t('incorrect')} ({current.english})
              </>
            )}
          </p>
        )}

        <div className="mt-4 flex flex-col items-center gap-1.5">
          {ROWS.map((row, i) => (
            <div key={i} className="flex justify-center gap-1">
              {row.split('').map((letter) => {
                const isGuessed = guessed.has(letter);
                const isHit = isGuessed && current.english.toLowerCase().includes(letter);
                let style = 'bg-white text-ink hover:bg-ink/5 active:scale-95 hover:shadow-md';
                if (isGuessed) style = isHit ? 'bg-emerald-500 text-white animate-correct' : 'bg-ink/10 text-ink/30 animate-incorrect';
                return (
                  <button
                    key={letter}
                    onClick={() => handleGuess(letter)}
                    disabled={!!feedback || isGuessed}
                    aria-label={letter}
                    className={`flex h-9 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold shadow-sm transition-all duration-200 sm:h-10 sm:w-8 sm:text-sm ${style}`}
                  >
                    {letter.toUpperCase()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          {feedback && (
            <button
              onClick={handleNext}
              className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
            >
              {t('next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
