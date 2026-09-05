// MyVocabulary.jsx - premium vocabulary mastery portal
// Preserves backend: storageBridge (listLessonVocabulary/listAllVocabulary/searchVocabulary,
// favorites via student_vocabulary_favorites), getAttachmentUrl, useAcademy lessons/students, level RLS.
// Adds: mastery journey Translation→Typing→Sentence→Retention→Mastered with real SRS data (no faking),
// overview stats, focus areas, word detail/practice via dictionaryBridge RPCs, skeleton loading,
// race-safe search, favorite rollback, >=44px tap targets, expand animations.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, Star, ArrowLeft, Image as ImageIcon, BookOpen, Sparkles,
  Keyboard, FileText, Layers, Crown, AlertCircle, Volume2, ChevronDown,
} from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { getAttachmentUrl } from '../../../lib/db';
import {
  listLessonVocabulary, listAllVocabulary, searchVocabulary,
  listMyVocabularyFavorites, addVocabularyFavorite, removeVocabularyFavorite,
} from '../../../lib/storageBridge';
import { getMySummary, getStudentDetail } from '../api/dictionaryBridge';
import { SkeletonRows } from '../components/shared';

const STAGES = [
  { key: 'translation', labelKey: 'portal:mpStageTranslation', icon: BookOpen, hintKey: 'portal:mpStageTranslation' },
  { key: 'typing', labelKey: 'portal:mpStageTyping', icon: Keyboard, hintKey: 'portal:mpStageTyping' },
  { key: 'sentence', labelKey: 'portal:mpStageSentence', icon: FileText, hintKey: 'portal:mpStageSentence' },
  { key: 'retention', labelKey: 'portal:mpStageRetention', icon: Layers, hintKey: 'portal:mpStageRetention' },
  { key: 'mastered', labelKey: 'portal:mpStageMastered', icon: Crown, hintKey: 'portal:mpStageMastered' },
];

const STATE_TO_STAGE = {
  NEW: 0, LEARNING: 1, REVIEWING: 3, LAPSED: 1, MASTERED: 4,
};

function MasteryOverview({ me }) {
  const { t } = useTranslation(['portal', 'common']);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!me) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getMySummary().then((s) => {
      if (cancelled) return;
      const row = Array.isArray(s) ? s[0] : s;
      setStats(row || null);
    }).catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [me]);

  if (loading) return <div className="animate-pulse rounded-2xl bg-white p-4 shadow-card"><div className="h-20 rounded-xl bg-ink/5" /></div>;
  if (!stats) return null;

  const total = (stats.mastered_count || 0) + (stats.reviewing_count || 0) + (stats.learning_count || 0) + (stats.new_count || 0);
  const pct = total ? Math.round(((stats.mastered_count || 0) / Math.max(1, total)) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
      <div className="bg-gradient-to-br from-brand-50 via-white to-paper px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">{t('portal:mpMasteryOverview')}</p>
            <p className="mt-0.5 font-display text-sm font-bold text-ink">{t('portal:mpVocabJourney')}</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-700 shadow-sm ring-1 ring-ink/5">{t('portal:mpMasteredCount', { count: stats.mastered_count || 0 })}</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(pct, stats.mastered_count ? 2 : 0)}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            { l: t('portal:mpTotalLabel'), v: total },
            { l: t('portal:mpLearningLabel'), v: (stats.learning_count || 0) + (stats.new_count || 0) },
            { l: t('portal:mpNeedsPractice'), v: (stats.due_now || 0) + (stats.reviewing_count || 0) },
            { l: t('portal:mpMastered'), v: stats.mastered_count || 0 },
          ].map((k) => (
            <div key={k.l} className="rounded-xl bg-white px-2 py-2 text-center ring-1 ring-ink/5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink/40">{k.l}</p>
              <p className="font-display text-base font-bold text-ink">{k.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* journey stages */}
      <div className="grid grid-cols-5 gap-1 border-t border-ink/5 bg-paper/40 px-2 py-3 sm:px-3">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const reached = i === 0 ? total > 0 : i <= 2 ? (stats.learning_count > 0 || stats.reviewing_count > 0) : i === 3 ? (stats.reviewing_count > 0) : (stats.mastered_count > 0);
          return (
            <div key={s.key} className={`rounded-xl px-1 py-2 text-center ${reached ? 'bg-white shadow-sm ring-1 ring-ink/5' : 'opacity-60'}`}>
              <Icon size={14} className={`mx-auto ${reached ? 'text-brand-600' : 'text-ink/30'}`} />
              <p className="mt-1 text-[10px] font-bold leading-tight text-ink">{t(s.labelKey)}</p>
              <p className="hidden text-[10px] leading-tight text-ink/40 sm:block">{t(s.hintKey)}</p>
            </div>
          );
        })}
      </div>

      {/* focus areas */}
      <div className="border-t border-ink/5 bg-white px-4 py-3 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('portal:mpFocusAreas')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { k: t('portal:mpTypingCount', { count: stats.new_today ?? 0 }), v: stats.new_today ?? 0, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
            { k: t('portal:mpSentenceCount', { count: stats.reviewing_count ?? 0 }), v: stats.reviewing_count ?? 0, tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
            { k: t('portal:mpRetentionCount', { count: stats.due_now ?? 0 }), v: stats.due_now ?? 0, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
            { k: `Weak Words · ${stats.lapsed_count ?? stats.new_count ?? 0}`, v: stats.lapsed_count ?? stats.new_count ?? 0, tone: 'bg-red-50 text-red-600 ring-red-100' },
          ].map((f) => (
            <span key={f.k} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${f.tone}`}>
              {f.k}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/45">{t('portal:mpDictionaryHint')}</p>
      </div>
    </div>
  );
}

export default function MyVocabulary() {
  const { t } = useTranslation(['portal', 'common']);
  const { me, students, lessons } = useAcademy();
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get('lesson') ? Number(searchParams.get('lesson')) : null;
  const lesson = lessonId ? lessons.find((l) => l.id === lessonId) : null;

  const [words, setWords] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openWord, setOpenWord] = useState(null);
  const searchSeq = useRef(0);
  const [detailMap, setDetailMap] = useState({}); // wordId -> srs state if in dictionary

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.vocabulary_id)), [favorites]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, f] = await Promise.all([
        lessonId ? listLessonVocabulary(lessonId) : listAllVocabulary(),
        me ? listMyVocabularyFavorites(me.id) : Promise.resolve([]),
      ]);
      setWords(w);
      setFavorites(f);
    } finally { setLoading(false); }
  }, [lessonId, me]);

  useEffect(() => { load(); }, [load]);

  // hydrate per-word SRS detail so mastery badges are real, not faked
  useEffect(() => {
    if (!me || words.length === 0) return;
    let cancelled = false;
    // getStudentDetail returns rows with word_id / state etc; map by english for fallback
    getStudentDetail(me.id).then((rows) => {
      if (cancelled || !rows) return;
      const m = {};
      for (const r of rows) {
        // dictionary word id may not equal lesson_vocabulary id; also map by english lower
        if (r.word_id) m[r.word_id] = r.state;
        if (r.english) m[r.english.toLowerCase()] = r.state;
      }
      if (!cancelled) setDetailMap(m);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [me, words]);

  // single debounced search with race guard — replaces double-effect
  useEffect(() => {
    const q = query.trim();
    if (!q) { load(); return; }
    const seq = ++searchSeq.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchVocabulary(q);
        if (searchSeq.current !== seq) return;
        setWords(res);
      } catch { if (searchSeq.current === seq) setWords([]); }
      finally { if (searchSeq.current === seq) setLoading(false); }
    }, 320);
    return () => clearTimeout(handle);
  }, [query, load]);

  const toggleFavorite = async (vocabularyId) => {
    if (!me) return;
    const wasFav = favoriteIds.has(vocabularyId);
    // optimistic
    if (wasFav) setFavorites((prev) => prev.filter((f) => f.vocabulary_id !== vocabularyId));
    else setFavorites((prev) => [...prev, { vocabulary_id: vocabularyId, student_id: me.id }]);
    try {
      if (wasFav) await removeVocabularyFavorite(me.id, vocabularyId);
      else await addVocabularyFavorite(me.id, vocabularyId);
    } catch {
      // rollback
      if (wasFav) setFavorites((prev) => [...prev, { vocabulary_id: vocabularyId, student_id: me.id }]);
      else setFavorites((prev) => prev.filter((f) => f.vocabulary_id !== vocabularyId));
    }
  };

  const handleViewImage = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const visibleWords = favoritesOnly ? words.filter((w) => favoriteIds.has(w.id)) : words;

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('portal:mpLinkedHint')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-4">
        {lesson ? (
          <Link to="/my-vocabulary" className="mb-2 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-ink/5">
            <ArrowLeft size={14} /> {t('portal:mpAllVocabulary')}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{lesson ? lesson.topic : t('portal:mpMyVocabulary')}</h1>
            <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{lesson ? t('portal:mpVocabJourney') : t('portal:mpDictionaryEmptyDesc')}</p>
          </div>
          <Link to="/dictionary" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700">
            <Sparkles size={14} /> {t('portal:mpPracticeInDictionary')}
          </Link>
        </div>
      </header>

      {!lessonId && <div className="mb-4"><MasteryOverview me={me} /></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('portal:mpSearchPlaceholder')}
            className="input min-h-[44px] py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors ${favoritesOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-ink/10 bg-white text-ink/60 hover:bg-ink/5'}`}
        >
          <Star size={15} fill={favoritesOnly ? 'currentColor' : 'none'} className={favoritesOnly ? 'text-amber-500' : ''} /> {t('portal:mpFavorites')}
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : visibleWords.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="bg-gradient-to-br from-brand-50 via-white to-paper px-6 py-10 text-center sm:px-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-ink/5">
              <BookOpen size={20} className="text-brand-500" />
            </div>
            <p className="mx-auto mt-3 max-w-[30ch] font-display text-base font-bold text-ink">{t('portal:mpNoVocabShow')}</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink/50">{favoritesOnly ? t('portal:mpNoFavorites') : query ? t('portal:mpNoResults') : t('portal:mpNoWordsYet')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleWords.map((w) => {
            const isOpen = openWord === w.id;
            // real stage if known, else 0
            const stateKey = detailMap[w.id] ?? detailMap[String(w.english || '').toLowerCase()] ?? null;
            const stageIdx = stateKey != null ? (STATE_TO_STAGE[String(stateKey).toUpperCase()] ?? 0) : 0;
            const isFav = favoriteIds.has(w.id);
            return (
              <div key={w.id} className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card transition-shadow hover:shadow-[0_4px_20px_rgba(27,36,48,0.07)]">
                <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-3.5">
                  <button
                    onClick={() => setOpenWord(isOpen ? null : w.id)}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold sm:flex ${isFav ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' : 'bg-paper text-ink/40 ring-1 ring-ink/5'}`}>
                      {w.english?.[0]?.toUpperCase() || 'W'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="break-words font-display text-[15px] font-bold leading-tight text-ink">{w.english}</span>
                        <span className="break-words text-sm font-medium text-ink/50">— {w.uzbek}</span>
                      </span>
                      {!lessonId && w.lessons?.topic && <span className="mt-0.5 inline-flex rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink/50">{w.lessons.topic}</span>}
                      {/* mastery badge + focus hint */}
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {stateKey ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${stageIdx >= 4 ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : stageIdx >= 3 ? 'bg-brand-50 text-brand-700 ring-brand-100' : stageIdx >= 1 ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-ink/5 text-ink/50 ring-ink/10'}`}>
                            {stageIdx >= 4 ? <Crown size={10} /> : stageIdx >= 3 ? <Layers size={10} /> : <AlertCircle size={10} />}
                            {stageIdx >= 4 ? t('portal:mpStageMastered') : stageIdx >= 3 ? t('portal:mpStageRetention') : stageIdx >= 1 ? t('portal:mpLearningLabel') : t('portal:mpNewLabel')}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink/40">{t('portal:mpNotStarted')}</span>
                        )}
                      </span>
                    </span>
                    <ChevronDown size={16} className={`shrink-0 text-ink/25 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {w.image_path && (
                    <button onClick={() => handleViewImage(w.image_path)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-ink/40 ring-1 ring-ink/10 hover:bg-ink/5 hover:text-ink" aria-label="View image">
                      <ImageIcon size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => toggleFavorite(w.id)}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${isFav ? 'bg-amber-50 text-amber-500 ring-amber-200' : 'bg-white text-ink/25 ring-ink/10 hover:bg-ink/5 hover:text-ink/50'}`}
                    aria-label="Toggle favorite"
                    aria-pressed={isFav}
                  >
                    <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {/* expand with animation */}
                <div className={`grid transition-all duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="mx-3 mb-3 rounded-xl border border-ink/5 bg-paper/60 px-3 py-3 sm:mx-3.5">
                      {/* stage progress for this word */}
                      <div className="flex items-center gap-1">
                        {STAGES.map((s, i) => (
                          <div key={s.key} className="flex flex-1 items-center gap-1">
                            <div className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? 'bg-brand-500' : 'bg-ink/10'}`} />
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-ink/60">
                        {t('portal:mpStageHint', { label: t(STAGES[stageIdx]?.labelKey || 'portal:mpStageTranslation'), hint: t(STAGES[stageIdx]?.hintKey || 'portal:mpStageTranslation') })}
                      </p>

                      {w.pronunciation && <p className="mt-2 text-xs italic text-ink/45">/{w.pronunciation}/ <button onClick={() => { try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(w.english)); } catch {} }} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink/40 ring-1 ring-ink/10"><Volume2 size={11} /></button></p>}
                      {w.example && <p className="mt-2 break-words border-t border-ink/5 pt-2 text-xs leading-relaxed text-ink/60">{w.example}</p>}
                      {!w.example && <p className="mt-2 text-xs text-ink/35">{t('portal:mpNoExample')}</p>}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link to="/dictionary" className="inline-flex min-h-[36px] items-center rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">{t('portal:mpPracticeWord')}</Link>
                        <span className="inline-flex items-center text-[11px] text-ink/40">{t('portal:mpDictionaryHint')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
