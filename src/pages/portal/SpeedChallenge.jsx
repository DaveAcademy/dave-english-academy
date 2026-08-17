// SpeedChallenge.jsx
// Speed Challenge (Game & Practice System - see migration 0119). Round
// comes from get_speed_challenge_round(): 10 curriculum-scoped items,
// each with 4 shuffled Uzbek options (same generation as Vocabulary
// Quiz), server-picked via the same pick_game_words() every other game
// uses. Selecting an option advances immediately - no per-question
// round trip - so the countdown and "how fast did they answer" are
// necessarily timed client-side. That elapsed time is sent to the
// server as elapsed_ms, but the server clamps it to a fixed range and
// only ever uses it for a small bonus on TOP of an answer it has
// already verified against lesson_vocabulary.uzbek itself (see 0119's
// header comment) - the client can shave a few bonus points at most,
// never fabricate correctness or the base score.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ArrowLeft, CheckCircle2, XCircle, PartyPopper, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../../components/GameProgress';
import { getSpeedChallengeRound, submitGameRound } from '../../lib/storageBridge';
import useGameRecord from '../../hooks/useGameRecord';
import GameLeaderboardBlock from '../../components/GameLeaderboardBlock';
import GameLevelStatus, { LevelBadge } from '../../components/GameLevelStatus';

const TIME_LIMIT_MS = 10000;
const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function CountdownRing({ fractionLeft }) {
  const urgent = fractionLeft < 0.3;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="flex-shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/40" />
      <circle
        cx="24"
        cy="24"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        className={`transition-[stroke-dashoffset] duration-150 ease-linear ${urgent ? 'text-rose-200' : 'text-white'}`}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - fractionLeft)}
      />
    </svg>
  );
}

export default function SpeedChallenge() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, english, options }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_MS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { record } = useGameRecord('speed_challenge', !!result);
  const questionStart = useRef(0);
  const tickRef = useRef(null);
  const advanceRef = useRef(null);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setChosen(null);
    setError(null);
    try {
      const { roundId: rid, level: lvl, words } = await getSpeedChallengeRound();
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
    return () => {
      clearInterval(tickRef.current);
      clearTimeout(advanceRef.current);
    };
  }, [startRound]);

  const current = round?.[index];

  const finishRound = useCallback(
    async (finalAnswers) => {
      setSubmitting(true);
      try {
        const res = await submitGameRound('speed_challenge', roundId, finalAnswers);
        setResult(res);
      } finally {
        setSubmitting(false);
      }
    },
    [roundId]
  );

  const goToNext = useCallback(
    (nextAnswers) => {
      if (index + 1 < round.length) {
        setIndex((i) => i + 1);
        setChosen(null);
      } else {
        finishRound(nextAnswers);
      }
    },
    [index, round, finishRound]
  );

  const recordAnswer = useCallback(
    (option, skipped) => {
      clearInterval(tickRef.current);
      const elapsed = Date.now() - questionStart.current;
      setChosen(option);
      const nextAnswers = [...answers, { vocabulary_id: current.id, answer: option || '', used_hint: false, skipped, elapsed_ms: elapsed }];
      setAnswers(nextAnswers);
      advanceRef.current = setTimeout(() => goToNext(nextAnswers), 350);
    },
    [answers, current, goToNext]
  );

  // Per-question countdown. Resets whenever the question index changes
  // (i.e. after every answer/timeout, since index only advances then).
  useEffect(() => {
    if (!round || result || error) return;
    questionStart.current = Date.now();
    setTimeLeft(TIME_LIMIT_MS);
    tickRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(tickRef.current);
          recordAnswer(null, true);
          return 0;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, round]);

  const handleChoose = (option) => {
    if (chosen) return;
    recordAnswer(option, false);
  };

  if (loading && !result) {
    return <p className="p-10 text-center text-sm text-ink/40">{t('loading')}</p>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 to-orange-100 p-6 text-center shadow-card sm:p-8">
          <PartyPopper size={36} className="mx-auto text-rose-500" aria-hidden="true" />
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{result.score}</p>
          <p className="mt-1 text-sm font-medium text-ink/60">{t('correctCount', { correct: result.words_correct, total: result.words_total })}</p>
          {result.is_new_best && (
            <p className="mt-3 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">{t('newBest')}</p>
          )}

          <GameLevelStatus level={result.level} pass={result.pass} leveledUp={result.leveled_up} />

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

  const fractionLeft = timeLeft / TIME_LIMIT_MS;

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">
          <Zap size={18} className="mr-1 inline text-rose-500" aria-hidden="true" />
          {t('speedChallengeTitle')}
        </h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 p-5 shadow-card sm:p-6 ${submitting ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex-1 font-display text-2xl font-extrabold text-white sm:text-3xl">{current.english}</p>
          <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
            <CountdownRing fractionLeft={fractionLeft} />
            <span className="absolute font-display text-xs font-bold text-white" role="status" aria-live="polite">
              {Math.ceil(timeLeft / 1000)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {current.options.map((option, i) => {
            const isChosen = chosen === option;
            let style = 'border-white/0 bg-white text-ink active:scale-95';
            if (chosen) {
              style = isChosen ? 'border-2 border-white bg-white text-rose-700' : 'border-white/0 bg-white/70 text-ink/50';
            }
            return (
              <button
                key={option}
                onClick={() => handleChoose(option)}
                disabled={!!chosen || submitting}
                aria-pressed={isChosen}
                className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-sm transition-transform ${style}`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isChosen ? 'bg-rose-500 text-white' : 'bg-ink/5 text-ink/50'
                  }`}
                  aria-hidden="true"
                >
                  {OPTION_LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
                {isChosen && <CheckCircle2 size={18} className="flex-shrink-0 text-rose-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {chosen === null && timeLeft <= 0 && (
          <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-bold text-white">
            <XCircle size={16} aria-hidden="true" /> {t('timeUp')}
          </p>
        )}
      </div>
    </div>
  );
}
