// TestInputs.jsx — controlled inputs for the 5 deterministic Online Test
// question types. Emits server-compatible answer shapes; never grades.
// Forked patterns (not imports) from homework's QuestionRenderer inputs.
import { useMemo } from 'react';

function isEmpty(value, qtype) {
  if (!value) return true;
  if (qtype === 'multiple_choice') return value.selected_value == null;
  if (qtype === 'matching') {
    const pairs = value.pairs || [];
    return pairs.length === 0 || pairs.some(([l, r]) => !l || !r);
  }
  if (qtype === 'ordering') return !(value.order || []).length;
  return !((value.answer || '').trim());
}

function MultipleChoiceInput({ prompt, value, onChange, disabled }) {
  const options = prompt.options || [];
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const selected = value?.selected_value === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ selected_value: opt })}
            className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              selected
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-ink/10 bg-white text-ink hover:bg-ink/[0.03]'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function MatchingInput({ prompt, value, onChange, disabled }) {
  const left = prompt.left || [];
  const right = prompt.right || [];
  const pairMap = useMemo(() => Object.fromEntries((value?.pairs || []).filter(([l]) => l)), [value]);
  const setPair = (l, r) => {
    const next = { ...pairMap, [l]: r };
    onChange({ pairs: left.map((k) => [k, next[k] || null]) });
  };
  return (
    <div className="grid gap-2">
      {left.map((l) => (
        <div key={l} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink">{l}</span>
          <span aria-hidden="true" className="text-ink/30">→</span>
          <select
            disabled={disabled}
            value={pairMap[l] || ''}
            onChange={(e) => setPair(l, e.target.value || null)}
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-ink/10 bg-white px-2 py-2 text-sm text-ink"
          >
            <option value="">—</option>
            {right.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function OrderingInput({ prompt, value, onChange, disabled }) {
  const tokens = prompt.tokens || [];
  // Pool instances keep identity so duplicate tokens are consumable twice.
  const pool = useMemo(() => tokens.map((tok, i) => ({ tok, i })), [prompt]);
  const order = value?.order || [];
  // Reconstruct used instance indices greedily in order.
  const used = useMemo(() => {
    const remaining = new Set(pool.map((p) => p.i));
    const picked = [];
    for (const tok of order) {
      const found = pool.find((p) => remaining.has(p.i) && p.tok === tok);
      if (!found) break;
      remaining.delete(found.i);
      picked.push(found.i);
    }
    return new Set(picked);
  }, [pool, order]);
  const tap = (inst) => {
    if (used.has(inst.i) || disabled) return;
    onChange({ order: [...order, inst.tok] });
  };
  const removeAt = (idx) => onChange({ order: order.filter((_, k) => k !== idx) });
  return (
    <div>
      <div className="mb-2 flex min-h-[52px] flex-wrap items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50/50 px-2.5 py-2">
        {order.length === 0 && <span className="text-xs text-ink/40">Tap words below in order</span>}
        {order.map((tok, idx) => (
          <button
            key={`${tok}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => removeAt(idx)}
            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-sm font-semibold text-white"
          >
            {tok}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pool.map((p) => (
          <button
            key={p.i}
            type="button"
            disabled={disabled || used.has(p.i)}
            onClick={() => tap(p)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
              used.has(p.i) ? 'border-ink/5 bg-ink/5 text-ink/25' : 'border-ink/15 bg-white text-ink hover:bg-ink/[0.03]'
            }`}
          >
            {p.tok}
          </button>
        ))}
      </div>
      {order.length > 0 && !disabled && (
        <button type="button" onClick={() => onChange({ order: [] })} className="mt-2 text-xs font-semibold text-ink/50 hover:text-ink">
          Clear
        </button>
      )}
    </div>
  );
}

function TextAnswerInput({ value, onChange, disabled, placeholder, multiline }) {
  const cls = 'w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/30';
  if (multiline) {
    return (
      <textarea
        disabled={disabled}
        value={value?.answer || ''}
        onChange={(e) => onChange({ answer: e.target.value })}
        placeholder={placeholder}
        rows={2}
        className={cls}
      />
    );
  }
  return (
    <input
      disabled={disabled}
      value={value?.answer || ''}
      onChange={(e) => onChange({ answer: e.target.value })}
      placeholder={placeholder}
      className={`${cls} min-h-[44px]`}
    />
  );
}

export function TestQuestionInput({ item, value, onChange, disabled, t }) {
  const prompt = item.prompt || {};
  switch (item.question_type) {
    case 'multiple_choice':
      return <MultipleChoiceInput prompt={prompt} value={value} onChange={onChange} disabled={disabled} />;
    case 'matching':
      return <MatchingInput prompt={prompt} value={value} onChange={onChange} disabled={disabled} />;
    case 'ordering':
      return <OrderingInput prompt={prompt} value={value} onChange={onChange} disabled={disabled} />;
    case 'fill_blank':
      return <TextAnswerInput value={value} onChange={onChange} disabled={disabled} placeholder={prompt.template || ''} />;
    case 'translation':
      return (
        <div>
          <p className="mb-2 rounded-xl bg-paper px-3 py-2.5 text-sm font-semibold text-ink">{prompt.source_text}</p>
          <TextAnswerInput value={value} onChange={onChange} disabled={disabled} placeholder={t('typeAnswer')} multiline={false} />
        </div>
      );
    default:
      return null;
  }
}

export function isAnswerEmpty(value, qtype) {
  return isEmpty(value, qtype);
}
