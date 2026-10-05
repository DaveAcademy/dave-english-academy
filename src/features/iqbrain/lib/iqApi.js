// iqApi.js - isolated client for the IQ & Brain system.
// All writes go through SECURITY DEFINER RPCs; the client never sends
// scores, correctness, difficulty, status or student IDs. No answer key is
// ever fetched: questions arrive keyless from get_iq_attempt.
// This feature imports only from src/lib and its own folder.
import { supabase } from '../../../lib/supabaseClient';

export async function listIqChallenges() {
  const { data, error } = await supabase
    .from('iq_challenges')
    .select('id, slug, kind, title, description, question_count, time_limit_sec, difficulty_min, difficulty_max, is_published')
    .eq('is_published', true)
    .order('slug');
  if (error) throw error;
  return data || [];
}

export async function startIqAttempt(challengeId) {
  const { data, error } = await supabase.rpc('start_iq_attempt', { p_challenge_id: challengeId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function getIqAttempt(attemptId) {
  const { data, error } = await supabase.rpc('get_iq_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}

export async function saveIqAnswer(attemptId, questionId, answer) {
  const { error } = await supabase.rpc('save_iq_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_answer: answer,
  });
  if (error) throw error;
  return true;
}

export async function submitIqAttempt(attemptId) {
  const { data, error } = await supabase.rpc('submit_iq_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}

export async function listMyIqAttempts(challengeId) {
  const { data, error } = await supabase.rpc('list_my_iq_attempts', { p_challenge_id: challengeId });
  if (error) throw error;
  return data || [];
}
