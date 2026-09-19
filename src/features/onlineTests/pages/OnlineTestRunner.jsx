// OnlineTestRunner.jsx — overview → stages → submit → result for one test.
// Answers autosave via save RPC; grading happens only in the submit RPC.
// Submitted attempts are read-only. Per-item review shows correctness only,
// never answer keys (keys are never sent to the client).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle, Minus, Flag } from 'lucide-react';
import { useAcademy } from '../../../lib/AcademyDataContext';
import {
  listOnlineTests, startOnlineTestAttempt, getOnlineTestAttempt,
  saveOnlineTestAnswer, submitOnlineTestAttempt, listMyOnlineTestAttempts,
} from '../lib/onlineTestApi';
import { TestQuestionInput, isAnswerEmpty } from '../components/TestInputs';
import StatusPill from '../../../components/StatusPill';
import ErrorBanner from '../../../components/ErrorBanner';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { SkeletonList } from '../../../components/Skeleton';
import { formatDateOnly } from '../../../utils/date';

const STAGE_ORDER = ['vocabulary', 'grammar', 'sentences', 'writing'];

function stageKey(t, stage) {
  return t(`stage${stage[0].toUpperCase()}${stage.slice(1)}`);
}

function answerSummary(item, raw) {
  if (!raw) return null;
  if (item.question_type === 'multiple_choice') return raw.selected_value ?? null;
  if (item.question_type === 'matching') {
    const pairs = raw.pairs || [];
    if (!pairs.length) return null;
    return pairs.map(([l, r]) => `${l}–${r ?? '?'}`).join(', ');
  }
  if (item.question_type === 'ordering') return (raw.order || []).join(' ') || null;
  return (raw.answer || '').trim() || null;
}

function questionPromptText(item) {
  const p = item.prompt || {};
  if (p.question) return p.question;
  if (p.template) return p.template;
  if (p.source_text) return p.source_text;
  if (p.instruction && item.question_type === 'ordering') return p.instruction;
  return p.instruction || '';
}

function ResultView({ t, dateLocale, items, answers, meta }) {
  const total = items.length;
  const correct = items.filter((it) => answers[String(it.id)]?.is_correct === true).length;
  const incorrect = items.filter((it) => answers[String(it.id)]?.is_correct === false).length;
  const byStage = useMemo(() => {
    const m = {};
    for (const it of items) {
      m[it.stage] = m[it.stage] || { correct: 0, total: 0 };
      m[it.stage].total += 1;
      if (answers[String(it.id)]?.is_correct === true) m[it.stage].correct += 1;
    }
    return m;
  }, [items, answers]);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white p-5 text-center shadow-card sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">{t('resultTitle')}</h2>
        <p className="mt-2 font-display text-3xl font-extrabold text-brand-600">
          {t('rawScore', { correct: meta.raw_score ?? correct, total })} <span className="text-xl">{t('percentScore', { pct: meta.percentage ?? Math.round((correct / Math.max(total, 1)) * 100) })}</span>
        </p>
        <p className="mt-1 text-xs text-ink/50">
          {t('correctCount', { count: correct })} · {t('incorrectCount', { count: incorrect })}
          {meta.submitted_at ? ` · ${t('completedOn', { date: formatDateOnly(meta.submitted_at, dateLocale) })}` : ''}
        </p>
        <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
          {STAGE_ORDER.map((s) => (
            <div key={s} className="rounded-xl bg-paper px-2 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{stageKey(t, s)}</p>
              <p className="mt-0.5 font-display text-base font-bold text-ink">{t('stageScore', { correct: byStage[s]?.correct ?? 0, total: byStage[s]?.total ?? 0 })}</p>
            </div>
          ))}
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((it, idx) => {
          const flag = answers[String(it.id)]?.is_correct;
          const summary = answerSummary(it, answers[String(it.id)]?.answer);
          return (
            <li key={it.id} className="flex items-start gap-2.5 rounded-xl border border-ink/[0.06] bg-white px-3 py-2.5 shadow-card">
              {flag === true
                ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-active" aria-label={t('correct')} />
                : flag === false
                  ? <XCircle size={16} className="mt-0.5 shrink-0 text-inactive" aria-label={t('incorrect')} />
                  : <Minus size={16} className="mt-0.5 shrink-0 text-ink/30" aria-label={t('unanswered')} />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink/45">{idx + 1} · {stageKey(t, it.stage)}</p>
                <p className="truncate text-sm font-semibold text-ink">{questionPromptText(it)}</p>
                <p className="truncate text-xs text-ink/55">{t('yourAnswer')}: {summary ?? t('unanswered')}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function OnlineTestRunner() {
  const { t, i18n } = useTranslation(['onlineTest', 'common']);
  const dateLocale = i18n.language === 'uz' ? 'uz' : 'en-US';
  const { me } = useAcademy();
  const { testId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [test, setTest] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [items, setItems] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [qIdx, setQIdx] = useState(0);
  const [mode, setMode] = useState('loading'); // loading|error|overview|active|result
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [confirming, setConfirming] = useState(false);
  const saveTimers = useRef({});

  const loadAttemptData = useCallback(async (attemptId) => {
    const data = await getOnlineTestAttempt(attemptId);
    const list = data.items || [];
    const saved = {};
    for (const [itemId, rec] of Object.entries(data.answers || {})) {
      saved[itemId] = rec?.answer ?? null;
    }
    setAttempt(data.attempt);
    setItems(list);
    setDrafts(saved);
    if (data.attempt?.status === 'submitted') {
      // Attach correctness flags for review rendering.
      const flags = {};
      for (const [itemId, rec] of Object.entries(data.answers || {})) {
        flags[itemId] = { answer: rec?.answer ?? null, is_correct: rec?.is_correct ?? null };
      }
      setAttempt((prev) => ({ ...prev, _flags: flags }));
      setMode('result');
    } else {
      setMode('active');
    }
  }, []);

  const init = useCallback(async () => {
    setMode('loading');
    setError(null);
    try {
      const catalog = await listOnlineTests();
      const found = catalog.find((x) => String(x.id) === String(testId));
      if (!found) {
        const attempts = await listMyOnlineTestAttempts(Number(testId)).catch(() => []);
        if (!attempts.length) throw new Error('unavailable');
        // Test unpublished but attempts exist: still allow review via attempt param.
        setTest({ id: Number(testId), title: '', lesson_from: '', lesson_to: '' });
      } else {
        setTest(found);
      }
      const reviewId = searchParams.get('attempt');
      if (reviewId) {
        await loadAttemptData(Number(reviewId));
        return;
      }
      const mine = await listMyOnlineTestAttempts(Number(testId));
      const active = mine.find((a) => a.status === 'in_progress');
      if (active) {
        await loadAttemptData(active.attempt_id);
      } else {
        setMode('overview');
      }
    } catch {
      setError(t('loadFailed'));
      setMode('error');
    }
  }, [testId, searchParams, loadAttemptData, t]);

  useEffect(() => { if (me) init(); }, [me, init]);
  useEffect(() => () => Object.values(saveTimers.current).forEach(clearTimeout), []);

  const start = async () => {
    setError(null);
    try {
      const row = await startOnlineTestAttempt(Number(testId));
      setQIdx(0);
      await loadAttemptData(row.attempt_id);
      setMode('active');
    } catch {
      setError(t('loadFailed'));
    }
  };

  const saveDraft = useCallback((itemId, value) => {
    setDrafts((prev) => ({ ...prev, [itemId]: value }));
    if (!attempt || attempt.status !== 'in_progress') return;
    setSaveState('saving');
    clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(async () => {
      try {
        await saveOnlineTestAnswer(attempt.id, itemId, value);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 500);
  }, [attempt]);

  const submit = async () => {
    setConfirming(false);
    try {
      // Flush pending debounced saves first.
      Object.values(saveTimers.current).forEach(clearTimeout);
      const data = await submitOnlineTestAttempt(attempt.id);
      const fresh = await getOnlineTestAttempt(attempt.id);
      const flags = {};
      for (const [itemId, rec] of Object.entries(fresh.answers || {})) {
        flags[itemId] = { answer: rec?.answer ?? null, is_correct: rec?.is_correct ?? null };
      }
      setAttempt({ ...fresh.attempt, _flags: flags, _result: data });
      setMode('result');
    } catch {
      setError(t('submitFailed'));
    }
  };

  const stages = useMemo(() => {
    const m = {};
    for (const it of items) (m[it.stage] = m[it.stage] || []).push(it);
    return STAGE_ORDER.filter((s) => m[s]).map((s) => ({ stage: s, items: m[s] }));
  }, [items]);
  const flat = useMemo(() => stages.flatMap((s) => s.items.map((it) => ({ ...it, _stage: s.stage }))), [stages]);
  const answeredCount = flat.filter((it) => !isAnswerEmpty(drafts[it.id], it.question_type)).length;

  if (!me) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('notLinkedYet')}</p>
      </div>
    );
  }

  if (mode === 'loading') return <SkeletonList count={4} />;
  if (mode === 'error') {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-8 text-center shadow-card">
        <ErrorBanner>{error}</ErrorBanner>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={init} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white">{t('tryAgain')}</button>
          <button type="button" onClick={() => navigate('/online-tests')} className="rounded-xl border border-ink/10 px-4 py-2 text-xs font-bold text-ink">{t('back')}</button>
        </div>
      </div>
    );
  }

  if (mode === 'overview' || !attempt) {
    return (
      <div className="mx-auto max-w-[680px]">
        <button type="button" onClick={() => navigate('/online-tests')} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-ink/60 hover:text-ink">
          <ArrowLeft size={14} /> {t('back')}
        </button>
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-white p-5 shadow-card sm:p-6">
          <h1 className="font-display text-xl font-bold text-ink">{test?.title}</h1>
          <p className="mt-1 text-xs text-ink/50">
            {test?.lesson_from ? t('lessonsRange', { from: test.lesson_from, to: test.lesson_to }) : ''} · {t('stages')}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">{t('overviewHowItWorks')}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STAGE_ORDER.map((s) => (
              <div key={s} className="rounded-xl bg-paper px-2 py-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/45">{stageKey(t, s)}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={start}
            className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700"
          >
            {t('start')}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'result') {
    const flags = attempt._flags || {};
    return (
      <div className="mx-auto max-w-[680px]">
        <button type="button" onClick={() => navigate('/online-tests')} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-ink/60 hover:text-ink">
          <ArrowLeft size={14} /> {t('back')}
        </button>
        <ResultView t={t} dateLocale={dateLocale} items={items} answers={flags} meta={attempt} />
        <button
          type="button"
          onClick={async () => { setQIdx(0); await start(); }}
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm font-bold text-brand-700 hover:bg-brand-50"
        >
          {t('retake')}
        </button>
      </div>
    );
  }

  // active attempt
  const current = flat[qIdx];
  const currentStage = current?._stage;
  const stagePos = stages.findIndex((s) => s.stage === currentStage);
  const goStage = (idx) => {
    const s = stages[idx];
    if (!s) return;
    const firstGlobal = flat.findIndex((it) => it._stage === s.stage);
    setQIdx(firstGlobal);
  };
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-ink/50">{test?.title} · {t('questionOf', { current: qIdx + 1, total: flat.length })}</p>
        <span className={`text-[11px] font-bold ${saveState === 'error' ? 'text-inactive' : 'text-ink/40'}`}>
          {saveState === 'saving' ? t('saving') : saveState === 'error' ? t('saveFailed') : t('saved')}
        </span>
      </div>
      <div className="mb-4 flex gap-1.5" role="tablist" aria-label={t('title')}>
        {stages.map((s, idx) => {
          const done = s.items.filter((it) => !isAnswerEmpty(drafts[it.id], it.question_type)).length;
          return (
            <button
              key={s.stage}
              type="button"
              role="tab"
              aria-selected={idx === stagePos}
              onClick={() => goStage(idx)}
              className={`flex-1 rounded-xl px-2 py-2 text-center ring-1 transition-colors ${
                idx === stagePos ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink/60 ring-ink/10 hover:bg-ink/[0.03]'
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide">{stageKey(t, s.stage)}</span>
              <span className="block text-[11px] font-semibold tabular-nums">{done}/{s.items.length}</span>
            </button>
          );
        })}
      </div>
      <ErrorBanner>{error}</ErrorBanner>
      {current && (
        <div key={current.id} className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <div className="mb-1 flex items-center gap-1.5">
            <StatusPill tone="info">{stageKey(t, currentStage)}</StatusPill>
          </div>
          <p className="mb-3 font-display text-[15px] font-bold leading-snug text-ink">
            {current.prompt?.question || current.prompt?.template || current.prompt?.instruction || ''}
          </p>
          {current.question_type === 'fill_blank' && current.prompt?.instruction && (
            <p className="mb-2 text-xs text-ink/50">{current.prompt.instruction}</p>
          )}
          {current.question_type === 'translation' && (
            <p className="mb-2 text-xs text-ink/50">{current.prompt?.instruction || ''}</p>
          )}
          {current.question_type === 'matching' && (
            <p className="mb-2 text-xs text-ink/50">{current.prompt?.instruction || ''}</p>
          )}
          {current.question_type === 'ordering' && (
            <p className="mb-2 text-xs text-ink/50">{current.prompt?.instruction || ''}</p>
          )}
          <TestQuestionInput
            item={current}
            value={drafts[current.id] ?? null}
            onChange={(v) => saveDraft(current.id, v)}
            disabled={false}
            t={t}
          />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={qIdx === 0}
          onClick={() => { const n = qIdx - 1; setQIdx(n); }}
          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-xs font-bold text-ink disabled:opacity-40"
        >
          <ArrowLeft size={14} /> {t('back')}
        </button>
        <span className="text-[11px] font-semibold text-ink/40 tabular-nums">{answeredCount}/{flat.length}</span>
        {qIdx < flat.length - 1 ? (
          <button
            type="button"
            onClick={() => { const n = qIdx + 1; setQIdx(n); }}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            {t('next')} <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            <Flag size={14} /> {t('submitTest')}
          </button>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('submitConfirmTitle')}
          message={t('submitConfirmMessage')}
          confirmLabel={t('confirm')}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
