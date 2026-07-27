// RouteErrorBoundary.jsx
// Every routed page is lazy-loaded (see App.jsx). Without a boundary, an
// error thrown while fetching or rendering one of those chunks - most
// commonly a stale service-worker-cached index.html pointing at a JS
// chunk hash an already-redeployed app no longer serves - unmounts the
// entire React tree with nothing to catch it: the page goes blank and
// stops responding to any click, not just on the page that failed.
// Chunk-load failures are auto-recovered with a single forced reload
// (guarded so a persistently broken chunk can't reload-loop); anything
// else falls back to a plain retry prompt instead of a dead white screen.

import { Component } from 'react';

const RELOAD_GUARD_KEY = 'da_chunk_reload_guard';

function isChunkLoadError(error) {
  const message = error?.message || '';
  return /dynamically imported module|failed to fetch|loading chunk/i.test(message);
}

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
    }
  }

  handleRetry = () => {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-display text-lg font-semibold text-ink">Something went wrong loading this page.</p>
          <button
            onClick={this.handleRetry}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
