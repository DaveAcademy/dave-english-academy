// PlacementTest.jsx - student hub for the CEFR Placement Test.
// Explains the assessment, lists the student's own attempts, and starts or
// resumes an attempt. All data comes from RPCs scoped to the signed-in
// student; no other student's data is reachable.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ClipboardList, Info, Play } from 'lucide-react';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import {
  listMyPlacementAttempts,
  startPlacementAttempt,
} from '../lib/placementApi';
import {
  attemptStatusKey,
  attemptStatusTone,
  cefrLabel,
  confidenceKey,
  reviewStatusKey,
} from '../lib/placementModel';

export default function PlacementTest() {
  const { t } = useTranslation(['placement', 'common']);
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAttempts(await listMyPlacementAttempts());
    } catch {
      setError(t('placement:loadFailed'));
      setAttempts([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const activeAttempt = (attempts || []).find((a) => a.status === 'in_progress');

  const onStart = async () => {
    setStarting(true);
    setError(null);
    setLimitReached(false);
    try {
      const res = await startPlacementAttempt();
      navigate(`/placement/attempt/${res.attempt_id}`);
    } catch (e) {
      if (typeof e?.message === 'string' && e.message.includes('attempt limit reached')) {
        setLimitReached(true);
      } else {
        setError(t('placement:startFailed'));
      }
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Explanation / rules */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">{t('placement:title')}</h1>
            <p className="text-sm text-ink/50">{t('placement:subtitle')}</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50/60 p-3 text-sm text-ink/70">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-brand-600" aria-hidden="true" />
          <p>{t('placement:about')}</p>
        </div>

        <ul className="mt-3 space-y-1.5 text-sm text-ink/70">
          {['duration', 'sections', 'adaptive', 'rules', 'writing', 'speaking'].map((key) => (
            <li key={key} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
              <span>{t(`placement:rules.${key}`)}</span>
            </li>
          ))}
        </ul>

        {limitReached && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            {t('placement:limitReached')}
          </p>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="mt-4">
          {activeAttempt ? (
            <button
              type="button"
              onClick={() => navigate(`/placement/attempt/${activeAttempt.id}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
              disabled={starting}
            >
              <Play size={16} aria-hidden="true" />
              {t('placement:resume')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
              disabled={starting}
            >
              {starting ? t('common:loading') : t('placement:start')}
              {!starting && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          )}
        </div>
      </section>

      {/* Previous attempts */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t('placement:history')}</h2>
        {!attempts ? (
          <div className="mt-3">
            <SkeletonList rows={2} />
          </div>
        ) : attempts.length === 0 ? (
          <p className="mt-3 rounded-xl border border-ink/[0.06] bg-paper p-6 text-center text-sm text-ink/50">
            {t('placement:emptyHistory')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/[0.06] px-3 py-2.5"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${attemptStatusTone(a.status)}`}
                >
                  {t(attemptStatusKey(a.status), { ns: 'placement' })}
                </span>
                <span className="text-sm font-medium text-ink">
                  {a.status === 'in_progress'
                    ? 'â€”'
                    : `CEFR ${cefrLabel(a.estimated_level)}`}
                </span>
                {a.final_level != null && (
                  <span className="text-sm text-ink/70">
                    {t('placement:finalLevel', { level: cefrLabel(a.final_level) })}
                  </span>
                )}
                {a.status !== 'in_progress' && a.confidence && (
                  <span className="text-xs text-ink/50">{t(confidenceKey(a.confidence), { ns: 'placement' })}</span>
                )}
                {a.status !== 'in_progress' && (
                  <span className="text-xs text-ink/50">{t(reviewStatusKey(a.review_status), { ns: 'placement' })}</span>
                )}
                <span className="ml-auto text-xs text-ink/40">
                  {new Date(a.started_at).toLocaleDateString()}
                </span>
                {a.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/placement/attempt/${a.id}`)}
                    className="ml-auto rounded-lg border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {t('placement:resume')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
