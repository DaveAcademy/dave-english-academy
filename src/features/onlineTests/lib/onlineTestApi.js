// onlineTestApi.js — isolated client for the Online English Test system.
// All writes go through SECURITY DEFINER RPCs; the client never sends
// scores, correctness, or student IDs. No imports from homework/exams.
import { supabase } from '../../../lib/supabaseClient';

export async function listOnlineTests() {
  const { data, error } = await supabase
    .from('online_tests')
    .select('id, test_number, title, lesson_from, lesson_to, is_published')
    .eq('is_published', true)
    .order('test_number');
  if (error) throw error;
  return data || [];
}

export async function startOnlineTestAttempt(testId) {
  const { data, error } = await supabase.rpc('start_online_test_attempt', { p_test_id: testId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function getOnlineTestAttempt(attemptId) {
  const { data, error } = await supabase.rpc('get_online_test_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}

export async function saveOnlineTestAnswer(attemptId, itemId, answer) {
  const { error } = await supabase.rpc('save_online_test_answer', {
    p_attempt_id: attemptId,
    p_item_id: itemId,
    p_answer: answer,
  });
  if (error) throw error;
  return true;
}

export async function submitOnlineTestAttempt(attemptId) {
  const { data, error } = await supabase.rpc('submit_online_test_attempt', { p_attempt_id: attemptId });
  if (error) throw error;
  return data;
}

export async function listMyOnlineTestAttempts(testId) {
  const { data, error } = await supabase.rpc('list_my_online_test_attempts', { p_test_id: testId });
  if (error) throw error;
  return data || [];
}

// Derived leaderboard over submitted attempts. Read-only; the server
// computes rank/average/best from stored graded results. No arguments,
// no client-provided scores.
export async function getOnlineExamRanking() {
  const { data, error } = await supabase.rpc('get_online_exam_ranking');
  if (error) throw error;
  return data || [];
}
