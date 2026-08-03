import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { changePassword } from '../../lib/auth';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };
const MIN_LENGTH = 8;

export default function ChangePasswordForm() {
  const { t } = useTranslation(['settings', 'common']);
  const { profile } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.newPassword.length < MIN_LENGTH) {
      setError(t('settings:passwordTooShort', { count: MIN_LENGTH }));
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(t('settings:passwordsDontMatch'));
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({
        email: profile.email,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // changePassword() signs the user out on success - AuthGate will
      // show the login screen automatically once the session clears.
    } catch (err) {
      setError(err.code === 'wrong_current_password' ? t('settings:wrongCurrentPassword') : t('settings:passwordChangeFailed'));
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound size={18} className="text-brand-500" />
        <h2 className="font-display text-base font-bold text-ink">{t('settings:changePassword')}</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">{t('settings:changePasswordDesc')}</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">{t('settings:currentPassword')}</label>
          <input
            required
            type="password"
            value={form.currentPassword}
            onChange={handleChange('currentPassword')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">{t('settings:newPassword')}</label>
          <input
            required
            type="password"
            minLength={MIN_LENGTH}
            value={form.newPassword}
            onChange={handleChange('newPassword')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">{t('settings:confirmNewPassword')}</label>
          <input
            required
            type="password"
            minLength={MIN_LENGTH}
            value={form.confirmPassword}
            onChange={handleChange('confirmPassword')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? t('settings:changingPassword') : t('settings:changePassword')}
        </button>
      </form>
    </section>
  );
}
