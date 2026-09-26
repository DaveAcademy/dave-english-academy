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

// ---- Admin Analytics (is_admin() required) ----

// Test-level overview statistics for all published tests.
export async function getAdminOnlineTestOverview() {
  const { data, error } = await supabase.rpc('get_admin_online_test_overview');
  if (error) throw error;
  return data || [];
}

// Student-level performance detail for Admin.
export async function getAdminOnlineTestStudentResults() {
  const { data, error } = await supabase.rpc('get_admin_online_test_student_results');
  if (error) throw error;
  return data || [];
}

// Admin-only Online Test Performance Ranking (isolated system).
export async function getAdminOnlineTestRanking() {
  const { data, error } = await supabase.rpc('get_admin_online_test_ranking');
  if (error) throw error;
  return data || [];
}

// Test detail: stage performance breakdown for a specific test.
export async function getAdminOnlineTestDetail(testId) {
  const { data, error } = await supabase.rpc('get_admin_online_test_detail', { p_test_id: testId });
  if (error) throw error;
  return data ? data[0] : null;
}

// Student detail for a specific student's online test performance.
export async function getAdminStudentOnlineTestDetail(studentId) {
  const { data, error } = await supabase.rpc('get_admin_student_online_test_detail', { p_student_id: studentId });
  if (error) throw error;
  return data || [];
}
