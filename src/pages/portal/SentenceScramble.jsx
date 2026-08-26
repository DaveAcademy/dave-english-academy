// SentenceScramble.jsx
// Tap scrambled words in order to build the correct sentence. Tap-to-
// order (not drag-and-drop) per the task brief - drag is fragile on
// mobile. Tapping a placed word returns it to the pool (undo/reorder).
// Content comes from get_sentence_scramble_round() (migration 0142):
// curated statement/question/negative/tense sentences seeded into
// game_content_bank, graded server-side by comparing the submitted word
// order against the canonical order stored there - this component only
// ever sends the order the student built, never a claimed "is this
// right" answer.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw as Reset, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../../components/GameProgress';
import GameResults from '../../components/GameResults';
import { LevelBadge } from '../../components/GameLevelStatus';
import useGameStreak from '../../hooks/useGameStreak';
import { getSentenceScrambleRound, submitGameRound } from '../../lib/storageBridge';

export default function SentenceScramble() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, words, type }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [pool, setPool] = useState([]); // [{ id, word }]
  const [placed, setPlaced] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();

  const setupItem = (item) => {
    setPool(item.words.map((w, i) => ({ id: `${i}-${w}`, word: w })));
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
      const { roundId: rid, level: lvl, words } = await getSentenceScrambleRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words);
      if (words.length > 0) setupItem(words[0]);
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

  const handleTapWord = (tile) => {
    if (feedback) return;
    setPool((prev) => prev.filter((p) => p.id !== tile.id));
    setPlaced((prev) => [...prev, tile]);
  };

  const handleUnplace = (tile) => {
    if (feedback) return;
    setPlaced((prev) => prev.filter((p) => p.id !== tile.id));
    setPool((prev) => [...prev, tile]);
  };

  const handleResetOrder = () => {
    if (feedback) return;
    setPool((prev) => [...prev, ...placed]);
    setPlaced([]);
  };

  const recordAnswer = (wordsOrder, skipped) => {
    const canonical = current.canonical_words.join(' ');
    const built = wordsOrder.join(' ');
    const isCorrect = !skipped && built === canonical;
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    if (isCorrect) recordCorrect();
    else recordIncorrect();
    setAnswers((prev) => [...prev, { content_id: current.id, words: wordsOrder, skipped }]);
  };

  const handleCheck = () => {
    if (feedback || placed.length === 0) return;
    recordAnswer(placed.map((p) => p.word), false);
  };

  const handleSkip = () => {
    if (feedback) return;
    recordAnswer([], true);
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setupItem(round[nextIndex]);
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('sentence_scramble', roundId, answers);
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
        gradientClass="from-indigo-50 to-violet-100"
        score={result.score}
        correct={result.words_correct}
        total={result.words_total}
        bestStreak={bestStreak}
        isNewBest={result.is_new_best}
        gameType="sentence_scramble"
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

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🧩 {t('sentenceScrambleTitle')}</h1>
      </header>

      <div className="mb-4">
        <div className="mb-2 flex justify-center">
          <LevelBadge level={level} />
        </div>
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 p-5 shadow-card sm:p-6">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-indigo-500">{t(`sentenceType_${current.type}`)}</p>

        <div className="mt-3 flex min-h-[3.5rem] flex-wrap justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-white/60 p-2.5">
          {placed.length === 0 && <span className="py-2.5 text-xs font-semibold text-ink/30">{t('tapWordsHint')}</span>}
          {placed.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleUnplace(tile)}
              disabled={!!feedback}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition-all duration-200 animate-letter-reveal active:scale-95"
            >
              {tile.word}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {pool.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleTapWord(tile)}
              disabled={!!feedback}
              className="rounded-lg border-b-4 border-violet-300 bg-white px-3 py-2 text-sm font-bold text-ink shadow-sm transition-all duration-200 hover:shadow active:scale-95"
            >
              {tile.word}
            </button>
          ))}
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-3 text-center text-sm font-bold ${feedback === 'correct' ? 'text-emerald-600 animate-correct' : 'text-rose-600 animate-incorrect'}`}
          >
            {feedback === 'correct' ? (
              <span className="flex items-center justify-center gap-1.5">
                <CheckCircle2 size={18} aria-hidden="true" /> {t('correct')}
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1">
                <span className="flex items-center gap-1.5">
                  <XCircle size={18} aria-hidden="true" /> {t('incorrect')}
                </span>
                <span className="text-xs font-semibold text-ink/60">{current.canonical_words.join(' ')}</span>
              </span>
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
                onClick={handleResetOrder}
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
