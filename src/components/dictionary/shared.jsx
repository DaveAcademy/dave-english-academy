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

// Browser TTS (Web Speech API), preferring an installed English voice so the
// word is always spoken in English regardless of UI language (students use
// the Uzbek portal; see original Dictionary.jsx note).
//
// Mobile reliability notes (why the naive version was silent on phones):
//  * Chrome Android / iOS Safari silently DROP an utterance that is queued
//    in the same tick as speechSynthesis.cancel(), so cancel-before-speak is
//    only done when a different word is interrupting playback, never on the
//    common first-tap path.
//  * getVoices() is empty until voices load asynchronously (especially iOS
//    Safari), so the list is cached and refreshed via the voiceschanged
//    event instead of being re-read once per tap.
//  * iOS Safari needs one successful speak() inside a user gesture before
//    later speech is audible; a muted warm-up utterance on the first tap
//    covers this without any extra UI.
let cachedVoices = null;
let lastSpokenText = null;
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

function speakNow(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const voice = loadEnglishVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function supportsSpeech() {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

// Speak an English dictionary word. Returns true when playback was started
// (or already playing), false when the device offers no speech at all.
export function speak(text) {
  if (!supportsSpeech() || !text) return false;

  // Debounce: ignore accidental re-taps of the same word while it plays.
  if ((window.speechSynthesis.speaking || window.speechSynthesis.pending) && text === lastSpokenText) {
    return true;
  }

  // First-ever tap: iOS Safari unlock via a muted warm-up utterance, spoken
  // inside the same user gesture as the real word.
  if (!warmedUp) {
    warmedUp = true;
    try {
      const mute = new SpeechSynthesisUtterance(' ');
      mute.volume = 0;
      window.speechSynthesis.speak(mute);
    } catch { /* non-iOS engines may ignore; harmless */ }
  }

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    // A different word is interrupting playback - stop it first. Same-tick
    // queue after cancel() is avoided on the common path above.
    window.speechSynthesis.cancel();
  }
  lastSpokenText = text;
  try {
    speakNow(text);
  } catch {
    showSpeechFallback();
    return false;
  }
  return true;
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
