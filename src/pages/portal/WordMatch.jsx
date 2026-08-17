// WordMatch.jsx
// Word Match (Game & Practice System - see migration 0117). Round comes
// from get_word_match_round(): 6 curriculum-scoped English/Uzbek pairs,
// same server-side selection as every other game (pick_game_words()).
// Tap an English word, then its Uzbek match - the local "is this the
// right pair" check is client-side UX only (instant feedback, no
// round-trip per tap); the authoritative grade comes back from
// submitGameRound('word_match', ...) once every pair is matched and
// submitted, exactly like Word Scramble/Vocabulary Quiz. The client
// never asserts a claimed score - it only reports which vocabulary_id it
// paired with which typed answer text, and the server re-checks that
// against lesson_vocabulary.uzbek.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, ArrowLeft, CheckCircle2, PartyPopper } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../../components/GameProgress';
import { getWordMatchRound, submitGameRound } from '../../lib/storageBridge';
import useGameRecord from '../../hooks/useGameRecord';
import GameLeaderboardBlock from '../../components/GameLeaderboardBlock';

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function WordMatch() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, english, uzbek }]
  const [roundId, setRoundId] = useState(null);
  const [uzbekTiles, setUzbekTiles] = useState([]); // [{ vocabularyId, text }] shuffled
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [selectedEnglishId, setSelectedEnglishId] = useState(null);
  const [selectedUzbekTile, setSelectedUzbekTile] = useState(null); // index into uzbekTiles
  const [wrongPair, setWrongPair] = useState(null); // { englishId, uzbekTile }
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const wrongTimeout = useRef(null);
  const { record } = useGameRecord('word_match', !!result);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setMatchedIds(new Set());
    setSelectedEnglishId(null);
    setSelectedUzbekTile(null);
    setWrongPair(null);
    setError(null);
    try {
      const { roundId: rid, words } = await getWordMatchRound();
      setRoundId(rid);
      setRound(words);
      setUzbekTiles(shuffle(words.map((w) => ({ vocabularyId: w.id, text: w.uzbek }))));
    } catch (err) {
      setError(err.message || String(err));
      setRound(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startRound();
    return () => clearTimeout(wrongTimeout.current);
  }, [startRound]);

  const submitRound = useCallback(
    async (finalAnswers) => {
      setSubmitting(true);
      try {
        const res = await submitGameRound('word_match', roundId, finalAnswers);
        setResult(res);
      } finally {
        setSubmitting(false);
      }
    },
    [roundId]
  );

  const tryMatch = (englishId, uzbekTileIndex) => {
    const tile = uzbekTiles[uzbekTileIndex];
    const isCorrect = tile.vocabularyId === englishId;

    if (isCorrect) {
      const nextAnswers = [...answers, { vocabulary_id: englishId, answer: tile.text, used_hint: false, skipped: false }];
      const nextMatched = new Set(matchedIds);
      nextMatched.add(englishId);
      setAnswers(nextAnswers);
      setMatchedIds(nextMatched);
      setSelectedEnglishId(null);
      setSelectedUzbekTile(null);
      if (nextMatched.size === round.length) {
        submitRound(nextAnswers);
      }
      return;
    }

    setWrongPair({ englishId, uzbekTile: uzbekTileIndex });
    wrongTimeout.current = setTimeout(() => {
      setWrongPair(null);
      setSelectedEnglishId(null);
      setSelectedUzbekTile(null);
    }, 500);
  };

  const handleSelectEnglish = (id) => {
    if (matchedIds.has(id) || wrongPair) return;
    if (selectedUzbekTile != null) {
      tryMatch(id, selectedUzbekTile);
      return;
    }
    setSelectedEnglishId(id);
  };

  const handleSelectUzbek = (index) => {
    if (matchedIds.has(uzbekTiles[index].vocabularyId) || wrongPair) return;
    if (selectedEnglishId != null) {
      tryMatch(selectedEnglishId, index);
      return;
    }
    setSelectedUzbekTile(index);
  };

  if (loading && !result) {
    return <p className="p-10 text-center text-sm text-ink/40">{t('loading')}</p>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-sm">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 to-purple-100 p-6 text-center shadow-card sm:p-8">
          <PartyPopper size={36} className="mx-auto text-violet-500" aria-hidden="true" />
          <h1 className="mt-2 font-display text-xl font-bold text-ink">{t('resultsTitle')}</h1>
          <p className="mt-4 font-display text-5xl font-extrabold text-brand-600">{result.score}</p>
          <p className="mt-1 text-sm font-medium text-ink/60">{t('correctCount', { correct: result.words_correct, total: result.words_total })}</p>
          {result.is_new_best && (
            <p className="mt-3 inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950">{t('newBest')}</p>
          )}

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

  const matchedCount = matchedIds.size;

  return (
    <div className="mx-auto max-w-sm">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/games" className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink" aria-label={t('backToPortal')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="font-display text-lg font-bold text-ink">🧩 {t('wordMatchTitle')}</h1>
      </header>

      <div className="mb-4">
        <GameProgress current={matchedCount} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">
          {t('matchProgress', { matched: matchedCount, total: round.length })}
        </p>
      </div>

      <div className={`rounded-2xl bg-gradient-to-br from-violet-50 to-purple-100 p-4 shadow-card sm:p-5 ${submitting ? 'opacity-60' : ''}`}>
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-violet-700/60">{t('matchPrompt')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            {round.map((w) => {
              const isMatched = matchedIds.has(w.id);
              const isSelected = selectedEnglishId === w.id;
              const isWrong = wrongPair?.englishId === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => handleSelectEnglish(w.id)}
                  disabled={isMatched || submitting}
                  aria-pressed={isSelected}
                  className={`flex min-h-[3rem] items-center justify-center rounded-xl border px-2 py-2.5 text-center text-sm font-bold shadow-sm transition-transform ${
                    isWrong
                      ? 'animate-shake border-rose-400 bg-rose-50 text-rose-700'
                      : isMatched
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 opacity-70'
                        : isSelected
                          ? 'border-2 border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-white bg-white text-ink active:scale-95'
                  }`}
                >
                  {isMatched && <CheckCircle2 size={14} className="mr-1 flex-shrink-0" aria-hidden="true" />}
                  {w.english}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            {uzbekTiles.map((tile, i) => {
              const isMatched = matchedIds.has(tile.vocabularyId);
              const isSelected = selectedUzbekTile === i;
              const isWrong = wrongPair?.uzbekTile === i;
              return (
                <button
                  key={i}
                  onClick={() => handleSelectUzbek(i)}
                  disabled={isMatched || submitting}
                  aria-pressed={isSelected}
                  className={`flex min-h-[3rem] items-center justify-center rounded-xl border px-2 py-2.5 text-center text-sm font-bold shadow-sm transition-transform ${
                    isWrong
                      ? 'animate-shake border-rose-400 bg-rose-50 text-rose-700'
                      : isMatched
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 opacity-70'
                        : isSelected
                          ? 'border-2 border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-white bg-white text-ink active:scale-95'
                  }`}
                >
                  {isMatched && <CheckCircle2 size={14} className="mr-1 flex-shrink-0" aria-hidden="true" />}
                  {tile.text}
                </button>
              );
            })}
          </div>
        </div>

        {wrongPair && (
          <p role="status" className="mt-3 text-center text-sm font-bold text-rose-600">
            {t('tryAgain')}
          </p>
        )}
      </div>
    </div>
  );
}
