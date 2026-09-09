// PictureWord.jsx
// Picture Word - vocabulary recall (the replacement for Word Detective in the
// Game Center). Each question shows a picture representing a vocabulary word;
// the student must TYPE the English word for that picture - there are no
// multiple-choice options, so the word is recalled rather than recognised.
//
// Round comes from get_picture_word_round(): 10 pictures drawn from the same
// authoritative picture bank as Picture Quiz (game_content_bank payloads with
// { english, image_url }), chosen entirely server-side. The client never
// receives the answer key, so it can neither reveal nor grade a question
// itself - it only records the typed answer. Authoritative grading (does the
// typed text equal game_content_bank.payload->>'english') happens in
// submitGameRound('picture_word', ...) on the server, the same anti-cheat
// invariant as every other game. Per-question correctness is therefore shown
// only once the server returns the graded round, exactly like Picture Quiz.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ArrowLeft, CheckCircle2, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import { getPictureWordRound, submitGameRound } from '../../../lib/storageBridge';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import GameLevelStatus, { LevelBadge } from '../components/GameLevelStatus';

export default function PictureWord() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, image_url }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const lastAnswersRef = useRef(null);
  const { record } = useGameRecord('picture_word', !!result);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setTyped('');
    setAnswered(false);
    setError(null);
    lastAnswersRef.current = null;
    try {
      const { roundId: rid, level: lvl, words } = await getPictureWordRound();
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

  // Locks in the typed answer for the current picture. Nothing is graded
  // here - correctness is decided server-side on the full round submit.
  const handleCheck = () => {
    if (answered || submitting || !typed.trim()) return;
    setAnswers((prev) => [...prev, { content_id: current.id, answer: typed, skipped: false }]);
    setAnswered(true);
  };

  const handleNext = async () => {
    if (submitting || !answered) return;
    if (index + 1 < round.length) {
      setIndex((i) => i + 1);
      setTyped('');
      setAnswered(false);
      return;
    }
    lastAnswersRef.current = answers;
    setSubmitting(true);
    setLoading(true);
    setError(null);
    try {
      const res = await submitGameRound('picture_word', roundId, answers);
      setResult(res);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  if (loading && !result) {
    return <p className="p-10 text-center text-sm text-ink/40">{t('loading')}</p>;
  }

  if (result) {
    return (
      <div className="animate-[fadeIn_0.3s_ease-out] mx-auto max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-lime-50 to-green-100 p-6 text-center shadow-card sm:p-8">
          <div className="animate-[bounceIn_0.4s_ease-out]">
            <PartyPopper size={36} className="mx-auto text-lime-500" aria-hidden="true" />
          </div>
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          <div className="animate-[scaleIn_0.3s_ease-out_0.15s_both]">
            {result.game_points_awarded > 0 ? (
              <>
                <p className="mt-4 font-display text-5xl font-extrabold text-amber-500">+{result.game_points_awarded}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink/50">{t('gamePoints')}</p>
              </>
            ) : (
              <>
                <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{result.score}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink/50">{t('score')}</p>
              </>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-ink/60">{t('correctCount', { correct: result.words_correct, total: result.words_total })}</p>
          {result.is_new_best && (
            <p className="animate-[pulse_1s_ease-in-out_infinite] mt-3 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">{t('newBest')}</p>
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
              className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-ink hover:shadow active:scale-95"
            >
              <RefreshCw size={16} aria-hidden="true" /> {t('playAgain')}
            </button>
            <Link
              to="/games"
              className="flex items-center justify-center gap-1.5 rounded-full bg-white px-5 py-3 text-sm font-bold text-ink/70 shadow-sm transition-all duration-200 hover:bg-white hover:shadow active:scale-95"
            >
              <ArrowLeft size={16} aria-hidden="true" /> {t('backToPortal')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isSubmitError = !!lastAnswersRef.current;
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-rose-600">{isSubmitError ? t('submitError') : t('loadError')}</p>
        <button
          onClick={() => (isSubmitError ? handleNext() : startRound())}
          disabled={submitting}
          className="mt-4 rounded-full bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
        >
          {t('retryButton')}
        </button>
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
        <h1 className="font-display text-lg font-bold text-ink">✍️ {t('pictureWordTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-lime-50 to-green-100 p-5 shadow-card sm:p-6">
        <p className="text-center text-xs font-bold uppercase tracking-wide text-lime-700/60">{t('pictureWordPrompt')}</p>

        <div className="mx-auto mt-3 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm sm:h-48">
          <img src={current.image_url} alt="" className="h-full w-full object-contain" />
        </div>

        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          placeholder={t('inputPlaceholder')}
          disabled={answered}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          aria-label={t('inputPlaceholder')}
          className="input mt-5 rounded-xl border-2 border-white bg-white/90 text-center text-lg font-semibold shadow-sm"
        />

        {answered && (
          <p role="status" className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-lime-700">
            <CheckCircle2 size={18} className="text-lime-600" aria-hidden="true" /> {t('answerRecorded')}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          {answered ? (
            <button
              onClick={handleNext}
              disabled={submitting}
              className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
            >
              {submitting ? t('loading') : t('next')}
            </button>
          ) : (
            <button
              onClick={handleCheck}
              disabled={!typed.trim()}
              className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
            >
              {t('check')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
