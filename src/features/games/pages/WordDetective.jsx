// WordDetective.jsx
// A sentence has exactly one wrong word. The student taps the wrong
// word, then picks/confirms its correction, then sees a short
// explanation of why. Content is a curated bank (word confusion, word
// form, common grammar mistakes, prepositions, articles, spelling,
// tense - ~45 items) seeded into game_content_bank by migration 0142;
// get_word_detective_round() strips the answer key before sending the
// sentence to the client, and submit_game_round grades the tapped index
// + typed correction against the stored payload - the explanation text
// itself is only ever shown after the server has graded the answer.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import GameResults from '../../../components/GameResults';
import { LevelBadge } from '../components/GameLevelStatus';
import useGameStreak from '../hooks/useGameStreak';
import { getWordDetectiveRound, submitGameRound } from '../../../lib/storageBridge';

export default function WordDetective() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null); // [{ id, sentence, category }]
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [pickedIndex, setPickedIndex] = useState(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [stage, setStage] = useState('pick'); // 'pick' | 'correct' | 'done'
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setError(null);
    setStage('pick');
    setPickedIndex(null);
    setCorrectionInput('');
    resetStreak();
    try {
      const { roundId: rid, level: lvl, words } = await getWordDetectiveRound();
      setRoundId(rid);
      setLevel(lvl);
      setRound(words);
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
  const tokens = current ? current.sentence.replace(/[.?!]$/, '').split(' ') : [];
  const endPunct = current ? current.sentence.match(/[.?!]$/)?.[0] || '' : '';

  const handlePickWord = (i) => {
    if (stage !== 'pick') return;
    setPickedIndex(i);
    setCorrectionInput(tokens[i]);
    setStage('correct');
  };

  const handleConfirm = () => {
    if (stage !== 'correct') return;
    setAnswers((prev) => [
      ...prev,
      { content_id: current.id, wrong_index: pickedIndex, correction: correctionInput, skipped: false },
    ]);
    setStage('done');
  };

  const handleNext = async () => {
    if (index + 1 < round.length) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setStage('pick');
      setPickedIndex(null);
      setCorrectionInput('');
      return;
    }
    setLoading(true);
    try {
      const res = await submitGameRound('word_detective', roundId, answers);
      setResult(res);
      (res.results || []).forEach((r) => (r.correct ? recordCorrect() : recordIncorrect()));
    } catch (e) {
      setError(e.message || String(e));
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
        gradientClass="from-slate-50 to-zinc-200"
        score={result.score}
        correct={result.words_correct}
        total={result.words_total}
        bestStreak={bestStreak}
        isNewBest={result.is_new_best}
        gameType="word_detective"
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
        <h1 className="font-display text-lg font-bold text-ink">🔍 {t('wordDetectiveTitle')}</h1>
      </header>

      <div className="mb-4">
        <div className="mb-2 flex justify-center">
          <LevelBadge level={level} />
        </div>
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-zinc-200 p-5 shadow-card sm:p-6">
        <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Search size={14} aria-hidden="true" /> {t('detectivePrompt')}
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5 rounded-xl bg-white/70 p-3">
          {tokens.map((word, i) => (
            <button
              key={i}
              onClick={() => handlePickWord(i)}
              disabled={stage !== 'pick'}
              className={`rounded-md px-2 py-1 text-sm font-semibold transition-all duration-200 ${
                pickedIndex === i ? 'bg-slate-700 text-white' : 'text-ink hover:bg-slate-200'
              } disabled:hover:bg-transparent`}
            >
              {word}
            </button>
          ))}
          <span className="text-sm font-semibold text-ink">{endPunct}</span>
        </div>

        {stage === 'correct' && (
          <div className="mt-4">
            <p className="text-center text-xs font-semibold text-ink/50">{t('correctionPrompt', { word: tokens[pickedIndex] })}</p>
            <input
              value={correctionInput}
              onChange={(e) => setCorrectionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              autoFocus
              aria-label={t('correctionPrompt', { word: tokens[pickedIndex] })}
              className="input mt-2 rounded-xl border-2 border-white bg-white text-center text-base font-semibold shadow-sm"
            />
            <div className="mt-3 flex justify-center gap-2">
              <button
                onClick={() => {
                  setStage('pick');
                  setPickedIndex(null);
                }}
                className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-ink/60 shadow-sm"
              >
                {t('reset')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!correctionInput.trim() || submitting}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
              >
                {t('check')}
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div className="mt-4 text-center">
            <p role="status" className="flex items-center justify-center gap-1.5 text-sm font-bold text-slate-700 animate-correct">
              <CheckCircle2 size={18} aria-hidden="true" /> {t('answerRecorded')}
            </p>
            <p className="mt-1 text-xs text-ink/50">{t('explanationRevealNote')}</p>
            <button
              onClick={handleNext}
              className="mt-4 flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-95 mx-auto"
            >
              {t('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
