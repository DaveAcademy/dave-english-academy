// WordScramble.jsx
// Word Scramble (Game & Practice System - see migrations 0111/0112).
// Words come from get_word_scramble_round(), which is curriculum- and
// repetition-aware server-side (0112) - this component has no say in
// which words appear or how "difficulty" is chosen. Scrambling and the
// "Correct!"/"Not quite." feedback shown per word are client-side UX
// only, using the same plaintext word the server already handed over -
// they are not the source of truth. The authoritative grade, score, and
// game_sessions row come back from submitGameRound('word_scramble', ...)
// once the whole round is submitted; nothing this component computes
// locally is trusted or re-sent as a claimed result.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Lightbulb, SkipForward, ArrowLeft, CheckCircle2, XCircle, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import { getWordScrambleRound, submitGameRound } from '../../../lib/storageBridge';
import useGameRecord from '../hooks/useGameRecord';
import GameLeaderboardBlock from '../components/GameLeaderboardBlock';
import GameLevelStatus, { LevelBadge } from '../components/GameLevelStatus';

// Same character multiset (same length, same letters, same counts) -
// the one property every generated scramble and every hint reveal must
// preserve. Order doesn't matter, hence the sort-and-compare.
function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  return a.toLowerCase().split('').sort().join('') === b.toLowerCase().split('').sort().join('');
}

function scramble(word) {
  let scrambled = word;
  // Small word lists occasionally can't produce a different order (e.g.
  // "aa") - cap attempts so this can't spin forever. sameMultiset is
  // guaranteed true by construction (every attempt permutes a fresh copy
  // of word's own characters), but is checked explicitly rather than
  // assumed, so a scramble is only ever displayed once verified against
  // the source word - not merely "visually looks shuffled".
  for (let attempt = 0; attempt < 10 && (scrambled === word || !sameMultiset(scrambled, word)); attempt += 1) {
    const letters = word.split('');
    for (let i = letters.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    scrambled = letters.join('');
  }
  return scrambled;
}

// Reveals the answer's first letter without disturbing the rest of the
// scramble's character multiset: swap whichever tile already holds that
// letter into position 0, rather than overwriting position 0 and
// discarding whatever was there (the previous approach, which could
// duplicate a letter and drop another - e.g. "DECORATE" scrambled to
// "ECODRATE" produced "DCODRATE": two D's, no E). A swap can never add,
// remove, or duplicate a character.
function revealFirstLetter(scrambledText, firstChar) {
  const letters = scrambledText.split('');
  if (letters[0].toLowerCase() === firstChar.toLowerCase()) return scrambledText;
  const idx = letters.findIndex((ch) => ch.toLowerCase() === firstChar.toLowerCase());
  if (idx === -1) return scrambledText; // defensive; can't happen if scrambledText is a valid scramble
  [letters[0], letters[idx]] = [letters[idx], letters[0]];
  return letters.join('');
}

// Individual boxed letters rather than one plain string - the "attractive
// letter tiles" requirement. Purely visual; the answer is still typed as
// plain text below (a drag-to-reorder tile interaction is a nice-to-have
// deferred to a later session, not required for the grading contract).
function LetterTiles({ text }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label={text}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border-b-4 border-amber-400 bg-amber-100 font-display text-2xl font-bold text-amber-800 shadow-sm sm:h-14 sm:w-14 sm:text-3xl"
        >
          {ch.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export default function WordScramble() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, english, scrambled }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | null
  const [hintUsed, setHintUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { record } = useGameRecord('word_scramble', !!result);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setInput('');
    setFeedback(null);
    setHintUsed(false);
    setError(null);
    try {
      const { roundId: rid, level: lvl, words } = await getWordScrambleRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words.map((w) => ({ ...w, scrambled: scramble(w.english) })));
    } catch (err) {
      // Same distinction as VocabularyQuiz.jsx: a failed RPC call must not
      // look identical to "no vocabulary available yet".
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

  const recordAnswer = (answer, skipped) => {
    const isCorrect = !skipped && answer.trim().toLowerCase() === current.english.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    setAnswers((prev) => [
      ...prev,
      { vocabulary_id: current.id, answer, used_hint: hintUsed, skipped },
    ]);
  };

  const handleCheck = () => {
    if (feedback || !input.trim()) return;
    recordAnswer(input, false);
  };

  const handleSkip = () => {
    if (feedback) return;
    recordAnswer('', true);
  };

  const handleHint = () => {
    if (feedback || hintUsed) return;
    setHintUsed(true);
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      setIndex((i) => i + 1);
      setInput('');
      setFeedback(null);
      setHintUsed(false);
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('word_scramble', roundId, answers);
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
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 p-6 text-center shadow-card sm:p-8">
          <span className="animate-[bounceIn_0.4s_ease-out]"><PartyPopper size={36} className="mx-auto text-amber-500" aria-hidden="true" /></span>
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          {result.game_points_awarded > 0 ? (
            <div className="mt-4 animate-[scaleIn_0.3s_ease-out_0.15s_both]">
              <p className="font-display text-5xl font-extrabold text-amber-500">+{result.game_points_awarded}</p>
              <p className="mt-1 text-sm font-medium text-ink/60">{t('gamePoints', { defaultValue: 'Game Points' })}</p>
            </div>
          ) : (
            <div className="mt-4 animate-[scaleIn_0.3s_ease-out_0.15s_both]">
              <p className="font-display text-5xl font-extrabold text-brand-600">{result.score}</p>
            </div>
          )}
          <p className="mt-1 text-sm font-medium text-ink/60">{t('correctCount', { correct: result.words_correct, total: result.words_total })}</p>
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
        <h1 className="font-display text-lg font-bold text-ink">🔤 {t('wordScrambleTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 p-5 shadow-card sm:p-6">
        <LetterTiles text={hintUsed ? revealFirstLetter(current.scrambled, current.english[0]) : current.scrambled} />

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          placeholder={t('inputPlaceholder')}
          disabled={!!feedback}
          autoFocus
          aria-label={t('inputPlaceholder')}
          className="input mt-5 rounded-xl border-2 border-white bg-white/90 text-center text-lg font-semibold shadow-sm"
        />

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

        <div className="mt-5 flex items-center justify-between gap-2">
          {feedback ? (
            <button
              onClick={handleNext}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
            >
              {t('next')}
            </button>
          ) : (
            <>
              <button
                onClick={handleHint}
                disabled={hintUsed}
                aria-label={t('hint')}
                className="flex items-center gap-1 rounded-full px-2 py-2 text-xs font-semibold text-ink/50 disabled:opacity-30"
              >
                <Lightbulb size={16} aria-hidden="true" /> {t('hint')}
              </button>
              <div className="flex flex-1 justify-end gap-2">
                <button
                  onClick={handleSkip}
                  aria-label={t('skip')}
                  className="flex items-center gap-1 rounded-full bg-white px-4 py-3 text-sm font-bold text-ink/60 shadow-sm transition-transform active:scale-95"
                >
                  <SkipForward size={16} aria-hidden="true" />
                </button>
                <button
                  onClick={handleCheck}
                  className="flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95"
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
