// VocabularyQuiz.jsx
// Vocabulary Quiz (Game & Practice System - see migration 0112). Rounds
// come from get_vocabulary_quiz_round(): each item is an English word
// plus 4 shuffled Uzbek options (1 correct + 3 curriculum-scoped
// distractors), chosen entirely server-side. The client only ever
// submits which option text the student clicked - grading (does that
// text match lesson_vocabulary.uzbek) happens in submitGameRound() on
// the server, exactly like Word Scramble; nothing here is trusted.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ArrowLeft, CheckCircle2, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import { getVocabularyQuizRound, submitGameRound } from '../../../lib/storageBridge';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import GameLevelStatus, { LevelBadge } from '../components/GameLevelStatus';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function VocabularyQuiz() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, english, options }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { record } = useGameRecord('vocabulary_quiz', !!result);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setChosen(null);
    setError(null);
    try {
      const { roundId: rid, level: lvl, words } = await getVocabularyQuizRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words);
    } catch (err) {
      // A failed RPC call (e.g. it doesn't exist yet on this environment)
      // must not look like "you've simply run out of vocabulary" - those
      // have different fixes and shouldn't be indistinguishable to a
      // student or to whoever's debugging their report.
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

  const handleChoose = (option) => {
    if (chosen) return;
    setChosen(option);
    setAnswers((prev) => [...prev, { vocabulary_id: current.id, answer: option, used_hint: false, skipped: false }]);
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      setIndex((i) => i + 1);
      setChosen(null);
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('vocabulary_quiz', roundId, answers);
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
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-blue-100 p-6 text-center shadow-card sm:p-8">
          <div className="animate-[bounceIn_0.4s_ease-out]">
            <PartyPopper size={36} className="mx-auto text-sky-500" aria-hidden="true" />
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

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🧠 {t('vocabularyQuizTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-blue-100 p-5 shadow-card sm:p-6">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-sky-700/60">{t('quizPrompt')}</p>
        <p className="mt-1 text-center font-display text-3xl font-extrabold text-ink sm:text-4xl">{current.english}</p>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {current.options.map((option, i) => {
            const isChosen = chosen === option;
            let style = 'border-ink/10 bg-white text-ink active:scale-95';
            if (chosen) {
              style = isChosen
                ? 'border-2 border-sky-500 bg-sky-100 text-sky-900'
                : 'border-ink/10 bg-white/60 text-ink/40';
            }
            return (
              <button
                key={option}
                onClick={() => handleChoose(option)}
                disabled={!!chosen}
                aria-pressed={isChosen}
                className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm font-semibold shadow-sm transition-all duration-200 ${style}`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isChosen ? 'bg-sky-500 text-white' : 'bg-ink/5 text-ink/50'
                  }`}
                  aria-hidden="true"
                >
                  {OPTION_LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
                {isChosen && <CheckCircle2 size={18} className="flex-shrink-0 text-sky-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {chosen && (
          <p role="status" className="mt-4 text-center text-sm font-semibold text-ink/60 animate-correct">
            {t('answerRecorded')}
          </p>
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
