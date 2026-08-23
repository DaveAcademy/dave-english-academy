// dictionaryBridge.js - Dictionary V1 student flows + staff analytics.
// Thin wrappers over the server-authoritative SRS RPCs (migrations
// 0181-0185). Every state transition goes through schedule_review() on the
// server; nothing here computes SRS state client-side. The daily new-word
// limit is enforced inside start_words(); this layer never inserts into
// student_dictionary_words directly.

import { supabase } from './supabaseClient';

export const DAILY_LIMIT = 10;

// Quality scale used across the Dictionary UI (matches
// srs_calculate_interval): 0=wrong, 1=hard/wrong-ish, 2=correct, 3=easy.
export const QUALITY = { WRONG: 0, HARD: 1, CORRECT: 2, EASY: 3 };

async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

// Words the student may add today (curriculum candidates they can access,
// minus ones already started). Returns [] when the daily limit is reached.
export function getNextWords(studentId, limit = DAILY_LIMIT) {
  return rpc('get_next_dictionary_words', { p_student_id: studentId, p_limit: limit });
}

// Creates NEW rows for the chosen words. Returns how many were actually
// created (server clamps to the remaining daily allowance).
export function startWords(wordIds) {
  return rpc('start_dictionary_words', { p_word_ids: wordIds });
}

// Words currently due for review (first exposure included).
export function getDueReviews(studentId, limit = 20) {
  return rpc('get_due_dictionary_reviews', { p_student_id: studentId, p_limit: limit });
}

// Applies one review result. Parameter name is p_word_id per migration
// 0184 (the production definition), not 0181's longer name.
export function scheduleReview(wordRowId, quality) {
  return rpc('schedule_dictionary_review', { p_word_id: wordRowId, p_quality: quality });
}

// Caller's own progress summary for the Progress tab.
export function getMySummary() {
  return rpc('get_my_dictionary_summary');
}

// Academy-wide ranking by mastered count. level: null = all levels.
export function getLeaderboard(level = null) {
  return rpc('get_dictionary_leaderboard', { p_level: level });
}

// Staff-only per-student aggregates.
export function getAdminOverview() {
  return rpc('get_dictionary_admin_overview');
}

// Staff/student drill-down for one student's word rows.
export function getStudentDetail(studentId) {
  return rpc('get_dictionary_student_detail', { p_student_id: studentId });
}

// Unified search across curriculum lesson vocabulary and general dictionary
// entries (search_dictionary_unified, migration 0183). Returns rows shaped
// { id, english, uzbek, pronunciation, part_of_speech, example, source_type,
// lesson_number } - lesson_number is null for general entries.
export function searchUnified(query, limit = 20) {
  return rpc('search_dictionary_unified', { p_query: query, p_limit: limit });
}
