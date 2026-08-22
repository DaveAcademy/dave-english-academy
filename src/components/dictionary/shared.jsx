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

// Browser TTS, preferring an installed English voice so the word is always
// spoken in English regardless of UI language (students use the Uzbek
// portal; see original Dictionary.jsx note).
function pickEnglishVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('en')) || null;
}

export function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const voice = pickEnglishVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function supportsSpeech() {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
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
