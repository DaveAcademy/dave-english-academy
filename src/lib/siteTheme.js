// siteTheme.js
// Single GLOBAL website theme (not per-user): 'light' | 'dark' | 'system'.
// Stored in public.app_settings ('website_theme' key, default 'light') so
// admin, teacher and student see the same theme. Applied via
// <html data-theme> + the centralized dark layer in index.css (no JSX
// changes needed anywhere). A per-device localStorage hint prevents a
// flash of the wrong theme before the saved value loads.

import { supabase } from './supabaseClient';

export const THEMES = ['light', 'dark', 'system'];
export const DEFAULT_THEME = 'light';
const HINT_KEY = 'dave-theme';

function systemDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function mediaQuery() {
  return window.matchMedia('(prefers-color-scheme: dark)');
}

function paint(name) {
  const dark = name === 'dark' || (name === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1220' : '#2948D2');
}

let mediaQueryList = null;
let mediaListener = null;

export function applySiteTheme(name) {
  const safe = THEMES.includes(name) ? name : DEFAULT_THEME;
  paint(safe);
  try {
    localStorage.setItem(HINT_KEY, safe);
  } catch {
    /* private mode: boot default applies */
  }
  // Always detach from the same MediaQueryList instance that carries the
  // listener; creating a fresh matchMedia() object per call is unreliable.
  if (mediaListener && mediaQueryList) {
    mediaQueryList.removeEventListener('change', mediaListener);
    mediaListener = null;
    mediaQueryList = null;
  }
  if (safe === 'system' && window.matchMedia) {
    mediaQueryList = mediaQuery();
    mediaListener = () => paint('system');
    mediaQueryList.addEventListener('change', mediaListener);
  }
  return safe;
}

export async function getSiteTheme() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'website_theme')
      .maybeSingle();
    if (error || !data) return DEFAULT_THEME;
    return THEMES.includes(data.value) ? data.value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function setSiteTheme(name) {
  const safe = THEMES.includes(name) ? name : DEFAULT_THEME;
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'website_theme', value: safe, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return applySiteTheme(safe);
}

// Fire-and-forget at boot: index.html already painted the cached hint, so
// this only corrects it if the saved value differs.
export function initSiteTheme() {
  getSiteTheme().then((name) => applySiteTheme(name));
}
