// useGameRecord.js
// Fetches the batched leaderboard (get_game_best_records, 0147) once and
// derives the caller-relevant slice for a single game_type: the current
// #1 (record holder), the caller's own best, their rank, and how far
// they are from #1. One call per mount - the RPC already returns all 9
// games in one round trip, so a page that needs more than one game_type
// (none currently do) would still only fetch once by reusing this same
// shape rather than calling per game_type.
import { useState, useEffect } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { getGameBestRecords } from '../lib/storageBridge';
import { formatStudentDisplayName } from '../lib/gameRecordFormat';

export default function useGameRecord(gameType, enabled = true) {
  const { me } = useAcademy();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameType || !me || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getGameBestRecords()
      .then((rows) => {
        if (cancelled) return;
        const gameRows = rows.filter((r) => r.game_type === gameType);
        const holderRow = gameRows.find((r) => r.rank === 1) ?? null;
        const myRow = gameRows.find((r) => r.student_id === me.id) ?? null;
        const isRecordHolder = !!(holderRow && myRow && holderRow.student_id === myRow.student_id);
        setRecord({
          holder: holderRow
            ? { name: formatStudentDisplayName(holderRow.real_name, holderRow.english_name), score: Number(holderRow.best_score) }
            : null,
          myBest: myRow ? Number(myRow.best_score) : null,
          myRank: myRow ? myRow.rank : null,
          isRecordHolder,
          gap: holderRow && myRow && !isRecordHolder ? Number(holderRow.best_score) - Number(myRow.best_score) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gameType, me, enabled]);

  return { record, loading };
}
