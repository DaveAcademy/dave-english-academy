// ImportModal.jsx

import { useState } from 'react';
import { X } from 'lucide-react';
import { parseRosterText } from '../utils/roster';

export default function ImportModal({ onClose, onImport }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleImportClick = async () => {
    const rows = parseRosterText(text);
    if (rows.length === 0) {
      setResult({ added: 0, skipped: 0, error: true });
      return;
    }
    setImporting(true);
    try {
      const outcome = await onImport(rows);
      setResult(outcome);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Import roster</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink/40 hover:bg-ink/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-xs text-ink/60">
          Paste rows as <span className="font-mono">Name| English name| Level| Payment day</span> (add a 5th column
          for Group, optional). Header lines and dividers are ignored automatically.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={'Shahribonu| Mira| C| 16\nDilyora| Jessica| C| 20'}
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-mono text-xs shadow-sm"
        />

        {result && !result.error && (
          <p className="mt-3 rounded-lg bg-active/10 px-3 py-2 text-sm text-active">
            Added {result.added} student{result.added === 1 ? '' : 's'}
            {result.skipped > 0 ? ` · skipped ${result.skipped} already in your roster` : ''}. New students default to
            Active with fee 0 — set each fee in Edit.
          </p>
        )}
        {result && result.error && (
          <p className="mt-3 rounded-lg bg-inactive/10 px-3 py-2 text-sm text-inactive">
            Couldn't find any valid rows. Check the format and try again.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-ink/15 py-2.5 text-sm font-semibold text-ink/60">
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleImportClick}
              disabled={importing || !text.trim()}
              className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
