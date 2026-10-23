// useGameStreak.js
// Tiny client-side-only streak tracker shared by the 5 new games. No
// server concept of "streak" exists (by design - see task brief), so
// this is purely session-local UX: current consecutive-correct count
// and the best streak seen this round, reset on demand. Never sent to
// the server and never trusted for scoring.
import { useState, useCallback } from 'react';

export default function useGameStreak() {
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const recordCorrect = useCallback(() => {
    setStreak((s) => {
      const next = s + 1;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });
  }, []);

  const recordIncorrect = useCallback(() => {
    setStreak(0);
  }, []);

  const reset = useCallback(() => {
    setStreak(0);
    setBestStreak(0);
  }, []);

  return { streak, bestStreak, recordCorrect, recordIncorrect, reset };
}
