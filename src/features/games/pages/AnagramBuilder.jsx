// AnagramBuilder.jsx
// Anagram Builder: the student sees ONE shuffled letter pool (e.g.
// S T O N E) and must discover valid English words built only from
// those letters (one, son, tone, note, stone, ...). Difficulty is the
// required word count: 2 at level 1 up to 10 at level 90+ (see
// anagramDifficultyForLevel + game_level_to_anagram_range()).
//
// Round lifecycle follows the standard Games pattern:
// get_anagram_builder_round() mints a single-use round server-side from
// the student's own available vocabulary (the same approved source every
// game uses - no second dictionary), guaranteeing candidates >= target
// before the letters are ever shown. submitGameRound('anagram_builder',
// ...) grades authoritatively: normalization, letter-multiset check,
// vocabulary membership, and duplicate rejection all re-run on the
// server; nothing computed here is trusted. Single-use rounds
// (consumed_at) + result_payload replay + the per-(student, game, level)
// points index give exactly-once points, same as every other game.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shuffle, ArrowLeft, CheckCircle2, XCircle, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import GameResults from '../../../components/GameResults';
import { LevelBadge } from '../components/GameLevelStatus';
import useGameStreak from '../hooks/useGameStreak';
import { getAnagramBuilderRound, listAvailableVocabulary, submitGameRound } from '../../../lib/storageBridge';
import { normalizeWord, validateSubmission, shuffleTiles } from '../utils/anagram';

export default function AnagramBuilder() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // { roundId, level, letters, target }
  const [vocabularySet, setVocabularySet] = useState(null); // Set of approved words, or null if unloadable
  const [accepted, setAccepted] = useState([]);
  const [tiles, setTiles] = useState([]);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null); // { type: 'ok' | 'error', key, word }
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const submittedRef = useRef(false);
  const { bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAccepted([]);
    setInput('');
    setFeedback(null);
    setError(null);
    submittedRef.current = false;
    resetStreak();
    try {
      const [newRound, vocabRows] = await Promise.all([
        getAnagramBuilderRound(),
        listAvailableVocabulary().catch(() => null),
      ]);
      setRound(newRound);
      setTiles(shuffleTiles(newRound.letters));
      // Same approved source the server validates against; when unloadable
      // the game still plays (construction + duplicate checks locally) and
      // the server remains the authoritative judge at submit time.
      setVocabularySet(
        vocabRows ? new Set(vocabRows.map((r) => normalizeWord(r.english)).filter((w) => /^[a-z]{3,}$/.test(w))) : null,
      );
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

  const target = round?.target ?? 0;
  const progress = useMemo(() => ({ found: accepted.length, target }), [accepted.length, target]);

  const finishRound = useCallback(async (words) => {
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    setLoading(true);
    setError(null);
    try {
      const res = await submitGameRound('anagram_builder', round.roundId, words.map((word) => ({ word })));
      setResult(res);
    } catch (e) {
      submittedRef.current = false;
      setError(e.message || String(e));
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  }, [round, submitting]);

  // Auto-submit the moment the target is reached; the submitting/
  // submittedRef guards make replay/double-tap submit exactly once
  // client-side (the server's consumed_at + result_payload replay is the
  // authoritative second layer).
  useEffect(() => {
    if (round && !result && accepted.length >= target && target > 0) {
      finishRound(accepted);
    }
  }, [accepted, round, result, target, finishRound]);

  const handleAdd = () => {
    if (!input.trim() || !round || result || submitting) return;
    const validation = validateSubmission(input, { letters: round.letters, accepted, vocabularySet });
    if (validation.ok) {
      setAccepted((prev) => [...prev, validation.word]);
      setInput('');
      setFeedback({ type: 'ok', key: 'anagramFound', word: validation.word });
      recordCorrect();
    } else {
      setFeedback({ type: 'error', key: `anagramReject_${validation.reason}`, word: validation.word });
      recordIncorrect();
    }
  };

  const handleShuffle = () => {
    if (!round || submitting) return;
    setTiles(shuffleTiles(round.letters));
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
        gameType="anagram_builder"
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
        <button
          onClick={startRound}
          disabled={submitting}
          className="mt-4 rounded-full bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
        >
          {t('retryButton')}
        </button>
      </div>
    );
  }

  if (!round) {
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
        <h1 className="font-display text-lg font-bold text-ink">🔡 {t('anagramBuilderTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={round.level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={progress.found} total={progress.target} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">
          {t('anagramProgress', { found: progress.found, target: progress.target })}
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-100 p-5 shadow-card sm:p-6">
        <p className="text-center text-xs font-semibold text-ink/50">{t('anagramHint', { target: progress.target })}</p>

        {/* Shuffled letter pool - display order is meaningless; answers are
            typed, so duplicate letters need no tile tracking. */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:gap-2" aria-label={round.letters}>
          {tiles.map((tile) => (
            <span
              key={tile.id}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border-b-4 border-teal-400 bg-teal-100 font-display text-xl font-bold text-teal-800 shadow-sm sm:h-14 sm:w-14 sm:text-2xl"
            >
              {tile.ch.toUpperCase()}
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-center">
          <button
            onClick={handleShuffle}
            disabled={submitting}
            className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-ink/50 disabled:opacity-30"
          >
            <Shuffle size={14} aria-hidden="true" /> {t('anagramShuffle')}
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('inputPlaceholder')}
            disabled={submitting}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={t('inputPlaceholder')}
            className="input rounded-xl border-2 border-white bg-white/90 text-center text-lg font-semibold shadow-sm"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim() || submitting}
            className="flex-shrink-0 rounded-xl bg-ink px-5 py-2 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40"
          >
            {t('anagramAddWord')}
          </button>
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-bold ${
              feedback.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {feedback.type === 'ok' ? (
              <>
                <CheckCircle2 size={18} aria-hidden="true" /> {t(feedback.key, { word: feedback.word })}
              </>
            ) : (
              <>
                <XCircle size={18} aria-hidden="true" /> {t(feedback.key, { word: feedback.word })}
              </>
            )}
          </p>
        )}

        {/* Accepted words */}
        {accepted.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5" aria-label={t('anagramAcceptedLabel')}>
            {accepted.map((word) => (
              <span
                key={word}
                className="anagram-chip rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-sm"
              >
                {word}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-center">
          <button
            onClick={() => finishRound(accepted)}
            disabled={submitting || accepted.length === 0}
            className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink/60 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
          >
            <Flag size={15} aria-hidden="true" /> {t('anagramFinishEarly')}
          </button>
        </div>
      </div>
      <style>{`
        .anagram-chip { animation: anagramPop 250ms ease-out both; }
        @keyframes anagramPop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .anagram-chip { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
