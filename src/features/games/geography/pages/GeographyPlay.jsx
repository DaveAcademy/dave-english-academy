// GeographyPlay.jsx
// One shared play screen for both Geography modes (flag -> country and
// flag -> nationality). 10-question round, immediate feedback, local-only
// scoring via the geography engine (no submitGameRound/XP/leaderboard).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, PartyPopper, Flame } from 'lucide-react';
import GameProgress from '../../components/GameProgress';
import { COUNTRIES } from '../data/countries';
import {
  ROUND_LENGTH,
  accuracy,
  applyAnswer,
  filterPoolByDifficulty,
  initialScoreState,
  isRoundComplete,
  scoreAnswer,
} from '../utils/engine';
import { MODES, buildModeQuestion, isValidMode } from '../utils/modes';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function GeographyPlay() {
  const { t } = useTranslation('game');
  const [params] = useSearchParams();
  const mode = params.get('mode');
  const difficulty = params.get('difficulty') || 'mixed';

  const valid = isValidMode(mode);
  const [roundKey, setRoundKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [totals, setTotals] = useState(initialScoreState);
  const [lastPoints, setLastPoints] = useState(0);
  const [flagError, setFlagError] = useState(false);
  const questionStartRef = useRef(Date.now());

  const questions = useMemo(() => {
    if (!valid) return [];
    const pool = filterPoolByDifficulty(COUNTRIES, difficulty);
    // Shuffle pool order per round; cycle if pool smaller than round.
    const order = [...pool].sort(() => Math.random() - 0.5);
    const out = [];
    for (let i = 0; i < ROUND_LENGTH; i++) {
      const target = order[i % order.length];
      out.push(buildModeQuestion(target, pool, mode));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, mode, difficulty, roundKey]);

  useEffect(() => {
    questionStartRef.current = Date.now();
    setFlagError(false);
  }, [index, roundKey]);

  if (!valid) {
    return <Navigate to="/geography" replace />;
  }

  const current = questions[index];
  const done = isRoundComplete(totals.total, questions.length);

  const handleChoose = (option) => {
    if (chosen || done) return;
    const isCorrect = option === current.correct;
    const elapsedSec = (Date.now() - questionStartRef.current) / 1000;
    const { points } = scoreAnswer({ isCorrect, streakBefore: totals.streak, elapsedSec });
    setChosen(option);
    setLastPoints(points);
    setTotals((s) => applyAnswer(s, { isCorrect, points }));
  };

  const handleNext = () => {
    if (!chosen) return;
    if (totals.total >= questions.length) return;
    setIndex((i) => i + 1);
    setChosen(null);
  };

  const handleRestart = () => {
    setRoundKey((k) => k + 1);
    setIndex(0);
    setChosen(null);
    setTotals(initialScoreState());
  };

  // Keyboard: 1-4 / A-D to answer, Enter for next.
  useEffect(() => {
    const onKey = (e) => {
      if (done || !current) return;
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4'].indexOf(k) !== -1
        ? ['1', '2', '3', '4'].indexOf(k)
        : ['a', 'b', 'c', 'd'].indexOf(k);
      if (idx !== -1 && current.options[idx]) {
        handleChoose(current.options[idx]);
      } else if (k === 'enter' && chosen) {
        handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, chosen, done, totals.total]);

  if (done) {
    const modeLabel = mode === MODES.country ? t('geographyCountryTitle') : t('geographyNationalityTitle');
    return (
      <div className="mx-auto max-w-sm animate-[fadeIn_0.3s_ease-out]">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 p-6 text-center shadow-card sm:p-8">
          <div className="animate-[bounceIn_0.4s_ease-out]">
            <PartyPopper size={36} className="mx-auto text-emerald-500" aria-hidden="true" />
          </div>
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          <p className="mt-1 text-xs font-semibold text-ink/50">{modeLabel} · {t(`difficulty_${difficulty}`)}</p>
          <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{totals.score}</p>
          <div className="mt-2 flex items-center justify-center gap-3 text-sm font-medium text-ink/60">
            <span>{t('correctCount', { correct: totals.correct, total: totals.total })}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-ink/60">{t('accuracyLine', { accuracy: accuracy(totals.correct, totals.total) })}</p>
          <p className="mt-1 text-sm font-medium text-ink/60">{t('bestStreakLine', { streak: totals.bestStreak })}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={handleRestart}
              className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
            >
              <RefreshCw size={16} aria-hidden="true" /> {t('playAgain')}
            </button>
            <Link
              to="/geography"
              className="flex items-center justify-center gap-1.5 rounded-full bg-white px-5 py-3 text-sm font-bold text-ink/70 shadow-sm transition-transform active:scale-95"
            >
              <ArrowLeft size={16} aria-hidden="true" /> {t('backToGames')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const isCorrectChoice = chosen && chosen === current.correct;

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/geography" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToGames')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">
          🌍 {mode === MODES.country ? t('geographyCountryTitle') : t('geographyNationalityTitle')}
        </h1>
        <span className="ml-auto flex items-center gap-2 text-sm font-bold text-ink/60">
          {totals.streak >= 2 && (
            <span className="flex items-center gap-0.5 text-orange-500" title={t('streakLabel', { count: totals.streak })}>
              <Flame size={15} aria-hidden="true" />{totals.streak}
            </span>
          )}
          <span className="tabular-nums">{totals.score}</span>
        </span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={questions.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">
          {t('questionOf', { current: index + 1, total: questions.length })}
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 p-5 shadow-card sm:p-6">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-emerald-700/60">{t(current.promptKey)}</p>

        {!flagError ? (
          <img
            src={current.flagUrl}
            alt={t('flagAlt', { country: current.country })}
            width={320}
            height={213}
            loading="eager"
            onError={() => setFlagError(true)}
            className="mx-auto mt-3 aspect-[3/2] w-full max-w-[320px] rounded-lg border border-ink/10 bg-white object-cover shadow-sm"
          />
        ) : (
          <div className="mx-auto mt-3 flex aspect-[3/2] w-full max-w-[320px] flex-col items-center justify-center rounded-lg border border-ink/10 bg-white p-4 text-center shadow-sm" role="img" aria-label={t('flagAlt', { country: current.country })}>
            <p className="font-display text-2xl font-extrabold tracking-widest text-ink">{current.iso2}</p>
            <p className="mt-1 text-xs text-ink/50">{t('flagLoadError')}</p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="group" aria-label={t(current.promptKey)}>
          {current.options.map((option, i) => {
            const isChosen = chosen === option;
            const isAnswer = option === current.correct;
            let style = 'border-ink/10 bg-white text-ink hover:border-emerald-300 active:scale-95';
            let badge = 'bg-ink/5 text-ink/50';
            if (chosen) {
              if (isAnswer) {
                style = 'border-2 border-emerald-500 bg-emerald-100 text-emerald-900';
                badge = 'bg-emerald-500 text-white';
              } else if (isChosen) {
                style = 'border-2 border-rose-500 bg-rose-100 text-rose-900';
                badge = 'bg-rose-500 text-white';
              } else {
                style = 'border-ink/10 bg-white/60 text-ink/40';
              }
            }
            return (
              <button
                key={option}
                onClick={() => handleChoose(option)}
                disabled={!!chosen}
                aria-pressed={isChosen}
                className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-sm transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${style}`}
              >
                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`} aria-hidden="true">
                  {OPTION_LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
                {chosen && isAnswer && <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-600" aria-hidden="true" />}
                {chosen && isChosen && !isAnswer && <XCircle size={18} className="flex-shrink-0 text-rose-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {chosen && (
          <div role="status" className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-semibold ${isCorrectChoice ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>
            {isCorrectChoice ? `${t('correct')} +${lastPoints}` : `${t('incorrect')} ${t('correctAnswerWas', { answer: current.correct })}`}
            {current.funFact && <p className="mt-1 text-xs font-medium text-ink/60">{current.funFact}</p>}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          {chosen && (
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
