// DictionaryTabs.jsx - the non-core tabs of the student Dictionary page:
// Challenge (MCQ over due words), Progress (own SRS summary), Leaderboard
// (academy ranking by mastered words), and Search (the original migration-
// 0116 lookup, unchanged behaviorally).
//
// Challenge grades each answer through schedule_dictionary_review() - it is
// a review accelerator, not a separate scoring system. There is no
// Dictionary points ledger by design; ranking uses mastered-word counts so
// nothing here can be gamed for rank.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search as SearchIcon, X, Volume2, Sparkles, Trophy, TrendingUp,
} from 'lucide-react';
import {
  getDueReviews, scheduleReview, getMySummary, getLeaderboard,
} from '../../lib/dictionaryBridge';
import { searchDictionary } from '../../lib/storageBridge';
import { formatStudentDisplayName } from '../../lib/gameRecordFormat';
import {
  QUALITY, STATE_META, speak, supportsSpeech,
  Pill, EmptyState, ErrorBanner, SkeletonRows,
} from './shared';

// ===================== CHALLENGE =====================
export function ChallengeTab({ me, t }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(false);
    try {
      setQuestions((await getDueReviews(me.id, 10)) || []);
      setIdx(0);
      setPicked(null);
      setCorrectCount(0);
      setFinished(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => { load(); }, [load]);

  const q = questions[idx];

  const options = useMemo(() => {
    if (!q) return [];
    const pool = questions.filter((r) => r.id !== q.id).map((r) => r.uzbek);
    const distractors = [...new Set(pool)].sort(() => Math.random() - 0.5).slice(0, 3);
    return [...distractors, q.uzbek].sort(() => Math.random() - 0.5);
  }, [idx, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <SkeletonRows count={3} />;
  if (error) return <ErrorBanner />;
  if (!questions.length || finished) {
    return (
      <EmptyState
        Icon={Sparkles}
        title={!questions.length ? t('noWordsForChallenge') : t('challengeComplete')}
        hint={finished ? `${correctCount}/${questions.length} ${t('correctLabel')}` : t('learnWordsFirst')}
      />
    );
  }

  const handlePick = async (opt) => {
    if (picked != null) return;
    setPicked(opt);
    const isCorrect = opt === q.uzbek;
    try {
      await scheduleReview(q.id, isCorrect ? QUALITY.CORRECT : QUALITY.WRONG);
    } catch {
      // grading RPC failed - still advance visually; server state unchanged.
    }
    if (isCorrect) setCorrectCount((c) => c + 1);
    setTimeout(() => {
      if (idx + 1 >= questions.length) setFinished(true);
      else {
        setIdx((i) => i + 1);
        setPicked(null);
      }
    }, 700);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-ink/40">
        <span>{idx + 1} / {questions.length}</span>
        <span>{correctCount} {t('correctLabel')}</span>
      </div>

      <div className="rounded-xl border border-ink/[0.06] bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-ink/40">{t('chooseCorrectTranslation')}</p>
          {supportsSpeech() && (
            <button
              onClick={() => speak(q.english)}
              aria-label={t('pronunciation')}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
            >
              <Volume2 size={15} />
            </button>
          )}
        </div>
        <p className="mt-1 break-words font-display text-2xl font-bold text-ink">{q.english}</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => {
          const showResult = picked != null;
          const isPicked = picked === opt;
          const isAnswer = opt === q.uzbek;
          let cls = 'bg-white hover:bg-ink/[0.03]';
          if (showResult && isAnswer) cls = 'bg-emerald-50 ring-2 ring-emerald-400';
          else if (showResult && isPicked && !isAnswer) cls = 'bg-red-50 ring-2 ring-red-400';
          return (
            <button
              key={opt}
              onClick={() => handlePick(opt)}
              disabled={showResult}
              className={`rounded-xl border border-ink/[0.06] px-4 py-3 text-left text-sm font-medium text-ink shadow-sm transition-colors ${cls}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===================== PROGRESS =====================
export function ProgressTab({ me, t }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoading(true);
    getMySummary()
      .then((s) => { if (!cancelled) setStats(Array.isArray(s) ? s[0] : s); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [me]);

  if (loading) return <SkeletonRows count={4} />;
  if (error || !stats) return <ErrorBanner />;

  const accuracy = Number(stats.accuracy) || 0;
  const goal = 1000;
  const pct = Math.min(100, Math.round(100 * (stats.mastered_count || 0) / goal));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-ink/[0.06] bg-white p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-sm font-semibold text-ink">{t('progressToBenchmark')}</p>
          <p className="text-xs text-ink/40">{stats.mastered_count || 0} / {goal}</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
            style={{ width: `${Math.max(pct, stats.mastered_count > 0 ? 2 : 0)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink/40">{t('benchmarkHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label={t('state_mastered')} value={stats.mastered_count} tone="text-emerald-600" />
        <StatBox label={t('state_reviewing')} value={stats.reviewing_count} tone="text-brand-600" />
        <StatBox label={t('state_learning')} value={stats.learning_count + (stats.new_count || 0)} tone="text-amber-600" />
        <StatBox label={t('accuracy')} value={`${accuracy}%`} tone="text-ink" />
        <StatBox label={t('dueNow')} value={stats.due_now} tone="text-red-500" />
        <StatBox label={t('newToday')} value={stats.new_today} tone="text-ink/70" />
        <StatBox label={t('totalAttempts')} value={stats.times_seen} tone="text-ink/70" />
        <StatBox label={t('correctAnswers')} value={stats.times_correct} tone="text-emerald-600" />
      </div>
    </div>
  );
}

function StatBox({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-3 shadow-card">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink/40">{label}</p>
      <p className={`mt-0.5 font-display text-xl font-bold ${tone}`}>{value ?? 0}</p>
    </div>
  );
}

// ===================== LEADERBOARD =====================
const LEVELS = ['A', 'A1', 'B', 'C'];

export function LeaderboardTab({ me, t }) {
  const [level, setLevel] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getLeaderboard(level)
      .then((r) => { if (!cancelled) setRows(r || []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level]);

  const myRow = me ? rows.find((r) => r.student_id === me.id) : null;

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <LevelChip active={level === null} onClick={() => setLevel(null)} label={t('allLevels')} />
        {LEVELS.map((l) => (
          <LevelChip key={l} active={level === l} onClick={() => setLevel(l)} label={l} />
        ))}
      </div>

      {myRow && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-600">{t('yourRank')}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            #{myRow.rank} · {myRow.mastered_words} {t('masteredWordsShort')} · {Number(myRow.accuracy) || 0}%
          </p>
        </div>
      )}

      {loading ? <SkeletonRows count={5} /> : error ? <ErrorBanner /> : rows.length === 0 ? (
        <EmptyState Icon={Trophy} title={t('noRankingsYet')} hint={t('masterWordsToRank')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white shadow-card">
          {rows.map((r, i) => (
            <div
              key={r.student_id}
              className={`flex items-center gap-3 border-ink/[0.04] px-4 py-2.5 ${i > 0 ? 'border-t' : ''} ${
                me && r.student_id === me.id ? 'bg-brand-50/50' : ''
              }`}
            >
              <span className={`w-7 flex-shrink-0 text-center font-display text-sm font-bold ${
                r.rank === 1 ? 'text-amber-500' : r.rank <= 3 ? 'text-brand-500' : 'text-ink/40'
              }`}>
                {r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {formatStudentDisplayName(r.real_name, r.english_name)}
                </p>
                <p className="text-[11px] text-ink/40">
                  {r.level ?? '-'} · {r.mastered_words} {t('masteredWordsShort')} · {Number(r.accuracy) || 0}%
                </p>
              </div>
              {r.learning_words > 0 && (
                <Pill text={`${r.learning_words} ↑`} color="slate" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LevelChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-ink/50 shadow-card hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

// ===================== SEARCH (original 0116 lookup, preserved) =====================
export function SearchTab({ t }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const handle = setTimeout(async () => {
      try {
        setResults(await searchDictionary(q));
        setSearched(true);
      } catch {
        setError(true);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          className="input w-full py-3 pl-11 pr-11 text-base"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label={t('clearSearch')}
            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!query && (
        <EmptyState Icon={SearchIcon} title={t('typeToSearch')} hint={t('typeToSearchHint')} />
      )}
      {loading && (
        <p className="p-4 text-center text-sm text-ink/40">{t('searching')}</p>
      )}
      {!loading && error && <ErrorBanner />}
      {!loading && !error && searched && results.length === 0 && (
        <EmptyState Icon={SearchIcon} title={t('noResults')} hint={t('noResultsHint')} />
      )}
      {!loading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((entry) => (
            <SearchResultCard key={entry.id} entry={entry} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ entry, t }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h3 className="break-words font-display text-lg font-bold text-ink">{entry.english}</h3>
        {entry.part_of_speech && <Pill text={entry.part_of_speech} />}
        {supportsSpeech() && (
          <button
            onClick={() => speak(entry.english)}
            aria-label={t('pronunciation')}
            className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
          >
            <Volume2 size={15} />
          </button>
        )}
      </div>
      {entry.pronunciation && <p className="mt-0.5 text-sm text-ink/40">/{entry.pronunciation}/</p>}
      <p className="mt-2 break-words text-lg font-semibold text-brand-700">{entry.uzbek}</p>
      {(entry.example || entry.example_uzbek) && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('example')}</p>
          {entry.example && <p className="mt-1 break-words text-sm text-ink">{entry.example}</p>}
          {entry.example_uzbek && <p className="mt-0.5 break-words text-sm text-ink/60">{entry.example_uzbek}</p>}
        </div>
      )}
    </div>
  );
}
