// Shared building blocks for the Dictionary V1 pages (student portal +
// staff dashboard). Kept tiny and dependency-light so both student and
// staff trees can import them without cycles.

import { BookOpen } from 'lucide-react';

export const QUALITY = { WRONG: 0, HARD: 1, CORRECT: 2, EASY: 3 };

export const STATE_META = {
  NEW:       { color: 'slate', labelKey: 'state_new' },
  LEARNING:  { color: 'amber', labelKey: 'state_learning' },
  REVIEWING: { color: 'brand', labelKey: 'state_reviewing' },
  MASTERED:  { color: 'green', labelKey: 'state_mastered' },
  LAPSED:    { color: 'red',   labelKey: 'state_lapsed' },
};

// Audio playback for dictionary pronunciation.
// Primary: HTML5 Audio with MP3 from Supabase Storage (reliable on mobile).
// Fallback: Web Speech API (speechSynthesis) for words without audio files.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const AUDIO_BUCKET = 'dictionary-audio';

let audioCache = new Map();
let lastPlayedKey = null;
let audioElement = null;

function getAudioUrl(source, id) {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${source}/${id}.mp3`;
}

function playAudioElement(url) {
  return new Promise((resolve, reject) => {
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
    audioElement = new Audio(url);
    audioElement.onended = () => resolve(true);
    audioElement.onerror = () => reject(new Error('Audio playback failed'));
    audioElement.play().catch(reject);
  });
}

export function supportsSpeech() {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

let cachedVoices = null;
let warmedUp = false;

function loadEnglishVoice() {
  if (!cachedVoices || !cachedVoices.length) {
    try { cachedVoices = window.speechSynthesis.getVoices() || []; } catch { cachedVoices = []; }
  }
  const byLang = (tag) => cachedVoices.find((v) => v.lang?.toLowerCase().replace('_', '-') === tag);
  return byLang('en-us') || byLang('en-gb') || cachedVoices.find((v) => v.lang?.toLowerCase().startsWith('en')) || null;
}

if (typeof window !== 'undefined' && window.speechSynthesis?.addEventListener) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    try { cachedVoices = window.speechSynthesis.getVoices() || []; } catch { /* keep cache */ }
  });
}

function speakWithWebSpeech(text) {
  if (!supportsSpeech() || !text) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const voice = loadEnglishVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

// Play pronunciation for a dictionary word.
// Primary: HTML5 Audio from Supabase Storage.
// Fallback: Web Speech API.
// Returns true if playback started (or already playing), false if completely unavailable.
export async function playAudio(wordId, source, text) {
  if (!wordId || !source || !text) return false;

  const key = `${source}:${wordId}`;

  // Debounce: ignore rapid re-taps of the same word
  if (audioElement && !audioElement.paused && key === lastPlayedKey) {
    return true;
  }

  // Try HTML5 Audio first if we have a URL
  const audioUrl = getAudioUrl(source, wordId);
  if (audioUrl) {
    try {
      await playAudioElement(audioUrl);
      lastPlayedKey = key;
      return true;
    } catch {
      // Fall through to Web Speech
    }
  }

  // Fallback: Web Speech API
  if (!warmedUp) {
    warmedUp = true;
    try {
      const mute = new SpeechSynthesisUtterance(' ');
      mute.volume = 0;
      window.speechSynthesis.speak(mute);
    } catch { /* ignore */ }
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }

  try {
    return speakWithWebSpeech(text);
  } catch {
    showSpeechFallback();
    return false;
  }
}

// Backward compatibility: speak(text) now uses playAudio with text-only fallback
export function speak(text) {
  if (!text) return false;
  // No wordId/source available - use Web Speech directly
  return speakWithWebSpeech(text);
}

// Tiny self-dismissing hint for devices where speech genuinely cannot play,
// so the student is never left wondering whether the button worked.
let fallbackTimer = null;
export function showSpeechFallback() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('speech-fallback-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'speech-fallback-hint';
    el.className =
      'fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-300';
    document.body.appendChild(el);
  }
  el.textContent = '🔊 Pronunciation isn\'t available on this device.';
  el.style.opacity = '1';
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => { if (el) el.style.opacity = '0'; }, 2400);
}

const PILL_COLORS = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

export function Pill({ text, color = 'brand' }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${PILL_COLORS[color] || PILL_COLORS.slate}`}>
      {text}
    </span>
  );
}

export function EmptyState({ Icon = BookOpen, title, hint }) {
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
      <Icon size={28} className="mx-auto text-brand-300" />
      <p className="mt-2 font-display text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  );
}

export function ErrorBanner() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
      <span className="text-sm text-ink/60">Something went wrong. Please try again.</span>
    </div>
  );
}

export function SkeletonRows({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-ink/[0.04]" />
      ))}
    </div>
  );
}
