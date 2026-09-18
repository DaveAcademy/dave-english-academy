// QuestionRenderer.jsx
// Renders one seeded homework question with a controlled draft + explicit
// Submit. Answer shapes match what auto_grade_homework_answer() expects:
//   multiple_choice: { selected_index } vs question_data.correct_index
//   matching:        { pairs: [[leftIdx, rightIdx], ...] } (canonical order) vs correct_pairs
//   fill_blank:      { answer } vs question_data.answer (case-insensitive)
//   translation:     { answer } vs question_data.target_text (case-insensitive)
//   sentence_creation / short_answer / reading_comprehension: stored, teacher-reviewed
// Grading display reads the SAVED answer row (top-level is_correct /
// auto_graded columns) — never answer_data.is_correct, which does not exist.

import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Send } from 'lucide-react';

function ResultBanner({ savedAnswer, explanation }) {
  if (!savedAnswer) return null;
  if (savedAnswer.is_correct === true) {
    return (
      <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
        <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> Correct!</span>
        {explanation && <p className="mt-1 text-xs font-normal text-emerald-700/80">{explanation}</p>}
      </div>
    );
  }
  if (savedAnswer.is_correct === false) {
    return (
      <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-100">
        <span className="inline-flex items-center gap-1"><XCircle size={14} /> Not quite — try again.</span>
        {explanation && <p className="mt-1 text-xs font-normal text-red-500">{explanation}</p>}
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
      <span className="inline-flex items-center gap-1"><Clock size={13} /> Submitted — awaiting teacher review.</span>
    </div>
  );
}

function SubmitButton({ disabled, submitting, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
    >
      <Send size={13} /> {submitting ? 'Submitting…' : 'Submit answer'}
    </button>
  );
}

function MatchingInput({ question, draft, setDraft }) {
  const left = question.question_data?.left || [];
  const right = question.question_data?.right || [];
  const pairs = draft.pairs || [];
  const [selLeft, setSelLeft] = useState(null);
  if (left.length === 0 || right.length === 0) {
    return <p className="py-2 text-center text-sm text-ink/40">No matching items defined.</p>;
  }
  const pairedLeft = new Set(pairs.map((p) => p[0]));
  const pairedRight = new Set(pairs.map((p) => p[1]));
  const pickRight = (rIdx) => {
    if (selLeft == null) return;
    const next = pairs.filter((p) => p[0] !== selLeft && p[1] !== rIdx);
    next.push([selLeft, rIdx]);
    next.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    setDraft({ pairs: next });
    setSelLeft(null);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink/45">Tap a left item, then its match on the right.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {left.map((item, idx) => (
            <button
              key={idx}
              onClick={() => !pairedLeft.has(idx) && setSelLeft(selLeft === idx ? null : idx)}
              disabled={pairedLeft.has(idx)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                pairedLeft.has(idx) ? 'border-ink/10 bg-ink/5 text-ink/30'
                : selLeft === idx ? 'border-brand-300 bg-brand-50 font-bold text-brand-700 ring-1 ring-brand-200'
                : 'border-ink/10 bg-white text-ink/70 hover:bg-brand-50'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {right.map((item, idx) => (
            <button
              key={idx}
              onClick={() => !pairedRight.has(idx) && pickRight(idx)}
              disabled={pairedRight.has(idx) || selLeft == null}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                pairedRight.has(idx) ? 'border-ink/10 bg-ink/5 text-ink/30'
                : 'border-ink/10 bg-white text-ink/70 hover:bg-brand-50'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((p, i) => (
            <button
              key={i}
              onClick={() => setDraft({ pairs: pairs.filter((_, j) => j !== i) })}
              title="Remove pair"
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-red-50 hover:text-red-600"
            >
              {left[p[0]]} ↔ {right[p[1]]} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MultipleChoiceInput({ question, draft, setDraft }) {
  const options = question.question_data?.options || [];
  if (options.length === 0) return <p className="py-2 text-center text-sm text-ink/40">No options defined.</p>;
  return (
    <div className="space-y-2">
      {options.map((option, idx) => (
        <button
          key={idx}
          onClick={() => setDraft({ selected_index: idx })}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            draft.selected_index === idx
              ? 'border-brand-300 bg-brand-50 font-bold text-brand-700 ring-1 ring-brand-200'
              : 'border-ink/10 bg-white text-ink/70 hover:bg-brand-50'
          }`}
        >
          <span className="font-bold text-ink/30">{idx + 1}.</span> {option}
        </button>
      ))}
    </div>
  );
}

function TextInput({ draft, setDraft, field, multiline, placeholder }) {
  const common = 'w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
  if (multiline) {
    return (
      <textarea
        value={draft[field] || ''}
        onChange={(e) => setDraft({ [field]: e.target.value })}
        className={`${common} min-h-[80px]`}
        placeholder={placeholder}
      />
    );
  }
  return (
    <input
      type="text"
      value={draft[field] || ''}
      onChange={(e) => setDraft({ [field]: e.target.value })}
      className={common}
      placeholder={placeholder}
    />
  );
}

function OrderingInput({ question, draft, setDraft }) {
  const items = question.question_data?.items || [];
  const order = draft.order || [];
  if (items.length === 0) return <p className="py-2 text-center text-sm text-ink/40">No items defined.</p>;
  const remaining = items.map((_, i) => i).filter((i) => !order.includes(i));
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink/45">Tap the words in the correct order.</p>
      {order.length > 0 && (
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 ring-1 ring-brand-100">
          {order.map((i) => items[i]).join(' ')}
          <button onClick={() => setDraft({ order: [] })} className="ml-2 text-xs font-bold text-red-500 hover:underline">Reset</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {remaining.map((i) => (
          <button
            key={i}
            onClick={() => setDraft({ order: [...order, i] })}
            className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-sm text-ink/70 hover:bg-brand-50"
          >
            {items[i]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadingInput({ question, draft, setDraft }) {
  const passage = question.question_data?.passage || '';
  const questions = question.question_data?.questions || [];
  const answers = draft.answers || [];
  const setOne = (qIdx, value) => {
    const next = answers.slice();
    next[qIdx] = { question_index: qIdx, answer: value };
    setDraft({ answers: next });
  };
  return (
    <div className="space-y-3">
      {passage && (
        <div className="rounded-lg border border-ink/10 bg-paper/60 p-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">{passage}</p>
        </div>
      )}
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">{q.question || `Question ${qIdx + 1}`}</p>
          {q.type === 'mc' && Array.isArray(q.options) ? (
            <div className="space-y-1.5">
              {q.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() => setOne(qIdx, String(oIdx))}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    (answers[qIdx] || {}).answer === String(oIdx)
                      ? 'border-brand-300 bg-brand-50 font-bold text-brand-700'
                      : 'border-ink/10 bg-white text-ink/70 hover:bg-brand-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <TextInput draft={{ v: (answers[qIdx] || {}).answer || '' }} setDraft={(d) => setOne(qIdx, d.v)} field="v" multiline placeholder="Your answer…" />
          )}
        </div>
      ))}
    </div>
  );
}

const DRAFT_FIELD = {
  multiple_choice: 'selected_index',
  matching: 'pairs',
  fill_blank: 'answer',
  translation: 'answer',
  sentence_creation: 'sentence',
  short_answer: 'answer',
  ordering: 'order',
  reading_comprehension: 'answers',
};

function isDraftEmpty(type, draft) {
  const v = draft[DRAFT_FIELD[type]];
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export default function QuestionRenderer({ question, savedAnswer, onSubmit, submitting }) {
  const [draft, setDraftState] = useState(() => ({ ...(savedAnswer?.answer_data || {}) }));
  if (!question) return null;
  const setDraft = (patch) => setDraftState((prev) => ({ ...prev, ...patch }));
  const type = question.question_type;
  const empty = isDraftEmpty(type, draft);

  return (
    <div className="space-y-3">
      {type === 'matching' && <MatchingInput question={question} draft={draft} setDraft={setDraft} />}
      {type === 'multiple_choice' && <MultipleChoiceInput question={question} draft={draft} setDraft={setDraft} />}
      {type === 'fill_blank' && (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm text-ink/70">{question.question_data?.template || ''}</p>
          <TextInput draft={draft} setDraft={setDraft} field="answer" placeholder="Type the missing word…" />
        </div>
      )}
      {type === 'translation' && (
        <div className="space-y-2">
          <p className="text-sm text-ink/70">{question.question_data?.source_text || ''}</p>
          <TextInput draft={draft} setDraft={setDraft} field="answer" multiline placeholder="Type your translation…" />
        </div>
      )}
      {type === 'sentence_creation' && (
        <div className="space-y-2">
          {(question.question_data?.required_words || []).length > 0 && (
            <p className="text-xs text-ink/50">Use: {(question.question_data.required_words || []).join(', ')}</p>
          )}
          <TextInput draft={draft} setDraft={setDraft} field="sentence" multiline placeholder="Write your sentence…" />
        </div>
      )}
      {type === 'short_answer' && (
        <TextInput draft={draft} setDraft={setDraft} field="answer" multiline placeholder="Your answer…" />
      )}
      {type === 'ordering' && <OrderingInput question={question} draft={draft} setDraft={setDraft} />}
      {type === 'reading_comprehension' && <ReadingInput question={question} draft={draft} setDraft={setDraft} />}
      {!(type in DRAFT_FIELD) && (
        <p className="py-2 text-center text-sm text-ink/40">Unsupported question type: {type}</p>
      )}
      {type in DRAFT_FIELD && (
        <SubmitButton disabled={empty || submitting} submitting={submitting} onClick={() => onSubmit(question.id, draft)} />
      )}
      <ResultBanner savedAnswer={savedAnswer} explanation={question.explanation} />
    </div>
  );
}
