import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/AuthContext';
import { isSetupComplete, claimFirstAdmin, signOut } from '../../../lib/auth';
import FirstTimeSetup from './FirstTimeSetup';
import Login from './Login';
import SetNewPassword from './SetNewPassword';

export default function AuthGate({ children }) {
  const { t } = useTranslation(['auth', 'common']);
  const { session, profile, profileError, role, loading: authLoading, refreshProfile, isRecovery } = useAuth();
  const [setupComplete, setSetupComplete] = useState(null);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [resetNotice, setResetNotice] = useState(false);
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

  // A real (non-recovery) session consumes the reset notice so it never
  // reappears on a later plain logout. Must stay above every early return
  // so hook order never changes between renders.
  useEffect(() => {
    if (session && !isRecovery) setResetNotice(false);
  }, [session, isRecovery]);

  if (authLoading || checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink/50">{t('common:loading')}</p>
      </div>
    );
  }

  if (!session) {
    return setupComplete ? <Login notice={resetNotice} /> : <FirstTimeSetup onSetupComplete={() => setSetupComplete(true)} />;
  }

  // Password-recovery session (user arrived via the emailed reset link):
  // dedicated set-new-password screen, never the app behind it. On success
  // the session is signed out (AuthContext clears recovery mode) and the
  // user lands back on Login with a confirmation notice.
  if (isRecovery) {
    return (
      <SetNewPassword
        onComplete={async () => {
          await signOut();
          setResetNotice(true);
        }}
      />
    );
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
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
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
