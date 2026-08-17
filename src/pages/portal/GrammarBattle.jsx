// GrammarBattle.jsx
// Fast-paced timed MCQ grammar quiz with 3 lives and adaptive difficulty.
// get_grammar_battle_round() (migration 0142) returns one mixed-tier
// pool per round-trip (10 easy + 10 medium + 8 hard, order randomized
// within each tier) rather than a fixed round length like the other
// games, because Grammar Battle ends on its own (lives reach 0) instead
// of after a fixed question count. The client picks the next question
// from the tier bucket matching the current streak (escalates after 3
// correct in a row, drops back after a wrong answer) - a simple
// tier-bucket heuristic over server-supplied content, not a new
// round-trip per question. Every answer is still graded server-side by
// submit_game_round comparing the submitted option text against
// game_content_bank.payload.correct_index; nothing here is trusted.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, Flame, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameResults from '../../components/GameResults';
import useGameStreak from '../../hooks/useGameStreak';
import { getGrammarBattleRound, submitGameRound } from '../../lib/storageBridge';

const START_LIVES = 3;
const TIME_LIMIT_MS = 8000;
const ESCALATE_AFTER = 3;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const TIER_ORDER = ['easy', 'medium', 'hard'];

function pickNextQuestion(pool, used, tier) {
  const tierIndex = TIER_ORDER.indexOf(tier);
  // Prefer the target tier; fall back to any unused question if that
  // tier is exhausted, then to easier tiers, so the round never dead-ends
  // just because one bucket ran out.
  const order = [tier, ...TIER_ORDER.slice(0, tierIndex), ...TIER_ORDER.slice(tierIndex + 1)];
  for (const t of order) {
    const candidates = pool.filter((q) => q.difficulty === t && !used.has(q.id));
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

export default function GrammarBattle() {
  const { t } = useTranslation('game');
  const [pool, setPool] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [usedIds, setUsedIds] = useState(new Set());
  const [current, setCurrent] = useState(null);
  const [tier, setTier] = useState('easy');
  const [lives, setLives] = useState(START_LIVES);
  const [answers, setAnswers] = useState([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_MS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { streak, bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();
  const tickRef = useRef(null);
  const advanceRef = useRef(null);

  const startGame = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setGameOver(false);
    setLives(START_LIVES);
    setAnswers([]);
    setAnsweredCount(0);
    setCorrectCount(0);
    setChosen(null);
    setTier('easy');
    setError(null);
    resetStreak();
    try {
      const { roundId: rid, words } = await getGrammarBattleRound();
      setRoundId(rid);
      setPool(words);
      const used = new Set();
      const first = pickNextQuestion(words, used, 'easy');
      setUsedIds(used);
      setCurrent(first);
    } catch (err) {
      setError(err.message || String(err));
      setPool(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    startGame();
    return () => {
      clearInterval(tickRef.current);
      clearTimeout(advanceRef.current);
    };
  }, [startGame]);

  const finishGame = useCallback(
    async (finalAnswers) => {
      setSubmitting(true);
      setGameOver(true);
      try {
        const res = await submitGameRound('grammar_battle', roundId, finalAnswers);
        setResult(res);
      } finally {
        setSubmitting(false);
      }
    },
    [roundId]
  );

  const advance = useCallback(
    (nextLives, nextAnswers, nextUsed) => {
      if (nextLives <= 0 || !pool) {
        finishGame(nextAnswers);
        return;
      }
      const next = pickNextQuestion(pool, nextUsed, tier);
      if (!next) {
        finishGame(nextAnswers);
        return;
      }
      setCurrent(next);
      setChosen(null);
    },
    [pool, tier, finishGame]
  );

  const nextUsedSet = (id) => {
    const next = new Set(usedIds);
    next.add(id);
    setUsedIds(next);
    return next;
  };

  // Neither branch below knows the true correct answer client-side (the
  // round never reveals correct_index) - a timeout always costs a life
  // as immediate pacing feedback, and a chosen answer is provisionally
  // kept at the current life total until the server grades the whole
  // round and the reconciliation effect below corrects lives/streak to
  // the authoritative values.
  const submitAnswer = (option, skipped, livesOverride) => {
    clearInterval(tickRef.current);
    setChosen(option ?? '');
    const nextAnswers = [...answers, { content_id: current.id, answer: option || '', skipped }];
    setAnswers(nextAnswers);
    setAnsweredCount((c) => c + 1);
    const nextUsed = nextUsedSet(current.id);
    const effectiveLives = livesOverride ?? lives;

    // Adaptive difficulty heuristic: escalate a tier every ESCALATE_AFTER
    // questions answered without losing a life, drop back to easy the
    // moment a life is lost. True per-question correctness isn't known
    // until the whole round is graded, so "no life lost yet" is the best
    // available proxy for "on a good run" within this single-round-trip
    // architecture.
    if (skipped || livesOverride != null) {
      setTier('easy');
    } else if ((answeredCount + 1) % ESCALATE_AFTER === 0) {
      setTier((t) => TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)]);
    }

    advanceRef.current = setTimeout(() => {
      advance(effectiveLives, nextAnswers, nextUsed);
    }, 300);
  };

  const handleChoose = (option) => {
    if (chosen || gameOver) return;
    submitAnswer(option, false);
  };

  const handleTimeout = () => {
    if (chosen || gameOver) return;
    const nextLives = Math.max(0, lives - 1);
    setLives(nextLives);
    submitAnswer(null, true, nextLives);
  };

  // Per-question countdown.
  useEffect(() => {
    if (!current || gameOver) return;
    setTimeLeft(TIME_LIMIT_MS);
    tickRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(tickRef.current);
          handleTimeout();
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, gameOver]);

  // Reconcile lives/streak/tier once the server has graded the round -
  // this is the authoritative pass; it replays the per-item verdicts in
  // submission order to compute real lives lost, real streak, and picks
  // the right tier for the *next* game's opening question.
  useEffect(() => {
    if (!result) return;
    let livesLeft = START_LIVES;
    let runStreak = 0;
    let best = 0;
    let correct = 0;
    (result.results || []).forEach((r) => {
      if (r.correct) {
        correct += 1;
        runStreak += 1;
        best = Math.max(best, runStreak);
      } else {
        runStreak = 0;
        livesLeft = Math.max(0, livesLeft - 1);
      }
    });
    setCorrectCount(correct);
    setLives(livesLeft);
    resetStreak();
    for (let i = 0; i < best; i += 1) recordCorrect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (loading && !gameOver) {
    return <p className="p-10 text-center text-sm text-ink/40">{t('loading')}</p>;
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-rose-600">{t('loadError')}</p>
      </div>
    );
  }

  if (result) {
    const accuracyExtra = (
      <p className="mt-1 text-xs font-semibold text-ink/40">
        {t('questionsAnsweredLine', { count: result.words_total })}
      </p>
    );
    return (
      <GameResults
        gradientClass="from-red-50 to-orange-100"
        score={result.score}
        correct={correctCount}
        total={result.words_total}
        bestStreak={bestStreak}
        isNewBest={result.is_new_best}
        gameType="grammar_battle"
        extra={accuracyExtra}
        onPlayAgain={startGame}
      />
    );
  }

  if (!pool || pool.length === 0 || !current) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('noWords')}</p>
      </div>
    );
  }

  const fractionLeft = timeLeft / TIME_LIMIT_MS;

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">⚔️ {t('grammarBattleTitle')}</h1>
      </header>

      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-1" aria-label={t('livesLabel', { count: lives })}>
          {Array.from({ length: START_LIVES }).map((_, i) => (
            <Heart key={i} size={18} className={i < lives ? 'fill-rose-500 text-rose-500' : 'text-ink/15'} aria-hidden="true" />
          ))}
        </div>
        <p className="flex items-center gap-1 text-xs font-bold text-ink/50">{t('questionCount', { count: answeredCount + 1 })}</p>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">
            <Flame size={12} aria-hidden="true" /> {streak}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold text-white">{t(`difficulty_${current.difficulty}`)}</span>
          <div className="flex items-center gap-1 text-white">
            <Timer size={16} aria-hidden="true" />
            <span className="font-display text-sm font-bold" role="status" aria-live="polite">
              {Math.ceil(timeLeft / 1000)}
            </span>
          </div>
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
          <div
            className={`h-full rounded-full transition-[width] duration-150 ease-linear ${fractionLeft < 0.3 ? 'bg-rose-200' : 'bg-white'}`}
            style={{ width: `${Math.max(0, fractionLeft * 100)}%` }}
          />
        </div>

        <p className="mt-4 font-display text-xl font-extrabold text-white sm:text-2xl">{current.question}</p>

        <div className="mt-5 grid grid-cols-1 gap-2.5">
          {current.options.map((option, i) => {
            const isChosen = chosen === option;
            let style = 'bg-white text-ink active:scale-95';
            if (chosen) {
              style = isChosen ? 'border-2 border-white bg-white text-orange-700' : 'bg-white/70 text-ink/50';
            }
            return (
              <button
                key={option}
                onClick={() => handleChoose(option)}
                disabled={!!chosen || submitting}
                aria-pressed={isChosen}
                className={`flex min-h-[3rem] items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-semibold shadow-sm transition-transform ${style}`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold text-ink/50" aria-hidden="true">
                  {OPTION_LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
