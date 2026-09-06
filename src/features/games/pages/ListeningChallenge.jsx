// ListeningChallenge.jsx
// Plays a vocabulary word aloud (browser SpeechSynthesis - the project
// has no existing TTS/audio pipeline for games; nothing else in
// src/pages/portal uses `speak`/`Audio(`/TTS, so no copyrighted audio is
// sourced or embedded, per the task brief) and asks the student to pick
// its meaning from 4 options. Content/grading is the same vocabulary
// pipeline as VocabularyQuiz/SpeedChallenge via
// get_listening_challenge_round() / submitGameRound('listening_challenge', ...)
// (migration 0142) - server-side truth, client never asserts correctness.
//
// `answerType: 'mcq'` is carried on every recorded answer so a future
// typed-answer mode is a straightforward addition (a second branch that
// sets answerType: 'typed' and a text input instead of option buttons) -
// only MCQ is built now, per the brief.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import GameProgress from '../components/GameProgress';
import GameResults from '../../../components/GameResults';
import { LevelBadge } from '../components/GameLevelStatus';
import useGameStreak from '../hooks/useGameStreak';
import { getListeningChallengeRound, submitGameRound } from '../../../lib/storageBridge';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

// Mobile TTS is flaky in two specific, well-documented ways this app was
// hitting:
// 1. Voices load asynchronously (voiceschanged) - speak() called before
//    that fires can silently produce no audio at all on Android/iOS, even
//    though it works instantly on desktop (voices are preloaded there).
// 2. speak() called immediately after cancel() in the same tick is a known
//    Chromium/WebView bug that drops the utterance silently - a 0ms
//    setTimeout between them is the standard workaround.
// Neither throws an error, so without this the failure is invisible.
function pickEnglishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-US') || voices.find((v) => v.lang?.startsWith('en')) || null;
}

function speak(text, { onStart, onEnd, onError } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  const doSpeak = () => {
    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;
      if (onStart) utterance.onstart = onStart;
      if (onEnd) utterance.onend = onEnd;
      if (onError) {
        utterance.onerror = (event) => {
          // 'canceled'/'interrupted' fire on the PREVIOUS utterance every
          // time a new speak() calls cancel() to replace it (next word,
          // rapid replay taps) - that's expected traffic, not a real
          // failure, and must not be reported as one.
          if (event.error === 'canceled' || event.error === 'interrupted') return;
          onError(event);
        };
      }
      window.speechSynthesis.speak(utterance);
    }, 0);
  };
  // getVoices() is synchronous but returns [] until the browser has loaded
  // its voice list at least once - wait for that one time per page.
  if (window.speechSynthesis.getVoices().length === 0) {
    let fired = false;
    const fireOnce = () => {
      if (fired) return;
      fired = true;
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
    window.speechSynthesis.onvoiceschanged = fireOnce;
    // Some mobile WebViews never fire voiceschanged - don't leave the
    // student stuck with permanent silence if it doesn't.
    setTimeout(fireOnce, 600);
  } else {
    doSpeak();
  }
  return true;
}

export default function ListeningChallenge() {
  const { t } = useTranslation('game');
  const [round, setRound] = useState(null);
  const [roundId, setRoundId] = useState(null);
  const [level, setLevel] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [ttsFailed, setTtsFailed] = useState(false);
  const { bestStreak, recordCorrect, recordIncorrect, reset: resetStreak } = useGameStreak();
  const hasPlayedRef = useRef(false);

  const startRound = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setAnswers([]);
    setIndex(0);
    setChosen(null);
    setError(null);
    resetStreak();
    try {
      const { roundId: rid, level: lvl, words } = await getListeningChallengeRound();
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

  useEffect(() => {
    setTtsSupported(typeof window !== 'undefined' && !!window.speechSynthesis);
  }, []);

  const current = round?.[index];

  // Auto-play once per question when it first appears.
  useEffect(() => {
    if (!current || chosen) return;
    hasPlayedRef.current = false;
    setTtsFailed(false);
    const played = speak(current.english, {
      onStart: () => setTtsFailed(false),
      onError: () => setTtsFailed(true),
    });
    if (played) hasPlayedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, round]);

  const handleReplay = () => {
    if (!current) return;
    setTtsFailed(false);
    speak(current.english, {
      onStart: () => setTtsFailed(false),
      onError: () => setTtsFailed(true),
    });
  };

  // The round never exposes which option is correct (server-graded only),
  // so choosing just records the tap and shows a neutral "recorded"
  // state - no client-side green/red guess.
  const handleChoose = (option) => {
    if (chosen || submitting) return;
    setChosen(option);
    setAnswers((prev) => [...prev, { vocabulary_id: current.id, answer: option, used_hint: false, skipped: false, answerType: 'mcq' }]);
  };

  const handleNext = async () => {
    if (submitting || !chosen) return;
    if (index + 1 < round.length) {
      setIndex((i) => i + 1);
      setChosen(null);
      return;
    }
    setSubmitting(true);
    setLoading(true);
    setError(null);
    try {
      const res = await submitGameRound('listening_challenge', roundId, answers);
      setResult(res);
      (res.results || []).forEach((r) => (r.correct ? recordCorrect() : recordIncorrect()));
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
      <GameResults
        gradientClass="from-cyan-50 to-blue-100"
        score={result.score}
        correct={result.words_correct}
        total={result.words_total}
        bestStreak={bestStreak}
        isNewBest={result.is_new_best}
        gameType="listening_challenge"
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
          onClick={handleNext}
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
        <h1 className="font-display text-lg font-bold text-ink">🎧 {t('listeningChallengeTitle')}</h1>
        <span className="ml-auto"><LevelBadge level={level} /></span>
      </header>

      <div className="mb-4">
        <GameProgress current={index} total={round.length} />
        <p className="mt-1.5 text-center text-xs font-semibold text-ink/40">{t('wordOf', { current: index + 1, total: round.length })}</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 p-5 shadow-card sm:p-6">
        <div className="flex flex-col items-center">
          <button
            onClick={handleReplay}
            disabled={!ttsSupported}
            aria-label={t('replay')}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
          >
            <Volume2 size={28} aria-hidden="true" />
          </button>
          <p className="mt-2 text-xs font-bold text-white/90">{t('replay')}</p>
          {!ttsSupported && <p className="mt-1 text-xs font-semibold text-white">{t('ttsUnsupported')}</p>}
          {ttsSupported && ttsFailed && <p className="mt-1 text-xs font-semibold text-white">{t('ttsNoVoice')}</p>}
        </div>

        <p className="mt-4 text-center text-sm font-semibold text-white/90">{t('listenPrompt')}</p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {(current.options || []).map((option, i) => {
            const isChosen = chosen === option;
            let style = 'bg-white text-ink active:scale-95';
            if (chosen) {
              style = isChosen ? 'border-2 border-white bg-white text-cyan-700' : 'bg-white/70 text-ink/50';
            }
            return (
              <button
                key={option}
                onClick={() => handleChoose(option)}
                disabled={!!chosen}
                aria-pressed={isChosen}
                className={`flex min-h-[3.25rem] items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-semibold shadow-sm transition-transform ${style}`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold text-ink/50" aria-hidden="true">
                  {OPTION_LETTERS[i]}
                </span>
                <span className="flex-1">{option}</span>
                {isChosen && <CheckCircle2 size={18} className="flex-shrink-0 text-cyan-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {chosen && (
          <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm font-bold text-white">
            {t('answerRecorded')}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          {chosen && (
            <button
              onClick={handleNext}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-full bg-white px-6 py-3 text-sm font-bold text-cyan-700 shadow-sm transition-transform active:scale-95 disabled:opacity-50"
            >
              {submitting ? t('loading') : t('next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
