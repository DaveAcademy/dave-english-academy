// Dictionary.jsx
// General English-Uzbek dictionary (migration 0116) - independent of the
// student's level, current lesson, unlocked lessons, and lesson
// vocabulary. Search either direction; a result card shows translation,
// pronunciation, part of speech, an example sentence with its Uzbek
// translation, and a short usage note. Not connected to Game Center,
// which continues to read only from lesson_vocabulary (see
// VocabularyQuiz.jsx / WordScramble.jsx).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Volume2, BookOpenText, AlertCircle } from 'lucide-react';
import { searchDictionary } from '../../lib/storageBridge';

export default function Dictionary() {
  const { t } = useTranslation('dictionary');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

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

  const clearSearch = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('subtitle')}</p>
      </header>

      <div className="relative mb-5">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && clearSearch()}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="input w-full py-3 pl-11 pr-11 text-base"
        />
        {query && (
          <button
            onClick={clearSearch}
            aria-label={t('clearSearch')}
            className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {!query && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <BookOpenText size={28} className="text-brand-300" />
          <p className="font-display text-base font-semibold text-ink">{t('typeToSearch')}</p>
          <p className="text-xs text-ink/40">{t('typeToSearchHint')}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink/40">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-brand-500" />
          {t('searching')}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
          <AlertCircle size={24} className="text-inactive" />
          <p className="font-display text-base font-semibold text-ink">{t('searchError')}</p>
        </div>
      )}

      {!loading && !error && query && searched && results.length === 0 && (
        <div className="rounded-xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
          <p className="font-display text-base font-semibold text-ink">{t('noResults')}</p>
          <p className="mt-1 text-xs text-ink/40">{t('noResultsHint')}</p>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-3">
          {results.map((entry) => (
            <DictionaryCard key={entry.id} entry={entry} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// Prefers an actual English voice (rather than whatever the browser's
// current UI-language default is - students use the Uzbek portal UI, and
// on some devices the default speechSynthesis voice follows that) so the
// word is always pronounced in English regardless of the app's current
// language. Falls back to the browser default if no English voice is
// installed - still functional, just not guaranteed-English.
function pickEnglishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang?.toLowerCase().startsWith('en')) || null;
}

function DictionaryCard({ entry, t }) {
  const [speaking, setSpeaking] = useState(false);
  const supportsSpeech = typeof window !== 'undefined' && !!window.speechSynthesis;

  const speak = () => {
    if (!supportsSpeech) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.english);
    utterance.lang = 'en-US';
    const voice = pickEnglishVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h2 className="break-words font-display text-lg font-bold text-ink">{entry.english}</h2>
        {entry.part_of_speech && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            {entry.part_of_speech}
          </span>
        )}
        {supportsSpeech && (
          <button
            onClick={speak}
            aria-label={t('pronunciation')}
            aria-pressed={speaking}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
              speaking ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'
            }`}
          >
            <Volume2 size={16} />
          </button>
        )}
      </div>
      {entry.pronunciation && <p className="mt-0.5 text-sm text-ink/40">/{entry.pronunciation}/</p>}

      <p className="mt-2 break-words text-lg font-semibold text-brand-700">{entry.uzbek}</p>
      {entry.alternate_translations?.length > 0 && (
        <p className="mt-0.5 break-words text-xs text-ink/40">
          {t('alsoMeans')}: {entry.alternate_translations.join(', ')}
        </p>
      )}

      {(entry.example || entry.example_uzbek) && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('example')}</p>
          {entry.example && <p className="mt-1 break-words text-sm text-ink">{entry.example}</p>}
          {entry.example_uzbek && <p className="mt-0.5 break-words text-sm text-ink/60">{entry.example_uzbek}</p>}
        </div>
      )}

      {entry.usage_note && (
        <div className="mt-3 border-t border-ink/5 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{t('howToUse')}</p>
          <p className="mt-1 break-words text-sm text-ink/70">{entry.usage_note}</p>
        </div>
      )}
    </div>
  );
}
