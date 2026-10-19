// PlacementReview.jsx - staff dashboard for the CEFR Placement Test.
// Teachers see only students whose group level they are assigned (RLS
// enforces the same scope); administrators see everything. Reviews assign
// rubric scores, confirm or adjust the recommended level with a recorded
// reason, and never move a student between groups automatically.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Search } from 'lucide-react';
import ErrorBanner from '../../../components/ErrorBanner';
import { SkeletonList } from '../../../components/Skeleton';
import { useAuth } from '../../../lib/AuthContext';
import {
  getPlacementAttempt,
  listPlacementAttemptsForStaff,
  submitPlacementReview,
} from '../lib/placementApi';
import {
  CEFR_LEVELS,
  SPEAKING_RUBRIC,
  WRITING_RUBRIC,
  attemptStatusKey,
  attemptStatusTone,
  cefrLabel,
  confidenceKey,
  reviewStatusKey,
} from '../lib/placementModel';

export default function PlacementReview() {
  const { t } = useTranslation(['placement', 'common']);
  const { role } = useAuth();

  const [attempts, setAttempts] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({ search: '', level: '', estimated: '', reviewStatus: '' });

  const load = useCallback(async () => {
    setError(null);
    try {
      setAttempts(await listPlacementAttemptsForStaff());
    } catch {
      setError(t('placement:loadFailed'));
      setAttempts([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!attempts) return [];
    let list = [...attempts];
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter((a) => {
        const s = a.students || {};
        return (
          (s.real_name || '').toLowerCase().includes(q) ||
          (s.english_name || '').toLowerCase().includes(q)
        );
      });
    }
    if (filters.level) list = list.filter((a) => (a.students?.level || '') === filters.level);
    if (filters.estimated) list = list.filter((a) => String(a.estimated_level ?? '') === filters.estimated);
    if (filters.reviewStatus) list = list.filter((a) => a.review_status === filters.reviewStatus);
    return list;
  }, [attempts, filters]);

  if (role !== 'administrator' && role !== 'teacher') {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
        <p className="text-sm text-ink/50">{t('placement:staffOnly')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedId ? (
        <ReviewDetail attemptId={selectedId} onBack={() => { setSelectedId(null); load(); }} />
      ) : (
        <>
          <h1 className="font-display text-lg font-semibold text-ink">{t('placement:reviewTitle')}</h1>

          {/* Filters */}
          <section className="rounded-2xl border border-ink/[0.06] bg-white p-3 shadow-card sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="relative block">
                <span className="sr-only">{t('placement:searchLabel')}</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" aria-hidden="true" />
                <input
                  type="search"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder={t('placement:searchLabel')}
                  className="w-full rounded-xl border border-ink/10 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </label>
              <select
                aria-label={t('placement:filterGroup')}
                value={filters.level}
                onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value }))}
                className="rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">{t('placement:filterGroup')}</option>
                {['A', 'A1', 'B', 'C'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select
                aria-label={t('placement:filterEstimated')}
                value={filters.estimated}
                onChange={(e) => setFilters((f) => ({ ...f, estimated: e.target.value }))}
                className="rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">{t('placement:filterEstimated')}</option>
                {CEFR_LEVELS.map((l, i) => (
                  <option key={l} value={String(i + 1)}>{l}</option>
                ))}
              </select>
              <select
                aria-label={t('placement:filterReviewStatus')}
                value={filters.reviewStatus}
                onChange={(e) => setFilters((f) => ({ ...f, reviewStatus: e.target.value }))}
                className="rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">{t('placement:filterReviewStatus')}</option>
                <option value="pending">{t('placement:reviewStatus.pending')}</option>
                <option value="insufficient_evidence">{t('placement:reviewStatus.insufficientEvidence')}</option>
                <option value="reviewed">{t('placement:reviewStatus.reviewed')}</option>
              </select>
            </div>
          </section>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          {/* List */}
          {!attempts ? (
            <div className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card">
              <SkeletonList rows={4} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-ink/[0.06] bg-white p-10 text-center shadow-card">
              <p className="text-sm text-ink/50">{t('placement:emptyReviewList')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink/[0.06] bg-white px-3 py-3 shadow-card sm:px-4"
                >
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${attemptStatusTone(a.status)}`}>
                    {t(attemptStatusKey(a.status), { ns: 'placement' })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {a.students?.real_name || 'â€”'}
                      {a.students?.english_name ? ` (${a.students.english_name})` : ''}
                    </p>
                    <p className="text-xs text-ink/40">
                      {t('placement:groupCol')}: {a.students?.level || 'â€”'}
                      {a.submitted_at
                        ? ` · ${new Date(a.submitted_at).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold text-ink">
                      {a.estimated_level ? `CEFR ${cefrLabel(a.estimated_level)}` : 'â€”'}
                    </p>
                    {a.final_level != null && (
                      <p className="text-ink/50">{t('placement:finalLevel', { level: cefrLabel(a.final_level) })}</p>
                    )}
                    <p className="text-ink/40">{t(reviewStatusKey(a.review_status), { ns: 'placement' })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {t('placement:openReview')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ReviewDetail({ attemptId, onBack }) {
  const { t } = useTranslation(['placement', 'common']);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  // Rubric + decision state
  const [writingScores, setWritingScores] = useState(null);
  const [speakingScores, setSpeakingScores] = useState(null);
  const [speakingConducted, setSpeakingConducted] = useState(false);
  const [finalLevel, setFinalLevel] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getPlacementAttempt(Number(attemptId));
      setPayload(data);
      const a = data?.attempt;
      if (a?.estimated_level) setFinalLevel(String(a.estimated_level));
      if (data?.review) {
        setWritingScores(data.review.writing_scores || null);
        setSpeakingScores(data.review.speaking_scores || null);
        setSpeakingConducted(!!data.review.speaking_conducted);
        setFinalLevel(String(data.review.final_level));
        setReason(data.review.reason || '');
      }
    } catch (e) {
      setError(
        typeof e?.message === 'string' && e.message.includes('access denied')
          ? t('placement:accessDenied')
          : t('placement:loadFailed')
      );
    }
  }, [attemptId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {t('placement:backToList')}
        </button>
        <ErrorBanner>{error}</ErrorBanner>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  const a = payload.attempt;
  const result = a?.result || {};
  const qById = Object.fromEntries((payload.questions || []).map((q) => [q.id, q]));
  const ansById = Object.fromEntries((payload.answers || []).map((x) => [x.question_id, x]));
  const isGradable = (q) => q.question_type === 'mcq' || q.question_type === 'gap_fill';

  const onConfirm = async () => {
    if (!finalLevel || !reason.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await submitPlacementReview({
        attemptId: Number(attemptId),
        finalLevel: Number(finalLevel),
        reason: reason.trim(),
        writingScores: writingScores ?? undefined,
        speakingScores: speakingScores ?? undefined,
        speakingConducted,
      });
      setSavedNote(true);
      await load();
    } catch (e) {
      setSaveError(t('placement:reviewFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {t('placement:backToList')}
      </button>

      {/* Header */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-lg font-semibold text-ink">
            {payload.student?.real_name || 'â€”'}
            {payload.student?.english_name ? ` (${payload.student.english_name})` : ''}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${attemptStatusTone(a?.status)}`}>
            {t(attemptStatusKey(a?.status), { ns: 'placement' })}
          </span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
            {t('placement:groupCol')}: {payload.student?.level || 'â€”'}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p className="text-ink/70">
            {t('placement:estimatedLevel')}:{' '}
            <span className="font-semibold">CEFR {cefrLabel(a?.estimated_level)}</span>
          </p>
          <p className="text-ink/70">
            {t('confidenceLabel', { ns: 'placement' })}:{' '}
            <span className="font-semibold">{a?.confidence ? t(confidenceKey(a.confidence), { ns: 'placement' }) : 'â€”'}</span>
          </p>
          <p className="text-ink/70">
            {t('placement:recommendedGroup')}:{' '}
            <span className="font-semibold">{result.recommended_academy_level || 'â€”'}</span>
          </p>
        </div>
        {a?.review_status === 'insufficient_evidence' && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            {t('placement:insufficientNotice')}
          </p>
        )}
      </section>

      {/* Skill evidence */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t('placement:skillBreakdown')}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(result.skills || {}).map(([skill, v]) => (
            <li key={skill} className="rounded-xl border border-ink/[0.06] px-3 py-2 text-sm">
              <span className="font-medium text-ink">{t(`skillNames.${skill}`, { ns: 'placement' })}</span>
              <span className="float-right tabular-nums text-ink/60">
                {v.pct != null ? `${v.pct}% · CEFR ${cefrLabel(v.level)} · ${v.asked}` : 'â€”'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink/40">{t('placement:evidenceNote', { asked: result.total_asked ?? 'â€”', answered: result.total_answered ?? 'â€”', skipped: result.total_skipped ?? 'â€”' })}</p>
      </section>

      {/* Answers with keys/explanations (staff, post-submit) */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t('placement:answers')}</h2>
        <ol className="mt-3 space-y-2">
          {(payload.questions || []).map((q, i) => {
            const ans = ansById[q.id];
            return (
              <li key={q.id} className="rounded-xl border border-ink/[0.06] p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-ink/40">#{i + 1}</span>
                  <span className="font-semibold text-brand-600">{t(`skillNames.${q.skill}`, { ns: 'placement' })}</span>
                  <span className="text-ink/30">CEFR {cefrLabel(q.cefr_level)}</span>
                  {isGradable(q) && ans && (
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ans.is_correct === true
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-ink/[0.06] text-ink/50'
                      }`}
                    >
                      {ans.is_correct === true
                        ? t('placement:correct')
                        : ans.skipped
                          ? t('placement:skipped')
                          : t('placement:incorrect')}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-ink">
                  {q.prompt.text || q.prompt.passage || q.prompt.audio_text}
                </p>
                {q.prompt.options && (
                  <p className="mt-1 text-xs text-ink/50">
                    {q.prompt.options.map((o, j) => (j === q.answer_key?.option_index ? `[${o}]` : o)).join(' · ')}
                  </p>
                )}
                {q.accepted_answers && (
                  <p className="mt-1 text-xs text-ink/50">
                    {t('placement:accepted')}: {(q.accepted_answers || []).join(', ')}
                  </p>
                )}
                {q.explanation && <p className="mt-1 text-xs italic text-ink/50">{q.explanation}</p>}
                {ans?.answer && (
                  <p className="mt-1.5 rounded-lg bg-paper p-2 text-sm text-ink/80">
                    {t('placement:studentAnswer')}:{' '}
                    {typeof ans.answer === 'object'
                      ? ans.answer.text ??
                        (q.prompt.options ? q.prompt.options[ans.answer.option_index] ?? 'â€”' : 'â€”')
                      : String(ans.answer)}
                  </p>
                )}
                {!ans && <p className="mt-1 text-xs text-ink/40">{t('placement:notAnswered')}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Review form */}
      <section className="rounded-2xl border border-ink/[0.06] bg-white p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t('placement:reviewFormTitle')}</h2>

        <RubricBlock
          title={t('placement:writingRubric')}
          dims={WRITING_RUBRIC}
          scores={writingScores}
          response={(payload.answers || []).find(
            (x) => qById[x.question_id]?.skill === 'writing'
          )?.answer?.text}
          onChange={setWritingScores}
        />
        <RubricBlock
          title={t('placement:speakingRubric')}
          dims={SPEAKING_RUBRIC}
          scores={speakingScores}
          response={null}
          conducted={speakingConducted}
          onConductedChange={setSpeakingConducted}
          prompts={(payload.questions || []).filter((q) => q.skill === 'speaking')}
          onChange={setSpeakingScores}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink">{t('placement:finalLevelLabel')}</span>
            <select
              value={finalLevel}
              onChange={(e) => setFinalLevel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">â€”</option>
              {CEFR_LEVELS.map((l, i) => (
                <option key={l} value={String(i + 1)}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">{t('placement:reasonLabel')}</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-xl border border-ink/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
        </div>

        <p className="mt-2 text-xs text-ink/40">{t('placement:noAutoMove')}</p>

        {savedNote && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {t('placement:reviewSaved')}
          </p>
        )}
        {saveError && <ErrorBanner>{saveError}</ErrorBanner>}

        <button
          type="button"
          onClick={onConfirm}
          disabled={saving || !finalLevel || !reason.trim() || a?.status === 'in_progress'}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {saving ? t('common:loading') : t('placement:confirmLevel')}
        </button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function RubricBlock({
  title,
  dims,
  scores,
  response,
  prompts,
  conducted,
  onConductedChange,
  onChange,
}) {
  const { t } = useTranslation('placement');
  const current = scores || {};

  const setDim = (dim, val) => {
    const next = { ...current, [dim]: Number(val) };
    onChange(next);
  };

  return (
    <div className="mt-4 rounded-xl border border-ink/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {onConductedChange && (
          <label className="flex items-center gap-2 text-xs text-ink/60">
            <input
              type="checkbox"
              checked={!!conducted}
              onChange={(e) => onConductedChange(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 text-brand-600 focus:ring-brand-400"
            />
            {t('speakingConducted')}
          </label>
        )}
      </div>

      {response != null && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-2 text-sm text-ink/80">
          {response.trim() ? response : t('noWritingResponse')}
        </p>
      )}
      {prompts?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {prompts.map((p) => (
            <li key={p.id} className="text-xs text-ink/60">
              {t('speakingPromptToUse')}: {p.prompt.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {dims.map((dim) => (
          <label key={dim} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink/70">{t(`rubric.${dim}`)}</span>
            <select
              value={current[dim] ?? ''}
              onChange={(e) => setDim(dim, e.target.value)}
              className="w-20 rounded-lg border border-ink/10 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">â€”</option>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
