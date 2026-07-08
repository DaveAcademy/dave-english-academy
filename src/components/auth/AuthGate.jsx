import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { isSetupComplete, claimFirstAdmin } from '../../lib/auth';
import FirstTimeSetup from './FirstTimeSetup';
import Login from './Login';

export default function AuthGate({ children }) {
  const { session, profile, role, loading: authLoading, refreshProfile } = useAuth();
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
        <p className="text-sm text-ink/50">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return setupComplete ? <Login /> : <FirstTimeSetup onSetupComplete={() => setSetupComplete(true)} />;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-ink/50">Loading your account...</p>
      </div>
    );
  }

  return children;
}
