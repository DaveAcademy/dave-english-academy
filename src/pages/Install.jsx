// Install.jsx
// Public route (rendered outside AuthGate in App.jsx) so students can reach
// it before logging in - the browser's install prompt and the manifest are
// independent of auth state.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export default function Install() {
  const [installed, setInstalled] = useState(isStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      // Stops Chrome's default mini-infobar so our own button is the one
      // source of truth for triggering the prompt.
      event.preventDefault();
      setDeferredPrompt(event);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      // A prompt event can only be used once, whether accepted or dismissed.
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-paper px-4 py-10 text-center">
      <img
        src="/icons/icon-192.png"
        alt="Dave Academy"
        className="h-20 w-20 rounded-2xl shadow-card"
      />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">Install Dave Academy</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/60">
        Add Dave Academy to your home screen so you can open it like an app - fast, full-screen,
        and always one tap away.
      </p>

      {installed ? (
        <div className="mt-8 w-full max-w-sm rounded-xl border border-brand-200 bg-brand-50 p-5">
          <p className="font-semibold text-brand-700">You're all set!</p>
          <p className="mt-1 text-sm text-ink/60">Dave Academy is already installed on this device.</p>
        </div>
      ) : deferredPrompt ? (
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className="mt-8 w-full max-w-sm rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
        >
          {installing ? 'Installing…' : 'Install App'}
        </button>
      ) : (
        <div className="mt-8 w-full max-w-sm rounded-xl border border-ink/10 bg-white p-5 text-left shadow-card">
          <p className="mb-2 text-sm font-semibold text-ink">Install manually on Android (Chrome)</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink/70">
            <li>
              Tap the <strong>⋮</strong> menu in the top-right of Chrome.
            </li>
            <li>
              Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
            </li>
            <li>
              Tap <strong>Install</strong> to confirm.
            </li>
          </ol>
          <p className="mt-3 text-xs text-ink/40">
            Dave Academy will then appear on your home screen like any other app.
          </p>
        </div>
      )}

      <Link to="/" className="mt-6 text-sm font-medium text-brand-600 hover:underline">
        Continue to Dave Academy →
      </Link>
    </div>
  );
}
