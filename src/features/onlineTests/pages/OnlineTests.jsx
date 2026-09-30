// OnlineTests.jsx — selection + history for the isolated Online Test system.
// No imports from homework/exams/games. Reads published catalog + own attempts only.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Play, RotateCcw, Eye, Sparkles, Trophy } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import { listOnlineTests, listMyOnlineTestAttempts } from '../lib/onlineTestApi';
import OnlineExamRanking from '../components/OnlineExamRanking';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import { formatDateOnly } from '../../../utils/date';

export default function OnlineTests() {
  const { t, i18n } = useTranslation(['onlineTest', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me } = useAcademy();
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [history, setHistory] = useState({});
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('tests');

  const load = useCallback(async () => {
    setError(null);
    try {
      const catalog = await listOnlineTests();
      setTests(catalog);
      const hist = {};
      for (const test of catalog) {
        try {
          hist[test.id] = await listMyOnlineTestAttempts(test.id);
        } catch {
          hist[test.id] = [];
        }
      }
      setHistory(hist);
    } catch {
      setError(t('loadFailed'));
      setTests([]);
    }
  }, [t]);

  useEffect(() => { if (me) load(); }, [me, load]);

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
        <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink/55">{t('subtitle')}</p>
      </header>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="mb-4 inline-flex rounded-full bg-ink/[0.05] p-1" role="tablist" aria-label={t('title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tests'}
          onClick={() => setTab('tests')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${tab === 'tests' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink/70'}`}
        >
          <ClipboardList size={13} aria-hidden /> {t('testsTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ranking'}
          onClick={() => setTab('ranking')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${tab === 'ranking' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink/70'}`}
        >
          <Trophy size={13} aria-hidden /> {t('rankingTab')}
        </button>
      </div>

      {tab === 'ranking' ? (
        <OnlineExamRanking />
      ) : tests === null ? (
        <SkeletonList count={3} />
      ) : tests.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white shadow-card">
          <div className="px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-ink/[0.06]">
              <Sparkles className="text-brand-500" size={22} aria-hidden="true" />
            </div>
            <h2 className="mx-auto mt-4 max-w-[28ch] font-display text-xl font-bold leading-tight text-ink">{t('unpublishedTitle')}</h2>
            <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-ink/55">{t('unpublishedBody')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => {
            const attempts = history[test.id] || [];
            const active = attempts.find((a) => a.status === 'in_progress');
            const submitted = attempts.filter((a) => a.status === 'submitted');
            const latest = submitted[0] || null;
            const best = submitted.length ? Math.max(...submitted.map((a) => Number(a.percentage) || 0)) : null;
            const completed = latest != null;
            return (
              <section key={test.id} aria-label={test.title} className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${completed ? 'bg-active' : 'bg-brand-600'}`}><ClipboardList size={18} /></span>
                      <p className="font-display text-base font-bold text-ink">{test.title}</p>
                      {active
                        ? <StatusPill tone="info">{t('inProgress')}</StatusPill>
                        : latest && <StatusPill tone="brand">{t('submitted')}</StatusPill>}
                    </div>
                    <p className="mt-1.5 text-xs text-ink/50">
                      {t('lessonsRange', { from: test.lesson_from, to: test.lesson_to })} · {t('stages')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/50">{t('autoGraded')}</p>
                    {submitted.length > 0 && (
                      <p className="mt-0.5 text-xs font-semibold text-ink/55">{t('attemptsCount', { count: submitted.length })}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {latest && (
                      <p className="font-display text-lg font-bold text-brand-600">
                        {t('rawScore', { correct: latest.raw_score, total: 34 })} <span className="text-sm font-semibold text-ink/40">{t('percentScore', { pct: latest.percentage })}</span>
                      </p>
                    )}
                    {best != null && (
                      <p className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                        <Trophy size={11} aria-hidden /> {t('bestResult', { pct: best })}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/online-tests/${test.id}`)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700"
                    >
                      {active ? <><RotateCcw size={14} /> {t('resume')}</> : latest ? <><Eye size={14} /> {t('review')}</> : <><Play size={14} /> {t('start')}</>}
                    </button>
                  </div>
                </div>
                {submitted.length > 0 && (
                  <div className="mt-3 border-t border-ink/[0.06] pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink/40">{t('attemptsHistory')}</p>
                    <ul className="space-y-1.5">
                      {submitted.slice(0, 5).map((a) => (
                        <li key={a.attempt_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-xs text-ink/55">{t('attemptOn', { date: a.submitted_at ? formatDateOnly(a.submitted_at, dateLocale) : '' })}</span>
                          <button
                            type="button"
                            onClick={() => navigate(`/online-tests/${test.id}?attempt=${a.attempt_id}`)}
                            className="text-xs font-bold text-brand-600 hover:underline"
                          >
                            {t('rawScore', { correct: a.raw_score, total: 34 })} · {t('percentScore', { pct: a.percentage })} — {t('review')}
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
