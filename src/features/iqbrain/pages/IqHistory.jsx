// IqHistory.jsx - the student's own attempt summaries for every published
// challenge, read only through the approved RPC list_my_iq_attempts.
// No answer keys, no other students, no cross-subsystem data.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trophy, ClipboardList } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { listIqChallenges, listMyIqAttempts } from '../lib/iqApi';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import { formatPercent, ATTEMPTS_ALLOWED } from '../lib/iqScoring';

export default function IqHistory() {
  const { t, i18n } = useTranslation(['iqbrain', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me } = useAcademy();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const catalog = await listIqChallenges();
      const grouped = await Promise.all(catalog.map(async (challenge) => {
        try {
          const attempts = await listMyIqAttempts(challenge.id);
          return { challenge, attempts };
        } catch {
          return { challenge, attempts: [] };
        }
      }));
      setRows(grouped.filter((g) => g.attempts.length > 0));
    } catch {
      setError(t('loadFailed'));
      setRows([]);
    }
  }, [t]);

  useEffect(() => { if (me) load(); }, [me, load]);

  if (!me) return null;

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <Link to="/iq-brain" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
          <ArrowLeft size={14} aria-hidden /> {t('backToHub')}
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">{t('historyTitle')}</h1>
        <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('historySubtitle')}</p>
      </header>

      <ErrorBanner>{error}</ErrorBanner>

      {rows === null ? (
        <SkeletonList count={3} />
      ) : rows.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <ClipboardList className="mx-auto text-brand-500" size={22} aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">{t('historyEmptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-[42ch] text-sm text-ink/55">{t('historyEmptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map(({ challenge, attempts }) => {
            const graded = attempts.filter((a) => a.status === 'submitted' || a.status === 'expired');
            const best = graded.length
              ? Math.max(...graded.map((a) => Number(a.percentage) || 0))
              : null;
            return (
              <section
                key={challenge.id}
                aria-label={challenge.title}
                className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-base font-bold text-ink">{challenge.title}</p>
                  <div className="flex items-center gap-2">
                    {best != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                        <Trophy size={11} aria-hidden /> {t('best', { pct: formatPercent(best) })}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-ink/45">
                      {t('attemptsUsed', { used: attempts.length, allowed: ATTEMPTS_ALLOWED })}
                    </span>
                  </div>
                </div>

                <ul className="divide-y divide-ink/[0.06]">
                  {attempts.map((a) => (
                    <li key={a.attempt_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="text-xs text-ink/55">
                        {a.submitted_at || a.started_at ? formatWhen(a.submitted_at || a.started_at, dateLocale) : ''}
                        {' - '}
                        {a.status === 'in_progress' ? t('inProgress') : a.status === 'expired' ? t('expired') : t('submitted')}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/iq-brain/${a.attempt_id}`)}
                        className="text-xs font-bold text-brand-600 hover:underline"
                      >
                        {a.percentage == null
                          ? t('open')
                          : `${t('best', { pct: formatPercent(a.percentage) })} - ${t('review')}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatWhen(iso, locale) {
  try {
    return new Date(iso).toLocaleDateString(locale === 'uz' ? 'uz-UZ' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
}
