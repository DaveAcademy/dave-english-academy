import { useState, useEffect } from 'react';
import { UserPlus, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const EMPTY = { fullName: '', email: '', role: 'teacher', studentId: '' };

export default function CreateUserForm() {
  const [form, setForm] = useState(EMPTY);
  const [unlinkedStudents, setUnlinkedStudents] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (form.role !== 'student') return;
    supabase
      .from('students')
      .select('id, real_name')
      .is('profile_id', null)
      .order('real_name')
      .then(({ data }) => setUnlinkedStudents(data || []));
  }, [form.role]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    setCreated(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: form.email,
          full_name: form.fullName,
          role: form.role,
          ...(form.role === 'student' && form.studentId ? { student_id: Number(form.studentId) } : {}),
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setCreated(data);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message || 'Could not create the account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <UserPlus size={18} className="text-brand-500" />
        <h2 className="font-display text-base font-bold text-ink">Create teacher or student account</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        A random password is generated automatically - it's only shown once, right after creation.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {created && (
        <div className="mb-4 rounded-lg border border-brand-500/20 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <p className="mb-2 font-semibold">Account created - save these now, they won't be shown again:</p>
          <p className="font-mono text-xs">Email: {created.email}</p>
          <p className="font-mono text-xs">Password: {created.password}</p>
          {created.linkWarning && (
            <p className="mt-2 text-xs font-semibold text-amber-700">{created.linkWarning}</p>
          )}
          <button
            onClick={handleCopy}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-100"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy credentials'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">Full name</label>
          <input
            required
            value={form.fullName}
            onChange={handleChange('fullName')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">Email</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/60">Role</label>
          <select
            value={form.role}
            onChange={handleChange('role')}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </div>

        {form.role === 'student' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink/60">Link to student (optional)</label>
            <select
              value={form.studentId}
              onChange={handleChange('studentId')}
              className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Don't link yet</option>
              {unlinkedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.real_name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink/40">
              Linking lets this login see that student's own lessons, exam scores, certificates, and ranking.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create account'}
        </button>
      </form>
    </section>
  );
}
