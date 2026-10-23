// ThemeSettings.jsx (inside Appearance)
// mode="global" (admin): site-wide default in app_settings.website_theme.
// mode="personal" (teacher/student): per-account override in profiles.theme
// (NULL = inherit the site default), applied instantly via lib/siteTheme.js.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { THEMES, DEFAULT_THEME, getSiteTheme, setSiteTheme, getPersonalTheme, setPersonalTheme } from '../../../lib/siteTheme';
import { useAuth } from '../../../lib/AuthContext';

const OPTIONS = [
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
  { value: 'system', Icon: MonitorSmartphone },
];

export default function ThemeSettings({ mode = 'global' }) {
  const { t } = useTranslation(['common', 'settings']);
  const { session } = useAuth();
  const personal = mode === 'personal';
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [inherited, setInherited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (personal) {
      Promise.all([getPersonalTheme(session?.user?.id), getSiteTheme()]).then(([mine, site]) => {
        setInherited(mine == null);
        setTheme(mine ?? site);
      });
    } else {
      getSiteTheme().then(setTheme);
    }
  }, [personal, session?.user?.id]);

  const handleSelect = async (value) => {
    if (value === theme || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const applied = personal
        ? await setPersonalTheme(session?.user?.id, value)
        : await setSiteTheme(value);
      setTheme(applied);
      setInherited(false);
      setMessage(
        personal
          ? t('settings:themeSavedPersonal', { defaultValue: 'Your theme preference was saved.' })
          : t('settings:themeSaved', { defaultValue: 'Theme applied to the entire site.' }),
      );
    } catch {
      setError(t('settings:themeSaveFailed', { defaultValue: 'Could not save the theme. Please try again.' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-ink/[0.06] pt-4">
      <p className="text-sm font-bold text-ink">{t('settings:theme', { defaultValue: 'Theme' })}</p>
      <p className="mt-0.5 text-xs text-ink/50">
        {personal
          ? t('settings:themeDescPersonal', { defaultValue: 'Light, dark, or follow this device. Applies to your account.' })
          : t('settings:themeDesc', { defaultValue: 'Light, dark, or follow this device. Applies to admin, teachers and students.' })}
        {personal && inherited && (
          <> {t('settings:themeInherited', { defaultValue: 'Currently using the site default.' })}</>
        )}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('settings:theme', { defaultValue: 'Theme' })}>
        {OPTIONS.map(({ value, Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(value)}
              disabled={saving}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                active
                  ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500/30'
                  : 'border-ink/10 text-ink/60 hover:border-brand-200 hover:text-ink'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {t(`settings:theme_${value}`, { defaultValue: value[0].toUpperCase() + value.slice(1) })}
            </button>
          );
        })}
      </div>
      {message && <p className="mt-2 text-xs font-semibold text-active">{message}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-inactive">{error}</p>}
    </div>
  );
}
