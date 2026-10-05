// websiteFont.js
// Single GLOBAL website typography choice (not per-user). The admin picks
// one of FONT_CANDIDATES in Settings → Typography; it is stored in the
// public.app_settings table ('website_font' key) and applied here at boot
// for every role (admin/teacher/student) via a CSS variable that overrides
// the Tailwind font utilities (see index.css). Candidate preview fonts are
// loaded on demand; only the selected font loads for normal visitors.

import { supabase } from './supabaseClient';

export const DEFAULT_FONT = 'Plus Jakarta Sans';

export const FONT_CANDIDATES = [
  { name: 'Plus Jakarta Sans', css: 'Plus+Jakarta+Sans:wght@400;500;600;700;800', note: 'Current default · modern grotesque' },
  { name: 'Inter', css: 'Inter:wght@400;500;600;700;800', note: 'Neutral · maximum legibility' },
  { name: 'Sora', css: 'Sora:wght@400;500;600;700;800', note: 'Geometric · distinctive headings' },
  { name: 'Manrope', css: 'Manrope:wght@400;500;600;700;800', note: 'Compact geometric-humanist' },
  { name: 'Public Sans', css: 'Public+Sans:wght@400;500;600;700;800', note: 'Neutral · maximum legibility' },
  { name: 'Rubik', css: 'Rubik:wght@400;500;600;700;800', note: 'Rounded geometric · friendly' },
  { name: 'Outfit', css: 'Outfit:wght@400;500;600;700;800', note: 'Narrow geometric · dense' },
  { name: 'DM Sans', css: 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800', note: 'Low-contrast grotesque' },
  { name: 'Nunito Sans', css: 'Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800', note: 'Soft rounded humanist' },
  { name: 'Figtree', css: 'Figtree:wght@400;500;600;700;800', note: 'Friendly geometric · clear numerals' },
];

const loadedFonts = new Set();

export function isKnownFont(name) {
  return FONT_CANDIDATES.some((f) => f.name === name);
}

// Inject the Google Fonts stylesheet for one candidate (once per session).
export function ensureFontLoaded(name) {
  const candidate = FONT_CANDIDATES.find((f) => f.name === name);
  if (!candidate || loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${candidate.css}&display=swap`;
  link.dataset.websiteFont = name;
  document.head.appendChild(link);
}

export function applyWebsiteFont(name) {
  const safe = isKnownFont(name) ? name : DEFAULT_FONT;
  ensureFontLoaded(safe);
  document.documentElement.style.setProperty('--font-app', `"${safe}", system-ui, -apple-system, "Segoe UI", sans-serif`);
  return safe;
}

export async function getWebsiteFont() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'website_font')
      .maybeSingle();
    if (error || !data) return DEFAULT_FONT;
    return isKnownFont(data.value) ? data.value : DEFAULT_FONT;
  } catch {
    return DEFAULT_FONT;
  }
}

export async function setWebsiteFont(name) {
  const safe = isKnownFont(name) ? name : DEFAULT_FONT;
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'website_font', value: safe, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return applyWebsiteFont(safe);
}

// Fire-and-forget at boot: default typography already applies via CSS until
// the saved choice arrives, so a slow network never breaks rendering.
export function initWebsiteFont() {
  getWebsiteFont().then((name) => {
    if (name !== DEFAULT_FONT) applyWebsiteFont(name);
    else ensureFontLoaded(DEFAULT_FONT);
  });
}
