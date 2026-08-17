// useGameRecord.js
// Fetches the batched leaderboard (get_game_best_records, 0147/0148) once
// and derives the caller-relevant slice for a single game_type: the top 5
// ranked students, the caller's own best/rank, and their "next target" -
// the closest student with a strictly higher score, so the framing is
// "beat the person one place above you" rather than "beat the champion"
// (Dave's explicit design call, 2026-08-17). One call per mount - the RPC
// already returns all 9 games in one round trip.
//
// Ties: get_game_best_records() already returns rank() with shared ranks
// (matches every existing ranking RPC's convention) in game_type, rank,
// achieved_at order. isRecordHolder is true for every student sharing
// rank 1, not just whichever tied row happens to sort first. nextTarget
// skips over rows tied at the caller's own score (walks back to the
// nearest STRICTLY higher score) so two students on the same score never
// get told to "beat" each other.
import { useState, useEffect } from 'react';
import { useAcademy } from '../lib/AcademyDataContext';
import { getGameBestRecords } from '../lib/storageBridge';
import { formatStudentDisplayName } from '../lib/gameRecordFormat';

const TOP_N = 5;

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
        const gameRows = rows
          .filter((r) => r.game_type === gameType)
          .map((r) => ({
            studentId: r.student_id,
            rank: r.rank,
            name: formatStudentDisplayName(r.real_name, r.english_name),
            score: Number(r.best_score),
            isMe: r.student_id === me.id,
          }));

        const myIndex = gameRows.findIndex((r) => r.isMe);
        const myRow = myIndex >= 0 ? gameRows[myIndex] : null;

        let nextTarget = null;
        if (myRow) {
          let i = myIndex - 1;
          while (i >= 0 && gameRows[i].score === myRow.score) i--;
          if (i >= 0) nextTarget = gameRows[i];
        }

        setRecord({
          top: gameRows.slice(0, TOP_N),
          myBest: myRow ? myRow.score : null,
          myRank: myRow ? myRow.rank : null,
          isRecordHolder: myRow ? myRow.rank === 1 : false,
          nextTarget: nextTarget ? { name: nextTarget.name, score: nextTarget.score, rank: nextTarget.rank, gap: nextTarget.score - myRow.score } : null,
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
