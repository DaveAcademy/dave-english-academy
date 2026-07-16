import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/AuthContext';
import { isSetupComplete, claimFirstAdmin, signOut } from '../../lib/auth';
import FirstTimeSetup from './FirstTimeSetup';
import Login from './Login';

export default function AuthGate({ children }) {
  const { t } = useTranslation(['auth', 'common']);
  const { session, profile, profileError, role, loading: authLoading, refreshProfile } = useAuth();
  const [setupComplete, setSetupComplete] = useState(null);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const bootstrapAttempted = useRef(false);

  useEffect(() => {
    let mounted = true;
    isSetupComplete()
      .then((v) => mounted && setSetupComplete(v))
      .catch(() => mounted && setSetupComplete(true)) // fail safe: don't strand users on setup if the RPC hiccups
      .finally(() => mounted && setCheckingSetup(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Safety net for the delayed-email-confirmation path: a user finishes
  // First-Time Setup, confirms their email later, and logs in for the
  // first time here - claim the admin role at that point instead of
  // leaving them stuck as a plain 'student' with no admin ever created.
  useEffect(() => {
    if (
      session &&
      setupComplete === false &&
      role &&
      role !== 'administrator' &&
      !bootstrapAttempted.current
    ) {
      bootstrapAttempted.current = true;
      claimFirstAdmin()
        .then(() => {
          setSetupComplete(true);
          refreshProfile();
        })
        .catch(() => {
          // Someone else completed setup first; nothing to do.
          setSetupComplete(true);
        });
    }
  }, [session, setupComplete, role, refreshProfile]);

  if (authLoading || checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink/50">{t('common:loading')}</p>
      </div>
    );
  }

  if (!session) {
    return setupComplete ? <Login /> : <FirstTimeSetup onSetupComplete={() => setSetupComplete(true)} />;
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-card">
          <p className="mb-1 font-display text-base font-bold text-ink">{t('auth:couldntLoadAccount')}</p>
          <p className="mb-4 text-sm text-ink/60">{profileError}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={refreshProfile}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              {t('common:tryAgain')}
            </button>
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-ink/10 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
            >
              {t('common:signOut')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink/50">{t('auth:loadingAccount')}</p>
      </div>
    );
  }

  return children;
}
