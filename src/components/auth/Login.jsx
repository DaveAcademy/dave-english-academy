import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { signInWithPassword } from '../../lib/auth';

export default function Login() {
  const { t } = useTranslation(['auth', 'common']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card">
        <div className="mb-5 text-center">
          <LogIn className="mx-auto mb-2 h-10 w-10 text-brand-500" />
          <h1 className="font-display text-lg font-bold text-ink">Dave Academy</h1>
          <p className="mt-1 text-sm text-ink/60">{t('auth:signInToContinue')}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">{t('common:email')}</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">{t('common:password')}</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? t('auth:signingIn') : t('common:signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
