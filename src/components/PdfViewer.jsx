// PdfViewer.jsx
// In-app PDF viewer. Downloads the file bytes as a Blob (same storage RLS gate
// as the old signed-URL fetch, see can_read_lesson_pdf) and renders them in an
// <iframe> through a session-scoped object URL - so no storage URL ever appears
// in the address bar and there is no shareable/bookmarkable link to copy.
// Closing the viewer revokes the object URL.
import { useEffect, useState } from 'react';
import { getAttachmentBlob } from '../lib/db';
import { AlertTriangle, FileText, X } from 'lucide-react';

export default function PdfViewer({ path, fileName, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = await getAttachmentBlob(path);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setError('Could not load this PDF.');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/60 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <FileText size={16} className="flex-shrink-0 text-brand-500" />
            <span className="truncate">{fileName || 'PDF'}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink"
            aria-label="Close PDF"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 bg-ink/5">
          {error ? (
            <div className="flex h-full items-center justify-center gap-2 p-6 text-center text-sm font-semibold text-inactive">
              <AlertTriangle size={16} /> {error}
            </div>
          ) : url ? (
            <iframe src={url} title={fileName || 'PDF viewer'} className="h-full w-full" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink/50">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
