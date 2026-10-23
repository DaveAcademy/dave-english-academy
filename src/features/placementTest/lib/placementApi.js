// placementApi.js - isolated client for the CEFR Placement Test.
// All writes go through SECURITY DEFINER RPCs; the client never sends
// scores, correctness, or student IDs, and never receives answer keys
// while an attempt is in progress. No imports from exams/homework/games.
import { supabase } from '../../../lib/supabaseClient';

// Resume the active attempt or start a new one (server decides; the
// advisory lock makes racing double-taps safe).
export async function startPlacementAttempt() {
  const { data, error } = await supabase.rpc('start_placement_attempt');
  if (error) throw error;
  return data;
}

// Adaptive engine entry point: returns the next phase/question/prompts.
export async function getNextPlacementQuestion(attemptId) {
  const { data, error } = await supabase.rpc('get_next_placement_question', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}

// Record one answer (or a skip). Correctness is computed server-side and
// never returned - there is no correctness oracle to probe.
export async function savePlacementAnswer(attemptId, questionId, answer, skipped = false) {
  const { error } = await supabase.rpc('save_placement_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_answer: answer,
    p_skipped: skipped,
  });
  if (error) throw error;
  return true;
}

// Finalize the attempt (idempotent) and receive the computed result.
export async function submitPlacementAttempt(attemptId) {
  const { data, error } = await supabase.rpc('submit_placement_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}

// Full attempt payload - owner (keyless questions) or scoped staff
// (adds keys/explanations after submit, plus the review row).
export async function getPlacementAttempt(attemptId) {
  const { data, error } = await supabase.rpc('get_placement_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
  return data;
}

export async function listMyPlacementAttempts() {
  const { data, error } = await supabase.rpc('list_my_placement_attempts');
  if (error) throw error;
  return data || [];
}

// Teacher/admin: confirm or adjust the recommended level with a recorded
// reason. Rubric scores are validated server-side.
export async function submitPlacementReview(payload) {
  const { data, error } = await supabase.rpc('submit_placement_review', {
    p_attempt_id: payload.attemptId,
    p_final_level: payload.finalLevel,
    p_reason: payload.reason,
    p_writing_scores: payload.writingScores ?? null,
    p_speaking_scores: payload.speakingScores ?? null,
    p_speaking_conducted: payload.speakingConducted ?? false,
  });
  if (error) throw error;
  return data;
}

// Staff listing: RLS scopes rows (admins see all; teachers only students
// whose group level they are assigned). Student fields come from the FK
// embed; a null student means the embed was filtered out by RLS.
export async function listPlacementAttemptsForStaff() {
  const { data, error } = await supabase
    .from('placement_attempts')
    .select(
      'id, student_id, status, started_at, submitted_at, estimated_level, ' +
        'confidence, review_status, final_level, result, students(real_name, english_name, level)'
    )
    .order('started_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}
