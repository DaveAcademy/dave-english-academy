// siteTheme.js
// Theme resolution: a GLOBAL site default (app_settings.website_theme,
// admin-controlled) plus an optional PERSONAL override per user
// (profiles.theme, NULL = inherit the site default). The effective value is
// always resolved to light/dark before painting - 'system' follows the OS
// via matchMedia('(prefers-color-scheme: dark)') with a live listener.
// Applied via <html data-theme> + the centralized dark layer in index.css
// (no JSX changes needed anywhere). A per-device localStorage hint prevents
// a flash of the wrong theme before the saved values load.

import { supabase } from './supabaseClient';
import { isNightTime, msUntilNextBoundary } from './themeTime';

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
let boundaryTimer = null;

function clearFollowUps() {
  if (mediaListener && mediaQueryList) {
    mediaQueryList.removeEventListener('change', mediaListener);
    mediaListener = null;
    mediaQueryList = null;
  }
  if (boundaryTimer) {
    clearTimeout(boundaryTimer);
    boundaryTimer = null;
  }
}

function paintDark(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1220' : '#2948D2');
}

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
  clearFollowUps();
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
  getSiteTheme().then((name) => {
    cachedSiteDefault = THEMES.includes(name) ? name : DEFAULT_THEME;
    applySiteTheme(cachedSiteDefault);
  });
}

// ---- Personal per-user override (profiles.theme, NULL = inherit) ----

let cachedSiteDefault = DEFAULT_THEME;

export function resolveEffectiveTheme(personalTheme, siteDefault = cachedSiteDefault) {
  const personal = THEMES.includes(personalTheme) ? personalTheme : null;
  const base = THEMES.includes(siteDefault) ? siteDefault : DEFAULT_THEME;
  return personal ?? base;
}

export async function getPersonalTheme(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('theme')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return THEMES.includes(data.theme) ? data.theme : null;
  } catch {
    return null;
  }
}

export async function setPersonalTheme(userId, name) {
  const safe = THEMES.includes(name) ? name : DEFAULT_THEME;
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ theme: safe })
    .eq('id', userId);
  if (error) throw error;
  return applyPersonalTheme(safe);
}

// Personal resolution: an explicit personal 'system' follows the device
// LOCAL CLOCK (themeTime rule); anything else falls back to the normal
// site-default path (where 'system' still means the OS preference).
// A single timeout repaints at the next 06:00/18:00 boundary - no polling.
function scheduleBoundaryTick() {
  boundaryTimer = setTimeout(() => {
    boundaryTimer = null;
    paintDark(isNightTime(new Date()));
    scheduleBoundaryTick();
  }, msUntilNextBoundary(new Date()));
}

export function applyPersonalTheme(personalTheme, siteDefault = cachedSiteDefault) {
  const personal = THEMES.includes(personalTheme) ? personalTheme : null;
  clearFollowUps();
  if (personal === 'system') {
    paintDark(isNightTime(new Date()));
    try {
      localStorage.setItem(HINT_KEY, 'system');
    } catch {
      /* private mode: boot default applies */
    }
    scheduleBoundaryTick();
    return 'system';
  }
  return applySiteTheme(personal ?? siteDefault);
}

// Re-resolve whenever the signed-in user (or their profile) changes, so one
// user's choice never leaks into another session on a shared device. Call
// with null/undefined on sign-out to fall back to the site default.
export function applyForUser(personalTheme) {
  return applyPersonalTheme(personalTheme);
}
