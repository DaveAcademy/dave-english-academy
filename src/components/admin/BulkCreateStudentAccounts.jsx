import { useState, useEffect, useCallback } from 'react';
import { Users, Copy, Check, Download, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

// Deterministic login-email rule agreed with the administrator:
// trim -> lowercase -> strip everything but letters/digits -> @gmail.com.
// These are Supabase Auth login identifiers, not real mailboxes.
function toEmailLocalPart(realName) {
  return realName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Assigns emails in id order so re-runs are stable, and appends a numeric
// suffix (ali2, ali3, ...) if two students normalize to the same local part.
function assignEmails(students) {
  const seen = new Map();
  return students.map((s) => {
    const base = toEmailLocalPart(s.real_name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const local = n === 1 ? base : `${base}${n}`;
    return { ...s, email: `${local}@gmail.com`, state: 'pending', password: null, linkWarning: null, error: null, linked: null };
  });
}

export default function BulkCreateStudentAccounts() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('students_view')
      .select('id, real_name, profile_id, status')
      .eq('status', 'Active')
      .is('profile_id', null)
      .order('id');
    setLoading(false);
    if (error) {
      setLoadError(error.message || 'Could not load students.');
      setRows([]);
      return;
    }
    setRows(assignEmails(data || []));
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleCreateAll = async () => {
    if (!rows || rows.length === 0 || running) return;
    setRunning(true);
    let working = rows.map((r) => ({ ...r }));

    for (let i = 0; i < working.length; i++) {
      setProgress({ current: i + 1, total: working.length });
      working[i] = { ...working[i], state: 'creating' };
      setRows([...working]);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: working[i].email,
            full_name: working[i].real_name.trim(),
            role: 'student',
            student_id: working[i].id,
          },
        });
        if (fnError) throw new Error(fnError.message || 'Request failed');
        if (data?.error) throw new Error(data.error);
        working[i] = {
          ...working[i],
          state: 'created',
          password: data.password,
          linkWarning: data.linkWarning || null,
        };
      } catch (err) {
        working[i] = { ...working[i], state: 'error', error: err.message || 'Could not create account.' };
      }
      setRows([...working]);
    }

    // Read-only verification pass: confirm each newly created account is
    // actually linked (profile_id set) rather than trusting the function's
    // response alone.
    const attemptedIds = working.filter((r) => r.state === 'created').map((r) => r.id);
    if (attemptedIds.length > 0) {
      const { data: verifyData } = await supabase
        .from('students_view')
        .select('id, profile_id')
        .in('id', attemptedIds);
      const linkedIds = new Set((verifyData || []).filter((d) => d.profile_id).map((d) => d.id));
      working = working.map((r) => (r.state === 'created' ? { ...r, linked: linkedIds.has(r.id) } : r));
    }

    setRows(working);
    setRunning(false);
  };

  const createdRows = (rows || []).filter((r) => r.state === 'created' && r.password);
  const errorCount = (rows || []).filter((r) => r.state === 'error').length;
  const hasRun = (rows || []).some((r) => r.state !== 'pending');

  const handleCopyAll = () => {
    const text = createdRows.map((r) => `${r.real_name}\t${r.email}\t${r.password}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const header = 'Student\tEmail\tPassword\n';
    const body = createdRows.map((r) => `${r.real_name}\t${r.email}\t${r.password}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-credentials-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Single "creation result" cell. The student-record link is verified
  // silently (via the read-only re-check in handleCreateAll) rather than
  // shown as its own column - if that check ever comes back negative, it
  // surfaces here as part of the result instead of a separate field.
  const resultCell = (row) => {
    if (row.state === 'creating') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <Loader2 size={13} className="animate-spin" /> Creating...
        </span>
      );
    }
    if (row.state === 'error') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
          <XCircle size={13} /> Failed: {row.error}
        </span>
      );
    }
    if (row.state === 'created') {
      if (row.linked === false) {
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
            <AlertTriangle size={13} /> Created, but link verification failed
          </span>
        );
      }
      if (row.linkWarning) {
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
            <AlertTriangle size={13} /> {row.linkWarning}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2 size={13} /> Created
        </span>
      );
    }
    return <span className="text-xs font-medium text-ink/40">Not created</span>;
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <Users size={18} className="text-brand-500" />
        <h2 className="font-display text-base font-bold text-ink">Create missing student accounts</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        Only active students with no linked login are listed. Already-linked students (including Albina) are
        automatically excluded, and re-running this is safe — anyone already created will simply disappear from
        this list.
      </p>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      {loading && <p className="text-sm text-ink/50">Loading students...</p>}

      {!loading && rows && rows.length === 0 && !hasRun && (
        <p className="text-sm text-ink/50">No active students are missing a login account.</p>
      )}

      {!loading && rows && rows.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={loadPending}
              disabled={running}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink/70 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Refresh list
            </button>
            {running && (
              <span className="text-xs font-semibold text-brand-600">
                Creating {progress.current} of {progress.total}...
              </span>
            )}
          </div>

          <div className="mb-4 overflow-x-auto rounded-lg border border-ink/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink/5 text-xs uppercase text-ink/50">
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Password</th>
                  <th className="px-3 py-2">Creation result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-ink/5">
                    <td className="px-3 py-2">{r.real_name.trim()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">{r.email}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/70">{r.password || '—'}</td>
                    <td className="px-3 py-2">{resultCell(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasRun && (
            <button
              onClick={handleCreateAll}
              disabled={running}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Create Missing Student Accounts ({rows.length})
            </button>
          )}

          {hasRun && !running && (
            <div className="rounded-lg border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              <p className="mb-3 font-semibold">
                {createdRows.length} account{createdRows.length === 1 ? '' : 's'} created
                {errorCount > 0 ? `, ${errorCount} failed` : ''}. Save these credentials now — they won&apos;t be
                shown again.
              </p>
              {createdRows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-100"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy all credentials'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-100"
                  >
                    <Download size={14} /> Download as file
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
