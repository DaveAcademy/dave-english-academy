// MyVocabulary.jsx
// Student view of vocabulary (Vocabulary Learning System, Phase 1 - see
// migration 0048). One page covers both required student features: a
// single lesson's word list (via ?lesson=<id>, linked from MyLessons.jsx)
// and the "All Vocabulary" aggregate (no query param) - RLS already scopes
// every row to lessons matching the student's level, so this component
// only ever renders what the student is allowed to see. No flashcards or
// quizzes here - that's Phase 2.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, Star, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { useAcademy } from '../../lib/AcademyDataContext';
import { getAttachmentUrl } from '../../lib/db';
import {
  listLessonVocabulary,
  listAllVocabulary,
  searchVocabulary,
  listMyVocabularyFavorites,
  addVocabularyFavorite,
  removeVocabularyFavorite,
} from '../../lib/storageBridge';

export default function MyVocabulary() {
  const { students, lessons } = useAcademy();
  const me = students[0];
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get('lesson') ? Number(searchParams.get('lesson')) : null;
  const lesson = lessonId ? lessons.find((l) => l.id === lessonId) : null;

  const [words, setWords] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [openWord, setOpenWord] = useState(null);

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
    } finally {
      setLoading(false);
    }
  }, [lessonId, me]);

  useEffect(() => {
    load();
  }, [load]);

  // Search runs server-side (across english/uzbek/example) and ignores the
  // lesson filter - "search" in the spec is a global capability, not a
  // per-lesson-only one.
  useEffect(() => {
    if (!query.trim()) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        setWords(await searchVocabulary(query.trim()));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!query.trim()) load();
  }, [query, load]);

  const toggleFavorite = async (vocabularyId) => {
    if (!me) return;
    if (favoriteIds.has(vocabularyId)) {
      setFavorites((prev) => prev.filter((f) => f.vocabulary_id !== vocabularyId));
      await removeVocabularyFavorite(me.id, vocabularyId);
    } else {
      setFavorites((prev) => [...prev, { vocabulary_id: vocabularyId, student_id: me.id }]);
      await addVocabularyFavorite(me.id, vocabularyId);
    }
  };

  const handleViewImage = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const visibleWords = favoritesOnly ? words.filter((w) => favoriteIds.has(w.id)) : words;

  if (!me) {
    return (
      <div className="rounded-xl bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">Your account isn't linked to a student record yet.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        {lesson ? (
          <Link to="/my-vocabulary" className="mb-2 flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline">
            <ArrowLeft size={13} /> All Vocabulary
          </Link>
        ) : null}
        <h1 className="font-display text-2xl font-bold text-ink">{lesson ? lesson.topic : 'All Vocabulary'}</h1>
        <p className="mt-1 text-sm text-ink/50">{lesson ? "This lesson's words." : 'Every word from your lessons.'}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search English, Uzbek, or example..."
            className="input pl-9"
          />
        </div>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
            favoritesOnly ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-ink/15 text-ink/60'
          }`}
        >
          <Star size={14} fill={favoritesOnly ? 'currentColor' : 'none'} /> Favorites
        </button>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-ink/40">Loading...</p>
      ) : visibleWords.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No vocabulary to show.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleWords.map((w) => (
            <div key={w.id} className="rounded-xl bg-white p-3 shadow-card">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpenWord(openWord === w.id ? null : w.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="font-semibold text-ink">
                    {w.english} <span className="font-normal text-ink/50">— {w.uzbek}</span>
                  </p>
                  {!lessonId && w.lessons?.topic && <p className="mt-0.5 text-[11px] text-ink/40">{w.lessons.topic}</p>}
                </button>
                {w.image_path && (
                  <button onClick={() => handleViewImage(w.image_path)} className="flex-shrink-0 rounded-md p-1.5 text-ink/40 hover:bg-ink/5">
                    <ImageIcon size={15} />
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(w.id)}
                  className={`flex-shrink-0 rounded-md p-1.5 ${favoriteIds.has(w.id) ? 'text-amber-500' : 'text-ink/30 hover:text-ink'}`}
                  aria-label="Toggle favorite"
                >
                  <Star size={16} fill={favoriteIds.has(w.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              {openWord === w.id && (w.example || w.pronunciation) && (
                <div className="mt-2 border-t border-ink/5 pt-2 text-xs text-ink/60">
                  {w.pronunciation && <p className="italic">/{w.pronunciation}/</p>}
                  {w.example && <p className="mt-1">{w.example}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
