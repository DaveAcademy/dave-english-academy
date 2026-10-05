// TypographySettings.jsx (admin only)
// Global website font picker: preview the 10 approved candidates with real
// academy content, then save one as the site-wide choice in
// app_settings.website_font. Applies instantly to admin/teacher/student via
// lib/websiteFont.js. Writes require the administrator role (RLS).

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Type } from 'lucide-react';
import {
  FONT_CANDIDATES,
  DEFAULT_FONT,
  ensureFontLoaded,
  getWebsiteFont,
  setWebsiteFont,
} from '../../../lib/websiteFont';

function Preview({ font, width }) {
  const ff = { fontFamily: `"${font}", system-ui, sans-serif` };
  return (
    <div className="mx-auto" style={{ maxWidth: width }}>
      <div style={ff} className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white text-ink shadow-card">
        <div className="space-y-4 p-4">
          <div>
            <p className="text-xl font-bold">Dave English Academy</p>
            <p className="mt-0.5 text-sm font-semibold text-ink/70">Learn Today, Lead Tomorrow!</p>
            <p className="mt-1 text-xs text-ink/50">Active students · Complete today's lesson</p>
          </div>
          <div>
            <p className="text-base font-semibold">Oʻquvchilar uchun yangi topshiriq</p>
            <p className="mt-0.5 text-sm text-ink/60">Bugungi oʻqituvchi xabari · Gʻoliblar reytingi</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Asal (Lisa) · Muhammad (David) · Azimjon (Jack) · Shahribonu (Mira)</p>
            <p className="mt-1 text-sm font-bold tabular-nums">33 · 250,000 UZS · 226 points · 87%</p>
          </div>
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Record payment</span>
              <span className="rounded-lg border border-ink/10 px-4 py-2 text-sm font-semibold text-ink/70">Cancel</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-ink/60">Home · Students · Payments · Exams · Rankings</p>
          </div>
          <div className="rounded-xl border border-ink/[0.06] p-3">
            <p className="text-xs font-medium text-ink/60">Total collected</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">250,000 UZS</p>
          </div>
          <div className="divide-y divide-ink/[0.06] rounded-xl border border-ink/[0.06]">
            <div className="flex items-center gap-2 px-3 py-2 text-sm"><span className="font-bold">1</span><span className="flex-1 truncate font-medium">Shahribonu (Mira)</span><span className="font-bold tabular-nums">226 pts</span></div>
            <div className="flex items-center gap-2 px-3 py-2 text-sm"><span className="font-bold">2</span><span className="flex-1 truncate font-medium">Muhammad (David)</span><span className="font-bold tabular-nums">198 pts</span></div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-ink/60">Parent phone number</p>
            <div className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70">+998 90 123 45 67</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TypographySettings() {
  const { t } = useTranslation(['common', 'settings']);
  const [selected, setSelected] = useState(DEFAULT_FONT);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(360);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    getWebsiteFont().then((name) => setSelected(name));
  }, []);

  useEffect(() => {
    ensureFontLoaded(selected);
  }, [selected]);

  // Collapse on outside tap / Escape, like a native dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  // Selecting a font saves + applies it globally immediately, then collapses.
  const handleSelect = async (name) => {
    setOpen(false);
    if (name === selected && !error) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const applied = await setWebsiteFont(name);
      setSelected(applied);
      setMessage(t('settings:typographySaved', { defaultValue: 'Website font applied to the entire site.' }));
    } catch {
      setError(t('settings:typographySaveFailed', { defaultValue: 'Could not save the font. Please try again.' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-4 rounded-xl bg-white p-4 shadow-card sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <Type size={18} className="text-brand-500" />
        <h2 className="font-display text-base font-bold text-ink">{t('settings:typography', { defaultValue: 'Typography' })}</h2>
      </div>
      <p className="mb-3 text-sm text-ink/60">
        {t('settings:typographyDesc', { defaultValue: 'Website Font — choose the font used across the entire Dave English Academy website (admin, teachers, students).' })}
      </p>

      <div ref={boxRef} className="relative mb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-200"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white"
            style={{ fontFamily: `"${selected}", system-ui, sans-serif` }}
          >
            Aa
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink" style={{ fontFamily: `"${selected}", system-ui, sans-serif` }}>
              {selected}
            </span>
            <span className="block truncate text-xs text-ink/50" style={{ fontFamily: `"${selected}", system-ui, sans-serif` }}>
              Oʻquvchilar · Gʻoliblar · 226 pts
            </span>
          </span>
          <ChevronDown size={18} className={`flex-shrink-0 text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label={t('settings:typography', { defaultValue: 'Typography' })}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-ink/10 bg-white py-1 shadow-xl"
          >
            {FONT_CANDIDATES.map((f) => {
              const active = selected === f.name;
              return (
                <li key={f.name} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => handleSelect(f.name)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-50/60 ${
                      active ? 'bg-brand-50/40' : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-base font-bold text-ink/70"
                      style={{ fontFamily: `"${f.name}", system-ui, sans-serif` }}
                    >
                      Aa
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink" style={{ fontFamily: `"${f.name}", system-ui, sans-serif` }}>
                        {f.name}
                      </span>
                      <span className="block truncate text-xs text-ink/50">{f.note}</span>
                    </span>
                    {active && <Check size={16} className="flex-shrink-0 text-brand-600" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {saving && <p className="mb-2 text-xs font-semibold text-ink/50">{t('common:saving', { defaultValue: 'Saving…' })}</p>}

      <div className="mb-3 flex gap-1.5">
        {[360, 768].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${width === w ? 'bg-brand-600 text-white' : 'bg-white text-ink/60 shadow-sm'}`}
          >
            {w === 360 ? 'Phone 360px' : 'Wide'}
          </button>
        ))}
      </div>

      <Preview font={selected} width={width} />

      {message && <p className="mt-3 text-sm font-semibold text-active">{message}</p>}
      {error && <p className="mt-3 text-sm font-semibold text-inactive">{error}</p>}
    </section>
  );
}
