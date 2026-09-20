// dictionaryBridge.js - Dictionary V1 student flows + staff analytics.
// Thin wrappers over the server-authoritative SRS RPCs (migrations
// 0181-0185). Every state transition goes through schedule_review() on the
// server; nothing here computes SRS state client-side. The daily new-word
// limit is enforced inside start_words(); this layer never inserts into
// student_dictionary_words directly.

import { supabase } from '../../../lib/supabaseClient';

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

// Creates NEW rows for the chosen words (lesson vocabulary ids and/or
// general dictionary entry ids). Returns how many were actually created
// (server clamps to the remaining daily allowance; 0 means the limit is
// reached or everything was already started). Falls back to the
// pre-P0 single-argument form while the backend migration is rolling
// out (lesson words only; entries require the new backend).
export async function startWords(wordIds = [], entryIds = []) {
  try {
    return await rpc('start_dictionary_words', { p_word_ids: wordIds, p_entry_ids: entryIds });
  } catch (e) {
    if (entryIds.length) throw e;
    return rpc('start_dictionary_words', { p_word_ids: wordIds });
  }
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

// Words Known (Phase 4): caller's KNOWN-word count from the knowledge
// read model. Returns { known_count, mapped_count }.
export function getMyWordsKnown() {
  return rpc('get_my_words_known');
}

// Scoped action set (Phase 14): server-selected vocabulary rows in one
// knowledge state, shaped for Learn/Review. State validated server-side.
export function getActionScope(state) {
  return rpc('get_vocabulary_action_set', { p_state: state });
}

// Per-word knowledge states (Phase 3 read model). Server-computed;
// the client only counts/displays the returned labels.
export function getMyKnowledge() {
  return rpc('get_my_vocabulary_knowledge');
}

// Per-word evidence signals (Phase 2 read model) for the explainer UI.
export function getMyEvidence() {
  return rpc('get_my_vocabulary_evidence');
}

// Vocabulary Knowledge Ranking (Phase 5): academy-wide KNOWN-word
// counts. level: null = all levels. Rows carry ranks/names only.
export function getKnowledgeRanking(level = null) {
  return rpc('get_vocabulary_knowledge_ranking', { p_level: level });
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
// entries (search_dictionary_unified). Returns rows shaped
// { id, english, uzbek, pronunciation, part_of_speech, example,
// example_uzbek, source_type, lesson_number, audio_path, entry_id } -
// lesson_number/example_uzbek/entry_id are null for whichever source does
// not provide them. Results are server-ranked: exact, prefix, trigram,
// substring.
export function searchUnified(query, limit = 20) {
  return rpc('search_dictionary_unified', { p_query: query, p_limit: limit });
}

// ---------- Saved words (student_vocabulary_favorites, extended for
// general entries - same table, same RLS, no second favorites system) ----------

// Lesson-vocabulary favorites for one student: [{ vocabulary_id, ... }].
export async function listLessonFavorites(studentId) {
  const { data, error } = await supabase
    .from('student_vocabulary_favorites')
    .select('vocabulary_id')
    .eq('student_id', studentId)
    .not('vocabulary_id', 'is', null);
  if (error) throw error;
  return data || [];
}

// General-entry favorites for one student: [{ dictionary_entry_id, ... }].
export async function listEntryFavorites(studentId) {
  const { data, error } = await supabase
    .from('student_vocabulary_favorites')
    .select('dictionary_entry_id')
    .eq('student_id', studentId)
    .not('dictionary_entry_id', 'is', null);
  if (error) throw error;
  return data || [];
}

export async function addLessonFavorite(studentId, vocabularyId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .insert({ student_id: studentId, vocabulary_id: vocabularyId });
  if (error) throw error;
}

export async function addEntryFavorite(studentId, entryId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .insert({ student_id: studentId, dictionary_entry_id: entryId });
  if (error) throw error;
}

export async function removeLessonFavorite(studentId, vocabularyId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .delete()
    .eq('student_id', studentId)
    .eq('vocabulary_id', vocabularyId);
  if (error) throw error;
}

export async function removeEntryFavorite(studentId, entryId) {
  const { error } = await supabase
    .from('student_vocabulary_favorites')
    .delete()
    .eq('student_id', studentId)
    .eq('dictionary_entry_id', entryId);
  if (error) throw error;
}
