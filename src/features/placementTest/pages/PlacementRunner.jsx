// PlacementRunner.jsx - the student test-taking flow for the CEFR
// Placement Test. The server is the sole authority: every answer is graded
// server-side, correctness is never revealed during the attempt, and the
// next question always comes from get_next_placement_question. The client
// only renders and records what the student did.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleDashed, Play, SkipForward, Volume2 } from 'lucide-react';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import {
  getNextPlacementQuestion,
  getPlacementAttempt,
  savePlacementAnswer,
  submitPlacementAttempt,
} from '../lib/placementApi';
import {
  OBJECTIVE_SKILLS,
  attemptStatusTone,
  cefrLabel,
  confidenceKey,
  reviewStatusKey,
} from '../lib/placementModel';
import { createSerializedQueue } from '../lib/promiseQueue';
import { useUzbekInstructions } from '../lib/useUzbekInstructions';

export default function PlacementRunner() {
  useUzbekInstructions();
  const { attemptId } = useParams();
  const { t } = useTranslation(['placement', 'common']);
  const id = Number(attemptId);

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(null); // question | writing | speaking | complete | expired
  const [question, setQuestion] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [progress, setProgress] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [result, setResult] = useState(null);
  const [finalLevelFlag, setFinalLevelFlag] = useState(null);
  const [reviewFlag, setReviewFlag] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Answer state, reset whenever a new question arrives.
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [text, setText] = useState('');
  const [writingText, setWritingText] = useState('');

  // Serialize save calls so a slow save can never be overwritten by a
  // newer one out of order. Rejection-safe: one failed save must not
  // swallow later saves (tests/placement-queue.test.mjs).
  const queueRef = useRef(createSerializedQueue());
  // One-shot guard for automatic submission (expiry / resume edge): a
  // failed auto-submit must not retry forever; reset when the attempt
  // identity changes so a different attempt auto-submits normally.
  const autoSubmitRef = useRef(false);
  // Saved writing draft, restored when an interrupted attempt resumes.
  const writingDraftRef = useRef('');

  const loadAttemptMeta = useCallback(async () => {
    try {
      const payload = await getPlacementAttempt(id);
      setDeadline(payload?.attempt?.deadline ?? null);
      if (payload?.attempt?.status && payload.attempt.status !== 'in_progress') {
        setResult(payload?.attempt?.result ?? null);
        setReviewFlag(payload?.attempt?.review_status ?? null);
        setFinalLevelFlag(payload?.attempt?.final_level ?? null);
        setPhase('complete');
        return true;
      }
      const questions = payload?.questions ?? [];
      const answers = payload?.answers ?? [];
      const writingQ = questions.find((q) => q.skill === 'writing');
      const writingA = answers.find((x) => x.question_id === writingQ?.id);
      writingDraftRef.current = writingA?.answer?.text ?? '';
    } catch {
      // non-fatal: the phase machine below still works
    }
    return false;
  }, [id]);

  const advance = useCallback(async () => {
    const res = await getNextPlacementQuestion(id);
    setProgress(res?.progress ?? null);
    setQuestion(res?.question ?? null);
    setPrompts(res?.prompts ?? []);
    setPhase(res?.phase ?? 'complete');
    setSelectedIndex(null);
    setText('');
    setWritingText('');
    return res;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const alreadyDone = await loadAttemptMeta();
      if (cancelled) return;
      if (alreadyDone) {
        setLoading(false);
        return;
      }
      try {
        const res = await advance();
        if (res?.phase === 'writing' && writingDraftRef.current) {
          setWritingText(writingDraftRef.current);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            typeof e?.message === 'string' && e.message.includes('attempt not found')
              ? t('placement:notFound')
              : t('placement:loadFailed')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [advance, loadAttemptMeta, t]);

  const doSubmit = useCallback(
    async ({ silent } = {}) => {
      if (busy) return; // duplicate-submission guard
      setBusy(true);
      setError(null);
      try {
        await queueRef.current.enqueue(async () => {
          const res = await submitPlacementAttempt(id);
          setResult(res);
          setPhase('complete');
        });
      } catch {
        if (!silent) setError(t('placement:submitFailed'));
      } finally {
        setBusy(false);
      }
    },
    [busy, id, t]
  );

  // Attempt expiry: server-set deadline, client mirrors it and
  // auto-submits what exists when time runs out.
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = () => {
      const ms = new Date(deadline).getTime() - Date.now();
      setRemaining(ms > 0 ? ms : 0);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (remaining === 0 && phase && phase !== 'complete' && phase !== 'expired') {
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true;
        doSubmit({ silent: true });
      }
    }
  }, [remaining, phase, doSubmit]);

  // Resume edge: if the engine says 'complete' but this session has no
  // result yet (e.g. reload after the speaking phase), finalize now.
  useEffect(() => {
    if (phase === 'complete' && !result && !busy && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      doSubmit({ silent: true });
    }
  }, [phase, result, busy, doSubmit]);

  // A different attempt (retake / navigation) may auto-submit again.
  useEffect(() => {
    autoSubmitRef.current = false;
  }, [id]);

  const saveAndAdvance = useCallback(
    async ({ answer, skipped }) => {
      if (!question || busy) return;
      setBusy(true);
      setError(null);
      try {
        await queueRef.current.enqueue(async () => {
          await savePlacementAnswer(id, question.id, answer ?? null, !!skipped);
          await advance();
        });
      } catch {
        setError(t('placement:saveFailed'));
      } finally {
        setBusy(false);
      }
    },
    [question, busy, id, advance, t]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('placement:expiredTitle')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('placement:expiredMessage')}</p>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <ResultSummary result={result} reviewStatus={reviewFlag} finalLevel={finalLevelFlag} />
    );
  }

  const mm = remaining != null ? Math.floor(remaining / 60000) : null;
  const ss = remaining != null ? Math.floor((remaining % 60000) / 1000) : null;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <SectionStepper phase={phase} question={question} progress={progress} />
      {remaining != null && (
        <p className="text-right text-xs tabular-nums text-ink/40" aria-live="off">
          {t('placement:timeLeft', { time: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` })}
        </p>
      )}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Objective question */}
      {phase === 'question' && question && (
        <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            {t(`placement:skillNames.${question.skill}`)}
          </p>

          {question.question_type === 'mcq' && (
            <McqBody question={question} selectedIndex={selectedIndex} onSelect={setSelectedIndex} t={t} />
          )}

          {question.question_type === 'gap_fill' && (
            <div className="mt-3">
              <label htmlFor="placement-gap" className="block text-base font-medium text-ink">
                {question.prompt.text}
              </label>
              <input
                id="placement-gap"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                className="mt-3 w-full max-w-sm rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                saveAndAdvance({
                  answer:
                    question.question_type === 'mcq'
                      ? { option_index: selectedIndex }
                      : { text: text.trim() },
                  skipped:
                    (question.question_type === 'mcq' && selectedIndex == null) ||
                    (question.question_type === 'gap_fill' && !text.trim()),
                })
              }
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy ? t('common:loading') : t('placement:next')}
            </button>
            <button
              type="button"
              onClick={() => saveAndAdvance({ answer: null, skipped: true })}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink/60 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"
            >
              <SkipForward size={15} aria-hidden="true" />
              {t('placement:skip')}
            </button>
          </div>
        </section>
      )}

      {/* Writing */}
      {phase === 'writing' && question && (
        <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            {t('placement:skillNames.writing')}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-ink">{question.prompt.text}</h2>
          {question.prompt.guidance && (
            <p className="mt-1 text-sm text-ink/50">{question.prompt.guidance}</p>
          )}
          <label htmlFor="placement-writing" className="sr-only">
            {t('placement:writingLabel')}
          </label>
          <textarea
            id="placement-writing"
            value={writingText}
            onChange={(e) => setWritingText(e.target.value)}
            rows={8}
            maxLength={4000}
            className="mt-3 w-full rounded-xl border border-ink/10 p-3 text-sm leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            placeholder={t('placement:writingPlaceholder')}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-ink/40">{t('placement:writingNote')}</p>
            <button
              type="button"
              onClick={() =>
                saveAndAdvance({
                  answer: { text: writingText.trim() },
                  skipped: !writingText.trim(),
                })
              }
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy ? t('common:loading') : t('placement:writingNext')}
            </button>
          </div>
        </section>
      )}

      {/* Speaking: prompts for the teacher-conducted assessment */}
      {phase === 'speaking' && (
        <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
            {t('placement:skillNames.speaking')}
          </p>
          <p className="mt-1 text-sm text-ink/70">{t('placement:speakingIntro')}</p>
          <ul className="mt-3 space-y-2">
            {prompts.map((p) => (
              <li key={p.id} className="rounded-xl border border-ink/[0.06] p-3">
                <p className="text-sm font-semibold text-ink">{p.prompt.text}</p>
                {p.prompt.guidance && <p className="mt-1 text-sm text-ink/50">{p.prompt.guidance}</p>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => doSubmit()}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? t('common:loading') : t('placement:finish')}
          </button>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function McqBody({ question, selectedIndex, onSelect, t }) {
  const isListening = question.skill === 'listening';
  const utterRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback(() => {
    if (!isListening || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(question.prompt.audio_text || '');
    u.lang = 'en-US';
    u.rate = 0.95;
    u.onend = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    utterRef.current = u;
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }, [isListening, question]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return (
    <div className="mt-3">
      {question.prompt.passage && (
        <p className="rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink">
          {question.prompt.passage}
        </p>
      )}
      {isListening && (
        <div className="mt-3">
          {typeof window !== 'undefined' && window.speechSynthesis ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={play}
                disabled={playing}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <Volume2 size={16} aria-hidden="true" />
                {playing ? t('placement:playing') : t('placement:play')}
              </button>
              <p className="text-xs text-ink/40">{t('placement:listeningHint')}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {t('placement:listeningUnavailable')}
            </p>
          )}
        </div>
      )}
      <h2 className="mt-3 text-base font-medium text-ink">{question.prompt.text}</h2>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={question.prompt.text}>
        {(question.prompt.options || []).map((opt, i) => {
          const checked = selectedIndex === i;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(i)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                checked
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-ink/10 bg-white text-ink hover:border-brand-200 hover:bg-brand-50/40'
              }`}
            >
              {checked ? (
                <CheckCircle2 size={18} className="flex-shrink-0 text-brand-600" aria-hidden="true" />
              ) : (
                <CircleDashed size={18} className="flex-shrink-0 text-ink/30" aria-hidden="true" />
              )}
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SectionStepper({ phase, question, progress }) {
  const { t } = useTranslation('placement');
  const steps = [...OBJECTIVE_SKILLS, 'writing', 'speaking'];
  // The current objective skill is the first one still being asked.
  const activeSkill =
    phase === 'writing'
      ? 'writing'
      : phase === 'speaking'
        ? 'speaking'
        : question?.skill ?? null;
  const skills = progress?.skills ?? {};

  const done = (skill) => {
    if (!OBJECTIVE_SKILLS.includes(skill)) return false;
    const s = skills[skill];
    return s && s.asked > 0 && activeSkill && steps.indexOf(activeSkill) > steps.indexOf(skill);
  };

  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-ink/[0.06] bg-white px-4 py-3 shadow-card" aria-label={t('progressLabel')}>
      {steps.map((skill) => {
        const isActive = skill === activeSkill;
        const asked = skills[skill]?.asked ?? 0;
        return (
          <li key={skill} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? 'bg-brand-600' : done(skill) || (skill !== 'writing' && skill !== 'speaking' && asked > 0 && !isActive)
                  ? 'bg-emerald-500'
                  : 'bg-ink/15'
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-ink/40'}`}
              aria-current={isActive ? 'step' : undefined}
            >
              {t(`skillNames.${skill}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
function ResultSummary({ result, reviewStatus, finalLevel }) {
  const { t } = useTranslation(['placement', 'common']);
  const skills = result?.skills ?? {};

  if (!result) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-ink">{t('placement:resultUnavailable')}</p>
        <p className="mt-1 text-sm text-ink/50">{t('placement:resultUnavailableNote')}</p>
      </div>
    );
  }

  const skillEntries = Object.entries(skills).filter(([, v]) => v && v.pct != null);
  const strongest = result.strongest_skill;
  const weakest = result.weakest_skill;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <p className="text-sm text-ink/50">{t('resultTitle')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="font-display text-4xl font-bold text-brand-700">{cefrLabel(result.overall_level)}</p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${attemptStatusTone('submitted')}`}>
            {t('preliminary')}
          </span>
          {result.insufficient_evidence && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              {t('insufficientEvidenceBadge')}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-ink/70">
          {t('confidenceLabel')}: <span className="font-semibold">{t(confidenceKey(result.confidence))}</span>
        </p>
        {result.recommended_academy_level && (
          <p className="mt-1 text-sm text-ink/70">
            {t('recommendedGroup')}:{' '}
            <span className="font-semibold">{result.recommended_academy_level}</span>
          </p>
        )}

        {reviewStatus === 'reviewed' && finalLevel ? (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            {t('finalLevel', { level: cefrLabel(finalLevel) })}
          </p>
        ) : result.insufficient_evidence ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            {t('insufficientNotice')}
          </p>
        ) : (
          <p className="mt-3 rounded-xl bg-brand-50/60 p-3 text-sm text-ink/70">
            {t('pendingReviewNotice')}
          </p>
        )}
        <p className="mt-2 text-xs text-ink/40">{t('disclaimer')}</p>
      </section>

      {/* Per-skill evidence */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t('skillBreakdown')}</h2>
        <ul className="mt-3 space-y-2.5">
          {skillEntries.map(([skill, v]) => (
            <li key={skill}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">
                  {t(`skillNames.${skill}`)}
                  {skill === strongest && (
                    <span className="ml-2 text-xs text-emerald-600">{t('strongest')}</span>
                  )}
                  {skill === weakest && (
                    <span className="ml-2 text-xs text-ink/40">{t('weakest')}</span>
                  )}
                </span>
                <span className="tabular-nums text-ink/60">
                  {v.pct}% · CEFR {cefrLabel(v.level)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max(0, Math.min(100, v.pct))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {(reviewStatus ?? result.review_status) === 'reviewed' && (
          <p className="mt-3 text-xs text-ink/50">
            {t(reviewStatusKey('reviewed'))}
          </p>
        )}
      </section>
    </div>
  );
}
