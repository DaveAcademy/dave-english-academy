import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { signInWithPassword } from '../../../lib/auth';
import { setLanguage, applyLoginDefaultLanguage } from '../../../i18n';

export default function Login({ notice = false }) {
  const { t, i18n } = useTranslation(['auth', 'common']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // First-time visitors see Uzbek; an explicit saved choice is never overridden.
  useEffect(() => {
    applyLoginDefaultLanguage();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithPassword({ email, password });
      // onAuthStateChange (in AuthContext) picks up the new session automatically.
    } catch (err) {
      setError(err.message || t('auth:couldNotSignIn'));
    } finally {
      setSubmitting(false);
    }
  };

  const trackCapsLock = (e) => {
    if (e.getModifierState) setCapsLockOn(e.getModifierState('CapsLock'));
  };

  const activeLang = i18n.language === 'uz' ? 'uz' : 'en';

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card md:grid md:grid-cols-[0.9fr_1.1fr]">
        {/* Brand rail: desktop only, icon-anchored, no imagery */}
        <div className="hidden flex-col bg-brand-50/60 p-8 md:flex">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
            <div>
              <p className="font-display text-sm font-bold leading-tight text-ink">Dave English Academy</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">{t('auth:brandTitle')}</p>
            </div>
          </div>
          <p className="mt-auto pt-10 text-sm leading-relaxed text-ink/55">{t('auth:brandSubtitle')}</p>
        </div>

        {/* Form panel */}
        <div className="relative p-6 sm:p-8">
          <div className="absolute right-4 top-4 flex rounded-full border border-ink/[0.08] bg-paper p-0.5 sm:right-6 sm:top-6" role="group" aria-label="Language">
            {['uz', 'en'].map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng)}
                aria-pressed={activeLang === lng}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase transition ${
                  activeLang === lng ? 'bg-ink text-white shadow-sm' : 'text-ink/50 hover:text-ink'
                }`}
              >
                {lng === 'uz' ? 'O‘z' : 'En'}
              </button>
            ))}
          </div>

          <div className="mb-5 text-center md:text-left">
            <img src="/icons/icon-192.png" alt="Dave English Academy" className="mx-auto mb-3 h-12 w-12 rounded-2xl md:hidden" />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-600 md:hidden">{t('auth:brandTitle')}</p>
            <h1 className="mt-1 font-display text-xl font-bold text-ink">
              {t('auth:signInTitle')}
            </h1>
            <p className="mt-1 text-sm text-ink/55">
              {t('auth:signInToContinue')}
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-inactive/25 bg-inactive/5 px-3 py-2 text-sm font-medium text-inactive">
              {error}
            </div>
          )}

          {notice && !error && (
            <div role="status" className="mb-4 rounded-lg border border-active/25 bg-active/5 px-3 py-2 text-sm font-medium text-active">
              {t('auth:resetCompleteNotice')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-ink/60">
                  {t('common:email')}
                </label>
                <input
                  id="login-email"
                  name="email"
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-ink/60">
                  {t('common:password')}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={trackCapsLock}
                    onKeyDown={trackCapsLock}
                    onBlur={() => setCapsLockOn(false)}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2.5 pr-11 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth:hidePassword') : t('auth:showPassword')}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink/45 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
                {capsLockOn && (
                  <p role="status" className="mt-1 text-xs font-medium text-levelB">
                    {t('auth:capsLockOn')}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
                {submitting ? t('auth:signingIn') : t('common:signIn')}
              </button>
              <p className="text-center text-[11px] leading-relaxed text-ink/40">
                {t('auth:trustNote')}
              </p>
            </form>
        </div>
      </div>
    </div>
  );
}
