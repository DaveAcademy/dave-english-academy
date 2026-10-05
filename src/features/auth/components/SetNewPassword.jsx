import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { updateRecoveryPassword } from '../../../lib/auth';

const MIN_PASSWORD_LENGTH = 6;

export default function SetNewPassword({ onComplete }) {
  const { t } = useTranslation(['auth', 'common']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth:passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth:passwordsMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await updateRecoveryPassword(password);
      onComplete();
    } catch (err) {
      setError(err.message || t('auth:couldNotSignIn'));
    } finally {
      setSubmitting(false);
    }
  };

  const fields = [
    { id: 'recovery-password', name: 'new-password', label: t('auth:newPassword'), value: password, setValue: setPassword, autoComplete: 'new-password' },
    { id: 'recovery-confirm', name: 'confirm-password', label: t('auth:confirmPassword'), value: confirm, setValue: setConfirm, autoComplete: 'new-password' },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-6 shadow-card sm:p-8">
        <div className="mb-5 text-center">
          <img src="/icons/icon-192.png" alt="Dave English Academy" className="mx-auto mb-3 h-12 w-12 rounded-2xl" />
          <h1 className="font-display text-xl font-bold text-ink">{t('auth:recoveryTitle')}</h1>
          <p className="mt-1 text-sm text-ink/55">{t('auth:recoverySubtitle')}</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-inactive/25 bg-inactive/5 px-3 py-2 text-sm font-medium text-inactive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          {fields.map((f) => (
            <div key={f.id}>
              <label htmlFor={f.id} className="mb-1 block text-xs font-semibold text-ink/60">
                {f.label}
              </label>
              <div className="relative">
                <input
                  id={f.id}
                  name={f.name}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={f.autoComplete}
                  value={f.value}
                  onChange={(e) => f.setValue(e.target.value)}
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
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
            {submitting ? t('auth:signingIn') : t('auth:updatePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
