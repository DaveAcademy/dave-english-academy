// Dictionary.jsx - Dictionary V1: Learn / Review / Challenge / Progress /
// Leaderboard / Search. Server-authoritative SRS (migrations 0181-0185):
// every state change flows through schedule_dictionary_review() on the
// server; this UI never computes intervals or states client-side. The
// daily new-word limit is enforced server-side too (start_dictionary_words
// clamps to the remaining daily allowance), so the buttons here can never
// over-add. Challenge/Progress/Leaderboard/Search live in
// components/dictionary/DictionaryTabs.jsx to keep this file focused on
// the two core flows.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Check } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import {
  getNextWords, startWords, getDueReviews, scheduleReview,
} from '../../lib/dictionaryBridge';
import {
  QUALITY, STATE_META, speak, supportsSpeech,
  Pill, EmptyState, ErrorBanner, SkeletonRows,
} from '../../components/dictionary/shared';
import {
  ChallengeTab, ProgressTab, LeaderboardTab, SearchTab,
} from '../../components/dictionary/DictionaryTabs';

const TABS = ['learn', 'review', 'challenge', 'progress', 'leaderboard', 'search'];

export default function Dictionary() {
  const { t } = useTranslation('dictionary');
  const { students } = useAcademy();
  const me = students[0];
  const [tab, setTab] = useState('learn');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('subtitleV1')}</p>
      </header>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink/50 hover:bg-ink/[0.04] hover:text-ink/70'
            }`}
          >
            {t(`tab_${key}`)}
          </button>
        ))}
      </div>

      {tab === 'learn' && <LearnTab me={me} t={t} />}
      {tab === 'review' && <ReviewTab me={me} t={t} />}
      {tab === 'challenge' && <ChallengeTab me={me} t={t} />}
      {tab === 'progress' && <ProgressTab me={me} t={t} />}
      {tab === 'leaderboard' && <LeaderboardTab me={me} t={t} />}
      {tab === 'search' && <SearchTab t={t} />}
    </div>
  );
}

// ---------- Learn: today's curriculum words, reveal then add ----------
function LearnTab({ me, t }) {
  const [candidates, setCandidates] = useState([]);
  const [addedCount, setAddedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(false);
    try {
      setCandidates((await getNextWords(me.id, 5)) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!candidates.length) return;
    setAdding(true);
    try {
      const count = await startWords(candidates.map((w) => w.id));
      setAddedCount(count || 0);
      setCandidates([]);
      setRevealed(false);
    } catch {
      setError(true);
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <SkeletonRows count={3} />;
  if (error) return <ErrorBanner />;
  if (!candidates.length) {
    return (
      <EmptyState
        Icon={Check}
        title={addedCount > 0 ? t('allCaughtUp') : t('noWordsAvailable')}
        hint={addedCount > 0 ? t('wordsAdded', { count: addedCount }) : t('noWordsHint')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink/40">{t('todayWordsAvailable', { count: candidates.length })}</p>
      {candidates.map((w) => (
        <LearnWordCard key={w.id} word={w} t={t} showUzbek={revealed} />
      ))}
      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full rounded-xl border border-ink/[0.06] bg-brand-50 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
        >
          {t('revealTranslations')}
        </button>
      ) : (
        <button
          onClick={handleAdd}
          disabled={adding}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {adding ? t('adding') : t('startLearningThese', { count: candidates.length })}
        </button>
      )}
    </div>
  );
}

function LearnWordCard({ word, t, showUzbek }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="break-words font-display text-lg font-bold text-ink">{word.english}</h3>
        {word.part_of_speech && <Pill text={word.part_of_speech} />}
        {word.lesson_number != null && <Pill text={`${t('lesson')} ${word.lesson_number}`} color="slate" />}
        {supportsSpeech() && (
          <button
            onClick={() => speak(word.english)}
            aria-label={t('pronunciation')}
            className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
          >
            <Volume2 size={14} />
          </button>
        )}
      </div>
      {word.pronunciation && <p className="mt-0.5 text-xs text-ink/40">/{word.pronunciation}/</p>}
      {showUzbek && <p className="mt-2 break-words text-base font-semibold text-brand-700">{word.uzbek}</p>}
      {showUzbek && word.example && (
        <p className="mt-2 break-words border-t border-ink/5 pt-2 text-xs text-ink/50">{word.example}</p>
      )}
    </div>
  );
}

// ---------- Review: due cards, grade with Wrong / Correct / Easy ----------
function ReviewTab({ me, t }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(false);
    try {
      setReviews((await getDueReviews(me.id, 20)) || []);
      setIdx(0);
      setShowAnswer(false);
      setDone(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => { load(); }, [load]);

  const current = reviews[idx];

  const answer = async (quality) => {
    if (!current || processing) return;
    setProcessing(true);
    try {
      await scheduleReview(current.id, quality);
      if (idx + 1 >= reviews.length) setDone(true);
      else {
        setIdx((i) => i + 1);
        setShowAnswer(false);
      }
    } catch {
      // Transient RPC failure: leave the card in place so the student can retry.
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <SkeletonRows count={3} />;
  if (error) return <ErrorBanner />;
  if (!reviews.length || done) {
    return (
      <EmptyState
        Icon={Check}
        title={!reviews.length ? t('noReviewsDue') : t('reviewsComplete')}
      />
    );
  }

  const sm = STATE_META[current.state] || STATE_META.NEW;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-ink/40">
        <span>{idx + 1} / {reviews.length}</span>
        <Pill text={t(sm.labelKey)} color={sm.color} />
      </div>

      <div className="rounded-xl border border-ink/[0.06] bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-ink/40">{t('translateToUzbek')}</p>
          {supportsSpeech() && (
            <button
              onClick={() => speak(current.english)}
              aria-label={t('pronunciation')}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
            >
              <Volume2 size={15} />
            </button>
          )}
        </div>
        <p className="mt-1 break-words font-display text-2xl font-bold text-ink">{current.english}</p>
        {current.pronunciation && <p className="text-xs text-ink/40">/{current.pronunciation}/</p>}
        {showAnswer && <p className="mt-3 break-words text-lg font-semibold text-brand-700">{current.uzbek}</p>}
        {showAnswer && current.example && (
          <p className="mt-2 break-words border-t border-ink/5 pt-2 text-xs text-ink/50">{current.example}</p>
        )}
      </div>

      {!showAnswer ? (
        <button
          onClick={() => setShowAnswer(true)}
          className="w-full rounded-xl border border-ink/[0.06] bg-brand-50 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
        >
          {t('showAnswer')}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <GradeButton label={t('wrong')} quality={QUALITY.WRONG} cls="bg-red-50 text-red-700 hover:bg-red-100" onPick={answer} disabled={processing} t={t} />
          <GradeButton label={t('correct')} quality={QUALITY.CORRECT} cls="bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onPick={answer} disabled={processing} t={t} />
          <GradeButton label={t('easy')} quality={QUALITY.EASY} cls="bg-brand-50 text-brand-700 hover:bg-brand-100" onPick={answer} disabled={processing} t={t} />
        </div>
      )}
    </div>
  );
}

function GradeButton({ label, quality, cls, onPick, disabled }) {
  return (
    <button
      onClick={() => onPick(quality)}
      disabled={disabled}
      className={`rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      {label}
    </button>
  );
}
