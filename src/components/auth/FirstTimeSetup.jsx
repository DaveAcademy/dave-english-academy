import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { signUp } from '../../lib/auth';
import { claimFirstAdmin } from '../../lib/auth';
import { useAuth } from '../../lib/AuthContext';
import Login from './Login';

const EMPTY = { fullName: '', email: '', password: '' };

export default function FirstTimeSetup({ onSetupComplete }) {
  const { t } = useTranslation(['auth', 'common']);
  const { refreshProfile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [showLoginInstead, setShowLoginInstead] = useState(false);

  if (showLoginInstead) {
    return <Login />;
  }

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { session } = await signUp({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
      });

      if (session) {
        await claimFirstAdmin();
        await refreshProfile();
        onSetupComplete();
      } else {
        setPendingConfirmation(true);
      }
    } catch (err) {
      setError(err.message || t('auth:couldNotCreateAdmin'));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-card">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
          <h1 className="mb-2 font-display text-lg font-bold text-ink">{t('auth:checkYourEmail')}</h1>
          <p className="mb-4 text-sm text-ink/60">
            <Trans
              i18nKey="auth:confirmationSent"
              values={{ email: form.email }}
              components={[<span className="font-semibold" key="0" />]}
            />
          </p>
          <button
            onClick={() => setShowLoginInstead(true)}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            {t('auth:confirmedSignIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card">
        <div className="mb-5 text-center">
          <ShieldCheck className="mx-auto mb-2 h-10 w-10 text-brand-500" />
          <h1 className="font-display text-lg font-bold text-ink">{t('auth:firstTimeSetupTitle')}</h1>
          <p className="mt-1 text-sm text-ink/60">{t('auth:firstTimeSetupSubtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">{t('common:fullName')}</label>
            <input
              required
              value={form.fullName}
              onChange={handleChange('fullName')}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">{t('common:email')}</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">{t('common:password')}</label>
            <input
              required
              minLength={6}
              type="password"
              value={form.password}
              onChange={handleChange('password')}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? t('auth:creatingAdmin') : t('auth:createAdminAccount')}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink/40">{t('auth:onlyOnceWarning')}</p>
        <button
          onClick={() => setShowLoginInstead(true)}
          className="mt-3 w-full text-center text-xs text-brand-500 hover:underline"
        >
          {t('auth:alreadySetUp')}
        </button>
      </div>
    </div>
  );
}
