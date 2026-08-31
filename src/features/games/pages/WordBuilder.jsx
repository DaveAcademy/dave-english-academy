// WordBuilder.jsx
// Word Builder: tap scrambled letter tiles (tracked by tile id, not
// letter value, so duplicate letters can't be mis-selected) to spell the
// word. Words come from get_word_builder_round() (same
// pick_game_words/student_available_vocabulary pipeline as
// WordScramble.jsx - see migration 0142) - difficulty here just means
// "how the word looks", not which words are chosen: shorter words get a
// simpler single-row tile layout, longer words wrap and show a
// difficulty badge. Grading is entirely server-side via
// submitGameRound('word_builder', ...); nothing computed client-side is
// trusted.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw as Reset, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import GameResults from '../../../components/GameResults';
import { LevelBadge } from '../components/GameLevelStatus';
import useGameStreak from '../hooks/useGameStreak';
import { getWordBuilderRound, submitGameRound } from '../../../lib/storageBridge';

function difficultyFor(word) {
  if (word.length <= 4) return 'easy';
  if (word.length <= 7) return 'medium';
  return 'hard';
}

function scrambleLetters(word) {
  const letters = word.split('').map((ch, i) => ({ id: `${i}-${ch}`, ch }));
  for (let i = letters.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  // Never display the tiles in the exact original order.
  if (letters.map((l) => l.ch).join('') === word && letters.length > 1) {
    [letters[0], letters[1]] = [letters[1], letters[0]];
  }
  return letters;
}

export default function WordBuilder() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [tiles, setTiles] = useState([]); // available letter tiles for current word
  const [placed, setPlaced] = useState([]); // tiles the student has placed, in order
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();

  const setupWord = (word) => {
    setTiles(scrambleLetters(word));
    setPlaced([]);
    setFeedback(null);
  };

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setError(null);
    resetStreak();
    try {
      const { roundId: rid, level: lvl, words } = await getWordBuilderRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words);
      if (words.length > 0) setupWord(words[0].english);
    } catch (err) {
      setError(err.message || String(err));
      setRound(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    startRound();
  }, [startRound]);

  const current = round?.[index];

  const handleTapTile = (tile) => {
    if (feedback) return;
    setTiles((prev) => prev.filter((t) => t.id !== tile.id));
    setPlaced((prev) => [...prev, tile]);
  };

  const handleUnplace = (tile) => {
    if (feedback) return;
    setPlaced((prev) => prev.filter((t) => t.id !== tile.id));
    setTiles((prev) => [...prev, tile]);
  };

  const currentGuess = placed.map((t) => t.ch).join('');

  const recordAnswer = (answer, skipped) => {
    const isCorrect = !skipped && answer.toLowerCase() === current.english.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) recordCorrect();
    else recordIncorrect();
    setAnswers((prev) => [...prev, { vocabulary_id: current.id, answer, used_hint: false, skipped }]);
  };

  const handleCheck = () => {
    if (feedback || placed.length === 0) return;
    recordAnswer(currentGuess, false);
  };

  const handleSkip = () => {
    if (feedback) return;
    recordAnswer('', true);
  };

  const handleReset = () => {
    if (feedback) return;
    setTiles((prev) => [...prev, ...placed]);
    setPlaced([]);
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setupWord(round[nextIndex].english);
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('word_builder', roundId, answers);
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
      <GameResults
        gradientClass="from-teal-50 to-emerald-100"
        score={result.score}
        correct={result.words_correct}
        total={result.words_total}
        bestStreak={bestStreak}
        isNewBest={result.is_new_best}
        gameType="word_builder"
        level={result.level}
        pass={result.pass}
        leveledUp={result.leveled_up}
        gamePointsAwarded={result.game_points_awarded}
        gamePointsIsPerfect={result.game_points_is_perfect}
        onPlayAgain={startRound}
      />
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

  const diff = difficultyFor(current.english);

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🧱 {t('wordBuilderTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs font-semibold text-ink/40">
          <span>{t('wordOf', { current: index + 1, total: round.length })}</span>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 font-bold text-teal-700">{t(`difficulty_${diff}`)}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-100 p-5 shadow-card sm:p-6">
        {/* Placed-letter slots (the student's current spelling) */}
        <div className="flex min-h-[3.25rem] flex-wrap justify-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-white/60 p-2">
          {placed.length === 0 && <span className="py-2.5 text-xs font-semibold text-ink/30">{t('tapLettersHint')}</span>}
          {placed.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleUnplace(tile)}
              disabled={!!feedback}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500 font-display text-xl font-bold text-white shadow-sm transition-all duration-200 animate-letter-reveal active:scale-95"
            >
              {tile.ch.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Available tiles - tracked by tile.id, never by letter value, so
            duplicate letters (e.g. two E's) each stay individually
            selectable/deselectable without ambiguity. */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleTapTile(tile)}
              disabled={!!feedback}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border-b-4 border-emerald-400 bg-emerald-100 font-display text-2xl font-bold text-emerald-800 shadow-sm transition-all duration-200 hover:shadow active:scale-95 sm:h-14 sm:w-14"
            >
              {tile.ch.toUpperCase()}
            </button>
          ))}
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-bold ${
              feedback === 'correct' ? 'text-emerald-600 animate-correct' : 'text-rose-600 animate-incorrect'
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

        <div className="mt-5 flex items-center justify-between gap-2">
          {feedback ? (
            <button
              onClick={handleNext}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:shadow active:scale-95"
            >
              {t('next')}
            </button>
          ) : (
            <>
              <button
                onClick={handleReset}
                disabled={placed.length === 0}
                aria-label={t('reset')}
                className="flex items-center gap-1 rounded-full px-2 py-2 text-xs font-semibold text-ink/50 disabled:opacity-30"
              >
                <Reset size={16} aria-hidden="true" /> {t('reset')}
              </button>
              <div className="flex flex-1 justify-end gap-2">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 rounded-full bg-white px-4 py-3 text-sm font-bold text-ink/60 shadow-sm transition-transform active:scale-95"
                >
                  {t('skip')}
                </button>
                <button
                  onClick={handleCheck}
                  disabled={placed.length === 0}
                  className="flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
                >
                  {t('check')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
