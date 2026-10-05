// useIqAttempt.js - one active attempt, its keyless questions, the local
// answer draft, and fire-and-forget auto-save. Scores/correctness never enter
// this hook: only the server's graded payload after submit.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getIqAttempt, saveIqAnswer, submitIqAttempt } from '../lib/iqApi';

export default function useIqAttempt(attemptId) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | failed
  const chainRef = useRef(Promise.resolve());
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getIqAttempt(attemptId);
      if (!activeRef.current) return;
      setPayload(data);
      const initial = {};
      const answers = (data && typeof data.answers === 'object' && data.answers) || {};
      Object.keys(answers).forEach((qid) => {
        const entry = answers[qid];
        if (entry && typeof entry.answer === 'object' && entry.answer !== null) {
          initial[qid] = entry.answer;
        }
      });
      setDraft(initial);
    } catch (e) {
      if (activeRef.current) setError(e?.message || 'loadFailed');
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => { activeRef.current = false; };
  }, [load]);

  // Serialised writes: every save_iq_answer lands in submission order and a
  // slow response can never overwrite a newer local answer.
  const setAnswer = useCallback((questionId, answer) => {
    setDraft((prev) => ({ ...prev, [questionId]: answer }));
    if (!attemptId) return;
    setSaveState('saving');
    chainRef.current = chainRef.current
      .then(() => saveIqAnswer(attemptId, questionId, answer))
      .then(() => { if (activeRef.current) setSaveState('saved'); })
      .catch(() => { if (activeRef.current) setSaveState('failed'); });
  }, [attemptId]);

  const flush = useCallback(() => chainRef.current, []);

  const submit = useCallback(async () => {
    await flush();
    setError(null);
    try {
      const result = await submitIqAttempt(attemptId);
      const fresh = await getIqAttempt(attemptId);
      if (activeRef.current) {
        setPayload(fresh);
        setDraft({});
      }
      return result;
    } catch (e) {
      if (activeRef.current) setError(e?.message || 'submitFailed');
      throw e;
    }
  }, [attemptId, flush]);

  return {
    payload,
    loading,
    error,
    draft,
    saveState,
    reload: load,
    setAnswer,
    submit,
  };
}
