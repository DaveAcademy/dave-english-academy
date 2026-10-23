// IqBrainHub.jsx - available challenges + personal history + challenge start.
// Reads only published challenge display fields and the student's own attempt
// summaries (approved RPC list_my_iq_attempts). Never reads answer keys, other
// students' rows, or anything owned by another academy subsystem.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, Play, RotateCcw, History, Layers, Clock } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { listIqChallenges, listMyIqAttempts, startIqAttempt } from '../lib/iqApi';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import { ATTEMPTS_ALLOWED, formatPercent } from '../lib/iqScoring';

export default function IqBrainHub() {
  const { t, i18n } = useTranslation(['iqbrain', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me } = useAcademy();
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const catalog = await listIqChallenges();
      const withHistory = await Promise.all(catalog.map(async (challenge) => {
        try {
          const attempts = await listMyIqAttempts(challenge.id);
          return { challenge, attempts };
        } catch {
          return { challenge, attempts: [] };
        }
      }));
      setChallenges(withHistory);
    } catch {
      setError(t('loadFailed'));
      setChallenges([]);
    }
  }, [t]);

  useEffect(() => { if (me) load(); }, [me, load]);

  const start = async (challengeId) => {
    setStarting(challengeId);
    setError(null);
    try {
      const attempt = await startIqAttempt(challengeId);
      if (attempt && attempt.attempt_id) navigate(`/iq-brain/${attempt.attempt_id}`);
      else setError(t('loadFailed'));
    } catch (e) {
      setError(e?.message === 'attempt limit reached' ? t('attemptLimit') : t('startFailed'));
    } finally {
      setStarting(null);
    }
  };

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
          <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('subtitle')}</p>
        </div>
        <Link
          to="/iq-brain/history"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-white px-4 py-2.5 text-xs font-bold text-ink/70 hover:border-brand-300 hover:text-brand-700"
        >
          <History size={14} aria-hidden /> {t('historyLink')}
        </Link>
      </header>

      <ErrorBanner>{error}</ErrorBanner>

      {challenges === null ? (
        <SkeletonList count={3} />
      ) : challenges.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
          <Brain className="mx-auto text-brand-500" size={22} aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">{t('emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-[42ch] text-sm text-ink/55">{t('emptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {challenges.map(({ challenge, attempts }) => {
            const active = attempts.find((a) => a.status === 'in_progress');
            const submitted = attempts.filter((a) => a.status === 'submitted' || a.status === 'expired');
            const best = submitted.length
              ? Math.max(...submitted.map((a) => Number(a.percentage) || 0))
              : null;
            const used = attempts.length;
            const exhausted = used >= ATTEMPTS_ALLOWED && !active;
            return (
              <section
                key={challenge.id}
                aria-label={challenge.title}
                className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                        <Brain size={18} aria-hidden />
                      </span>
                      <p className="font-display text-base font-bold text-ink">{challenge.title}</p>
                    </div>
                    {challenge.description && (
                      <p className="mt-1.5 max-w-[52ch] text-xs leading-relaxed text-ink/50">{challenge.description}</p>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/50">
                      <span className="inline-flex items-center gap-1">
                        <Layers size={12} aria-hidden />
                        {t('questionCount', { n: challenge.question_count })}
                      </span>
                      {challenge.time_limit_sec > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} aria-hidden />
                          {t('timeLimit', { minutes: Math.round(challenge.time_limit_sec / 60) })}
                        </span>
                      )}
                      <span>{t('kindLabel', { kind: challenge.kind })}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-ink/55">
                      {t('attemptsUsed', { used, allowed: ATTEMPTS_ALLOWED })}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {best != null && (
                      <p className="font-display text-lg font-bold text-brand-600">
                        {t('best', { pct: formatPercent(best) })}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={starting === challenge.id || exhausted}
                      onClick={() => start(challenge.id)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {active
                        ? <><RotateCcw size={14} aria-hidden /> {t('resume')}</>
                        : exhausted
                          ? t('noAttemptsLeft')
                          : <><Play size={14} aria-hidden /> {t('start')}</>}
                    </button>
                  </div>
                </div>

                {submitted.length > 0 && (
                  <div className="mt-3 border-t border-ink/[0.06] pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('recentAttempts')}</p>
                    <ul className="space-y-1.5">
                      {submitted.slice(0, 3).map((a) => (
                        <li key={a.attempt_id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-ink/55">
                            {a.submitted_at ? formatDate(a.submitted_at, dateLocale) : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate(`/iq-brain/${a.attempt_id}`)}
                            className="text-xs font-bold text-brand-600 hover:underline"
                          >
                            {t('best', { pct: formatPercent(a.percentage) })} - {t('review')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso, locale) {
  try {
    return new Date(iso).toLocaleDateString(locale === 'uz' ? 'uz-UZ' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
}
