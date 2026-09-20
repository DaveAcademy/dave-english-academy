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
  Bookmark, BookmarkCheck, Plus, Check,
} from 'lucide-react';
import {
  getDueReviews, scheduleReview, getMySummary, getMyWordsKnown, getMyKnowledge,
  getMyEvidence, getLeaderboard, getKnowledgeRanking,
  searchUnified, startWords, listLessonFavorites, listEntryFavorites,
  addLessonFavorite, addEntryFavorite, removeLessonFavorite,
  removeEntryFavorite, DAILY_LIMIT,
} from '../api/dictionaryBridge';
import { listAllVocabulary } from '../../../lib/storageBridge';
import { formatStudentDisplayName } from '../../../lib/gameRecordFormat';
import { levelToken } from '../../../lib/levels';
import {
  QUALITY, STATE_META, playAudio, showSpeechFallback,
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
          <button
            type="button"
            onClick={() => { if (!playAudio(q.id, q.source_type || 'lesson_vocabulary', q.english)) showSpeechFallback(); }}
            aria-label={t('pronunciation')}
            title={t('pronunciation')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
          >
            <Volume2 size={15} />
          </button>
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
  const [wordsKnown, setWordsKnown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getMySummary(),
      getMyWordsKnown().catch(() => null),
    ])
      .then(([s, k]) => {
        if (cancelled) return;
        setStats(Array.isArray(s) ? s[0] : s);
        const row = Array.isArray(k) ? k[0] : k;
        setWordsKnown(row || null);
      })
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
        {wordsKnown && (
          <StatBox label={t('wordsKnown')} value={wordsKnown.known_count} tone="text-brand-600" />
        )}
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
                  {r.level ? levelToken(r.level) : '-'} · {r.mastered_words} {t('masteredWordsShort')} · {Number(r.accuracy) || 0}%
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

// ===================== WORDS (Phase 12: knowledge states + evidence) =====================
// Server-computed knowledge_state labels are displayed as-is; the client
// only counts rows for the summary. Evidence pills come from the Phase 2
// read model joined by vocabulary_id. State rules live server-side only.
const KNOWLEDGE_META = {
  NEW: { color: 'slate', labelKey: 'kstate_new', descKey: 'kstate_new_desc' },
  LEARNING: { color: 'amber', labelKey: 'kstate_learning', descKey: 'kstate_learning_desc' },
  DEMONSTRATED: { color: 'brand', labelKey: 'kstate_demonstrated', descKey: 'kstate_demonstrated_desc' },
  KNOWN: { color: 'green', labelKey: 'kstate_known', descKey: 'kstate_known_desc' },
  LAPSED: { color: 'red', labelKey: 'kstate_lapsed', descKey: 'kstate_lapsed_desc' },
};
const KNOWLEDGE_ORDER = ['KNOWN', 'DEMONSTRATED', 'LEARNING', 'NEW', 'LAPSED'];

// Priority order only - no scores. Lapsed recovery first, maintenance last.
const ACTION_PRIORITY = ['LAPSED', 'LEARNING', 'NEW', 'DEMONSTRATED', 'KNOWN'];
// State -> action label. Navigation target is decided by the parent from
// the state (NEW/LEARNING -> Learn, others -> Review) after fetching the
// server-selected set.
const STATE_ACTION_KEY = { NEW: 'actLearn', LEARNING: 'actPractice', DEMONSTRATED: 'actReview', KNOWN: 'actReview', LAPSED: 'actReviewAgain' };

export function WordsTab({ me, t, onAction }) {
  const [rows, setRows] = useState([]);
  const [uzbekById, setUzbekById] = useState({});
  const [filter, setFilter] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    if (!me) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([getMyKnowledge(), getMyEvidence(), listAllVocabulary().catch(() => [])])
      .then(([k, e, v]) => {
        if (cancelled) return;
        const evById = {};
        for (const r of e || []) evById[r.vocabulary_id] = r;
        const uzById = {};
        for (const w of v || []) uzById[w.id] = w.uzbek;
        setRows((k || []).map((r) => ({ ...r, _ev: evById[r.vocabulary_id] || null })));
        setUzbekById(uzById);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => { const cancel = reload(); return cancel; }, [reload]);

  if (loading) return <SkeletonRows count={5} />;
  if (error) {
    return (
      <div className="space-y-2">
        <ErrorBanner />
        <button
          type="button"
          onClick={reload}
          className="w-full rounded-xl border border-ink/[0.06] bg-white py-2.5 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  const counts = {};
  for (const r of rows) counts[r.knowledge_state] = (counts[r.knowledge_state] || 0) + 1;
  const visible = filter ? rows.filter((r) => r.knowledge_state === filter) : rows;
  const priority = ACTION_PRIORITY.find((st) => (counts[st] || 0) > 0) || null;

  const goAction = (state) => {
    if (onAction) onAction(state);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
        <p className="font-display text-sm font-semibold text-ink">{t('howMeasuredTitle')}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink/55">{t('howMeasuredBody')}</p>
      </div>

      {priority ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-600">{t('recoTitle')}</p>
          <p className="mt-1 font-display text-base font-bold text-ink">
            {t('recoHeadline', { count: counts[priority], state: t(KNOWLEDGE_META[priority].labelKey) })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink/55">{t(`reco_${priority.toLowerCase()}`)}</p>
          <button
            type="button"
            onClick={() => goAction(priority)}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {t(STATE_ACTION_KEY[priority])}
          </button>
        </div>
      ) : (
        rows.length > 0 && (
          <div className="rounded-xl border border-ink/[0.06] bg-white p-4 text-center shadow-card">
            <p className="font-display text-base font-semibold text-ink">{t('recoAllGood')}</p>
            <p className="mt-1 text-xs text-ink/50">{t('recoAllGoodHint')}</p>
          </div>
        )
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {KNOWLEDGE_ORDER.map((st) => {
          const meta = KNOWLEDGE_META[st];
          const active = filter === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => { setFilter(active ? null : st); setOpenId(null); }}
              aria-pressed={active}
              className={`rounded-xl border p-3 text-center shadow-card transition-colors ${
                active ? 'border-brand-300 bg-brand-50' : 'border-ink/[0.06] bg-white hover:bg-ink/[0.02]'
              }`}
            >
              <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink/40">{t(meta.labelKey)}</p>
              <p className="mt-0.5 font-display text-xl font-bold text-ink">{counts[st] || 0}</p>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState Icon={Sparkles} title={t('noWordsYet')} hint={t('noWordsYetHint')} />
      ) : visible.length === 0 ? (
        <EmptyState Icon={Sparkles} title={t('noWordsInState')} hint={t('noWordsInStateHint')} />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <WordKnowledgeCard
              key={r.vocabulary_id}
              row={r}
              uzbek={uzbekById[r.vocabulary_id]}
              open={openId === r.vocabulary_id}
              onToggle={() => setOpenId(openId === r.vocabulary_id ? null : r.vocabulary_id)}
              onAction={() => goAction(r.knowledge_state)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WordKnowledgeCard({ row, uzbek, open, onToggle, onAction, t }) {
  const meta = KNOWLEDGE_META[row.knowledge_state] || KNOWLEDGE_META.NEW;
  const ev = row._ev;
  const systems = ev ? [
    { label: t('evDictionary'), ok: (ev.dictionary_correct || 0) > 0 },
    { label: t('evGames'), ok: (ev.game_correct || 0) > 0 },
    { label: t('evHomework'), ok: (ev.homework_correct || 0) > 0 },
    { label: t('evTests'), ok: (ev.test_correct || 0) > 0 },
  ] : [];
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-base font-bold text-ink">{row.english}</p>
          {uzbek && <p className="break-words text-sm font-medium text-brand-700">{uzbek}</p>}
        </div>
        {row.lesson_number != null && (
          <span className="hidden flex-shrink-0 sm:inline"><Pill text={`${t('lesson')} ${row.lesson_number}`} color="slate" /></span>
        )}
        <Pill text={t(meta.labelKey)} color={meta.color} />
      </button>
      {open && (
        <div className="border-t border-ink/5 px-4 py-3">
          <p className="text-xs leading-relaxed text-ink/55">{t(meta.descKey)}</p>
          {systems.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {systems.map((s) => (
                <span
                  key={s.label}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-ink/[0.04] text-ink/40'
                  }`}
                >
                  {s.ok ? <Check size={11} aria-hidden /> : null}{s.label}
                </span>
              ))}
            </div>
          )}
          {(row.retention_interval_days || 0) > 0 && (
            <p className="mt-2 text-[11px] text-ink/40">{t('retentionDays', { count: row.retention_interval_days })}</p>
          )}
          {onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/90"
            >
              {t(STATE_ACTION_KEY[row.knowledge_state] || 'actReview')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ===================== KNOWLEDGE RANKING (Phase 5, KNOWN count only) =====================
// Same visual language as LeaderboardTab, separate metric: Words Known
// from get_vocabulary_knowledge_ranking(). No XP/points/search inputs.
export function KnowledgeRankingTab({ me, t }) {
  const [level, setLevel] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getKnowledgeRanking(level)
      .then((r) => { if (!cancelled) setRows(r || []); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level]);

  useEffect(() => { const cancel = reload(); return cancel; }, [reload]);

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
            #{myRow.rank} · {myRow.known_words} {t('knownWordsShort')}
          </p>
        </div>
      )}

      {loading ? <SkeletonRows count={5} /> : error ? (
        <div className="space-y-2">
          <ErrorBanner />
          <button
            type="button"
            onClick={reload}
            className="w-full rounded-xl border border-ink/[0.06] bg-white py-2.5 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-50"
          >
            {t('retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState Icon={Trophy} title={t('noRankingsYet')} hint={t('knowledgeEmptyHint')} />
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
                  {r.level ? levelToken(r.level) : '-'} · {r.known_words} {t('knownWordsShort')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== SEARCH (unified RPC, ranked server-side) =====================
// Search results are actionable: every row can be added to SRS learning
// (start_dictionary_words, same path as Learn) and saved via the shared
// student_vocabulary_favorites table. General entries need the post-P0
// RPC fields (entry_id); when the backend predates them, Add/Save stay
// hidden for those rows instead of pretending to work.
export function SearchTab({ me, t }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  const [startedLesson, setStartedLesson] = useState(() => new Set());
  const [startedEntry, setStartedEntry] = useState(() => new Set());
  const [savedLesson, setSavedLesson] = useState(() => new Set());
  const [savedEntry, setSavedEntry] = useState(() => new Set());
  const [newToday, setNewToday] = useState(0);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const [due, lessonFav, entryFav, summary] = await Promise.all([
          getDueReviews(me.id, 100).catch(() => []),
          listLessonFavorites(me.id).catch(() => []),
          listEntryFavorites(me.id).catch(() => []),
          getMySummary().catch(() => null),
        ]);
        if (cancelled) return;
        setStartedLesson(new Set((due || []).map((r) => r.lesson_vocabulary_id).filter(Boolean)));
        setStartedEntry(new Set((due || []).map((r) => r.dictionary_entry_id).filter((v) => v != null)));
        setSavedLesson(new Set((lessonFav || []).map((r) => r.vocabulary_id)));
        setSavedEntry(new Set((entryFav || []).map((r) => r.dictionary_entry_id)));
        const s = Array.isArray(summary) ? summary[0] : summary;
        setNewToday(Number(s?.new_today) || 0);
      } catch { /* cards stay usable; actions surface their own errors */ }
    })();
    return () => { cancelled = true; };
  }, [me]);

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
        setResults(await searchUnified(q));
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

  const limitReached = newToday >= DAILY_LIMIT;

  const addToStartedSet = (entry) => {
    if (entry.source_type === 'dictionary_entries' && entry.entry_id != null) {
      setStartedEntry((prev) => new Set(prev).add(entry.entry_id));
    } else {
      setStartedLesson((prev) => new Set(prev).add(entry.id));
    }
  };

  const markStarted = (entry) => {
    addToStartedSet(entry);
    setNewToday((n) => n + 1);
  };

  const handleAdd = async (entry, status, setStatus) => {
    if (!me || busyId) return;
    const isEntry = entry.source_type === 'dictionary_entries';
    if (isEntry && entry.entry_id == null) return;
    setBusyId(entry.id);
    setStatus({ kind: 'adding' });
    try {
      const created = await (isEntry
        ? startWords([], [entry.entry_id])
        : startWords([entry.id], []));
      if ((created || 0) > 0) {
        markStarted(entry);
        setStatus({ kind: 'added' });
      } else if (limitReached) {
        setStatus({ kind: 'limit' });
      } else {
        // Server created nothing while allowance remains: already started.
        addToStartedSet(entry);
        setStatus({ kind: 'have' });
      }
    } catch {
      setStatus({ kind: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSave = async (entry, saved) => {
    if (!me || busyId) return;
    const isEntry = entry.source_type === 'dictionary_entries';
    const key = isEntry ? entry.entry_id : entry.id;
    if (isEntry && key == null) return;
    setBusyId(entry.id);
    try {
      if (saved) {
        await (isEntry ? removeEntryFavorite(me.id, key) : removeLessonFavorite(me.id, key));
        (isEntry ? setSavedEntry : setSavedLesson)((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        await (isEntry ? addEntryFavorite(me.id, key) : addLessonFavorite(me.id, key));
        (isEntry ? setSavedEntry : setSavedLesson)((prev) => new Set(prev).add(key));
      }
    } catch { /* unique-constraint races stay as-is; next reload reconciles */ }
    finally {
      setBusyId(null);
    }
  };

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
          {results.map((entry) => {
            const isEntry = entry.source_type === 'dictionary_entries';
            const started = isEntry
              ? entry.entry_id != null && startedEntry.has(entry.entry_id)
              : startedLesson.has(entry.id);
            const saved = isEntry
              ? entry.entry_id != null && savedEntry.has(entry.entry_id)
              : savedLesson.has(entry.id);
            // General entries need the post-P0 RPC field; without it the
            // actions cannot address the word, so they stay hidden.
            const canAct = !isEntry || entry.entry_id != null;
            return (
              <SearchResultRow
                key={`${entry.source_type}:${entry.entry_id ?? entry.id}`}
                entry={entry}
                t={t}
                started={started}
                saved={saved}
                canAct={canAct && !!me}
                limitReached={limitReached}
                busy={busyId === entry.id}
                onAdd={handleAdd}
                onToggleSave={handleToggleSave}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ entry, t, started, saved, canAct, limitReached, busy, onAdd, onToggleSave }) {
  const [status, setStatus] = useState({ kind: 'idle' });
  const added = started || status.kind === 'added' || status.kind === 'have';
  return (
    <SearchResultCard
      entry={entry}
      t={t}
      added={added}
      saved={saved}
      canAct={canAct}
      limitReached={limitReached}
      busy={busy}
      status={status.kind}
      onAdd={() => onAdd(entry, status, setStatus)}
      onToggleSave={() => onToggleSave(entry, saved)}
    />
  );
}

function SearchResultCard({ entry, t, added, saved, canAct, limitReached, busy, status, onAdd, onToggleSave }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h3 className="break-words font-display text-lg font-bold text-ink">{entry.english}</h3>
        {entry.part_of_speech && <Pill text={entry.part_of_speech} />}
        {entry.lesson_number != null && <Pill text={`${t('lesson')} ${entry.lesson_number}`} color="slate" />}
        {added && <Pill text={t('learningLabel')} color="green" />}
        {saved && <Pill text={t('savedLabel')} color="amber" />}
        <button
          type="button"
          onClick={() => { if (!playAudio(entry.entry_id ?? entry.id, entry.source_type, entry.english)) showSpeechFallback(); }}
          aria-label={t('pronunciation')}
          title={t('pronunciation')}
          className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 hover:bg-brand-100"
        >
          <Volume2 size={15} />
        </button>
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
      {canAct && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
          {added ? (
            <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">
              <Check size={15} aria-hidden /> {status === 'added' ? t('addedToLearning') : t('alreadyLearning')}
            </span>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={busy || limitReached}
              aria-label={t('addToLearning')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus size={15} aria-hidden /> {status === 'adding' ? t('adding') : t('addToLearning')}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSave}
            disabled={busy}
            aria-pressed={!!saved}
            aria-label={saved ? t('unsaveWord') : t('saveWord')}
            title={saved ? t('unsaveWord') : t('saveWord')}
            className={`ml-auto flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              saved ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-ink/[0.04] text-ink/50 hover:bg-ink/[0.08] hover:text-ink'
            }`}
          >
            {saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}
          </button>
        </div>
      )}
      {canAct && !added && limitReached && (
        <p className="mt-2 text-xs text-ink/50">{t('dailyLimitReached')}</p>
      )}
      {canAct && status === 'error' && (
        <p className="mt-2 text-xs font-medium text-red-600">{t('addFailed')}</p>
      )}
    </div>
  );
}
