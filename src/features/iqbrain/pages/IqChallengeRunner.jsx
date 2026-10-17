// IqChallengeRunner.jsx - one attempt at a time. All grading, deadlining and
// retry accounting happen in the database; this page only collects answers,
// mirrors the server deadline in a countdown, and renders the graded payload.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, ArrowLeft, Trophy } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import useIqAttempt from '../hooks/useIqAttempt';
import useIqTimer from '../hooks/useIqTimer';
import IqTimer from '../components/IqTimer';
import QuestionCard from '../components/QuestionCard';
import CategoryBreakdown from '../components/CategoryBreakdown';
import PerformanceBadge from '../components/PerformanceBadge';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import { formatPercent, formatScore, difficultyLabel, formatDuration } from '../lib/iqScoring';

export default function IqChallengeRunner() {
  const { t } = useTranslation(['iqbrain', 'common']);
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { me } = useAcademy();
  const { payload, loading, error, draft, saveState, setAnswer, submit } = useIqAttempt(attemptId);

  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  const attempt = payload?.attempt;
  const items = useMemo(() => (Array.isArray(payload?.items) ? payload.items : []), [payload]);
  const graded = attempt && attempt.status !== 'in_progress';

  const onExpire = useCallback(() => {
    setExpired(true);
    if (attempt && attempt.status === 'in_progress') {
      setSubmitting(true);
      submit().catch(() => setSubmitting(false));
    }
  }, [attempt, submit]);

  const remainingMs = useIqTimer(attempt?.deadline, attempt?.server_now, onExpire);

  useEffect(() => { setCurrent(0); }, [attemptId]);

  if (!me) return null;
  if (loading) return <SkeletonList count={3} />;

  if (error) {
    return (
      <div className="min-w-0">
        <ErrorBanner>{error}</ErrorBanner>
        <Link to="/iq-brain" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
          <ArrowLeft size={14} aria-hidden /> {t('backToHub')}
        </Link>
      </div>
    );
  }
  if (!attempt) return <SkeletonList count={3} />;

  const answers = (payload.answers && typeof payload.answers === 'object') ? payload.answers : {};
  const explanations = (payload.explanations && typeof payload.explanations === 'object') ? payload.explanations : {};
  const answeredCount = Object.keys(draft).length;

  const doSubmit = async () => {
    setSubmitting(true);
    try { await submit(); } catch { /* error surfaced through hook */ }
    finally { setSubmitting(false); }
  };

  // ---------- Result ----------
  if (graded) {
    return (
      <div className="min-w-0 space-y-4">
        <header className="mb-6">
          <Link to="/iq-brain" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline">
            <ArrowLeft size={14} aria-hidden /> {t('backToHub')}
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
            {payload?.challenge?.title || t('title')}
          </h1>
          <p className="mt-1 text-sm text-ink/55">
            {attempt.status === 'expired' ? t('expiredNote') : t('submittedNote')}
          </p>
        </header>

        <section className="rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('challengeScore')}</p>
              <p className="mt-1 font-display text-4xl font-bold tabular-nums text-brand-600">
                {formatScore(attempt.score)}
                <span className="text-xl font-semibold text-ink/40"> / {formatScore(attempt.max_score)}</span>
              </p>
              <p className="mt-1 text-sm font-bold text-ink/60">
                {t('percentLabel', { pct: formatPercent(attempt.percentage) })}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <PerformanceBadge level={attempt.performance_level} />
              <p className="text-sm font-bold text-ink/60">
                {t('correctCount', { correct: attempt.correct_count, total: items.length })}
              </p>
              {attempt.duration_ms != null && (
                <p className="text-xs text-ink/45">{t('duration', { time: formatDuration(attempt.duration_ms) })}</p>
              )}
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-xs text-ink/55">{t('noIqClaim')}</p>
        </section>

        <CategoryBreakdown categoryScores={attempt.category_scores} />

        <section aria-label={t('reviewTitle')} className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-6">
          <h2 className="mb-4 font-display text-base font-bold text-ink">{t('reviewTitle')}</h2>
          <ol className="space-y-3">
            {items.map((item, i) => {
              const entry = answers[item.id] || {};
              const correct = entry.is_correct === true;
              const prompt = (item.prompt && typeof item.prompt === 'object') ? item.prompt : {};
              return (
                <li key={item.id} className="rounded-xl border border-ink/[0.06] p-3.5">
                  <div className="flex items-start gap-2.5">
                    {correct
                      ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                      : <XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" aria-hidden />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {i + 1}. {prompt.stem || ''}
                      </p>
                      <p className="mt-1 text-xs text-ink/55">
                        {t(`category.${item.category}`)} - {t(`difficulty.${difficultyLabel(item.difficulty)}`)} -{' '}
                        {correct
                          ? t('earnedPoints', { points: entry.points_earned })
                          : t('noPoints')}
                      </p>
                      {explanations[item.id] && (
                        <p className="mt-1.5 rounded-lg bg-brand-50 px-2.5 py-2 text-xs leading-relaxed text-brand-800">
                          {explanations[item.id]}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/iq-brain"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            <Trophy size={14} aria-hidden /> {t('backToHub')}
          </Link>
          <Link
            to="/iq-brain/history"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-ink/[0.08] bg-white px-4 py-2.5 text-xs font-bold text-ink/70 hover:border-brand-300 hover:text-brand-700"
          >
            {t('historyLink')}
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Active attempt ----------
  const item = items[current];
  const last = current === items.length - 1;
  const busy = submitting || expired;

  return (
    <div className="min-w-0">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/iq-brain" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">
            <ArrowLeft size={13} aria-hidden /> {t('backToHub')}
          </Link>
          <h1 className="mt-1.5 font-display text-xl font-bold tracking-tight text-ink">
            {payload?.challenge?.title || t('title')}
          </h1>
          <p className="text-xs text-ink/50">{t('attemptProgress', { answered: answeredCount, total: items.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] font-bold text-ink/40 sm:inline">
            {saveState === 'saving' ? t('saving') : saveState === 'failed' ? t('saveFailed') : t('saved')}
          </span>
          <IqTimer remainingMs={remainingMs} autoSubmitted={expired} />
        </div>
      </header>

      <ErrorBanner>{error}</ErrorBanner>

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label={t('questionNav')}>
        {items.map((it, i) => {
          const chosen = draft[it.id] && Object.keys(draft[it.id]).length > 0;
          return (
            <button
              key={it.id}
              type="button"
              aria-label={t('questionN', { n: i + 1, total: items.length })}
              aria-current={i === current}
              onClick={() => setCurrent(i)}
              className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                i === current
                  ? 'bg-brand-600 text-white'
                  : chosen
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                    : 'bg-ink/[0.06] text-ink/50 hover:bg-ink/10'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      {item && (
        <QuestionCard
          key={item.id}
          item={item}
          index={current}
          total={items.length}
          value={draft[item.id]}
          disabled={busy}
          onChange={(value) => setAnswer(item.id, value)}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          disabled={current === 0}
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-white px-4 py-2.5 text-xs font-bold text-ink/70 hover:border-brand-300 disabled:opacity-40"
        >
          <ChevronLeft size={14} aria-hidden /> {t('previous')}
        </button>

        {last ? (
          <button
            type="button"
            disabled={busy}
            onClick={doSubmit}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            <CheckCircle2 size={14} aria-hidden /> {submitting ? t('submitting') : t('submit')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.min(items.length - 1, c + 1))}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700"
          >
            {t('next')} <ChevronRight size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
