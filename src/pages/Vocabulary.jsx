// Vocabulary.jsx
// Teacher/admin manager for lesson vocabulary (Vocabulary Learning System -
// see migration 0048). Redesigned around bulk paste-and-import as the
// primary workflow ("teachers should spend seconds adding vocabulary, not
// minutes") - single-word add/edit is a small popup for the exception
// case, not the main form. No flashcards or quizzes here - that's Phase 2.
//
// Favorite counts are intentionally not shown here: student_vocabulary_
// favorites RLS only grants admin/self-student read (see migration 0048),
// so a teacher session can't read them without a new policy - out of
// scope for this UX pass since the spec marks the column optional.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, Plus, Pencil, Trash2, X, Search, ImagePlus, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';
import {
  listLessonVocabulary,
  bulkCreateVocabularyItems,
  createVocabularyItem,
  updateVocabularyItem,
  deleteVocabularyItem,
} from '../lib/storageBridge';
import { parseVocabularyBulkImport } from '../utils/vocabularyImport';

const EMPTY_WORD_FORM = { english: '', uzbek: '', example: '', pronunciation: '' };

export default function Vocabulary() {
  const { lessons } = useAcademy();
  const sortedLessons = useMemo(() => [...lessons].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [lessons]);
  const [lessonId, setLessonId] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const activeLessonId = lessonId ?? sortedLessons[0]?.id ?? null;
  const activeLesson = sortedLessons.find((l) => l.id === activeLessonId) || null;

  // ---------- bulk import ----------
  const [bulkText, setBulkText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ---------- single-word popup (add or edit) ----------
  const [wordModal, setWordModal] = useState(null); // null | { mode: 'create' | 'edit', form, editingId, file, removeImage }

  const refresh = useCallback(async (id) => {
    if (!id) {
      setWords([]);
      return;
    }
    setLoading(true);
    try {
      setWords(await listLessonVocabulary(id));
    } catch {
      setError('Could not load vocabulary for this lesson.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(activeLessonId);
    setImportResult(null);
    setBulkText('');
    setSearch('');
  }, [activeLessonId, refresh]);

  const handleImport = async () => {
    if (!bulkText.trim() || !activeLessonId) return;
    const { valid, invalidLines, duplicateCount } = parseVocabularyBulkImport(
      bulkText,
      words.map((w) => w.english)
    );
    setImporting(true);
    setError('');
    try {
      if (valid.length > 0) {
        await bulkCreateVocabularyItems(activeLessonId, valid, words.length);
      }
      setImportResult({ imported: valid.length, duplicateCount, invalidLines });
      setBulkText('');
      await refresh(activeLessonId);
    } catch {
      setError('Could not import vocabulary. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // ---------- single-word popup ----------

  const openCreateModal = () => setWordModal({ mode: 'create', form: EMPTY_WORD_FORM, editingId: null, file: null, removeImage: false });

  const openEditModal = (word) =>
    setWordModal({
      mode: 'edit',
      form: { english: word.english, uzbek: word.uzbek, example: word.example || '', pronunciation: word.pronunciation || '' },
      editingId: word.id,
      file: null,
      removeImage: false,
    });

  const closeModal = () => setWordModal(null);

  const [savingWord, setSavingWord] = useState(false);

  const handleSaveWord = async (e) => {
    e.preventDefault();
    const { form, editingId } = wordModal;
    if (!form.english.trim() || !form.uzbek.trim() || !activeLessonId) return;
    setSavingWord(true);
    setError('');
    try {
      const basePayload = {
        english: form.english.trim(),
        uzbek: form.uzbek.trim(),
        example: form.example.trim() || null,
        pronunciation: form.pronunciation.trim() || null,
      };

      if (editingId) {
        let payload = basePayload;
        if (wordModal.file) {
          const uploaded = await uploadAttachment(wordModal.file, `vocabulary-images/${activeLessonId}`);
          payload = { ...payload, image_path: uploaded.path, image_name: uploaded.name };
        } else if (wordModal.removeImage) {
          payload = { ...payload, image_path: null, image_name: null };
        }
        await updateVocabularyItem(editingId, payload);
      } else {
        const record = await createVocabularyItem({ ...basePayload, lesson_id: activeLessonId, display_order: words.length });
        if (wordModal.file) {
          const uploaded = await uploadAttachment(wordModal.file, `vocabulary-images/${activeLessonId}`);
          await updateVocabularyItem(record.id, { image_path: uploaded.path, image_name: uploaded.name });
        }
      }
      closeModal();
      await refresh(activeLessonId);
    } catch {
      setError('Could not save this word. Please try again.');
    } finally {
      setSavingWord(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteVocabularyItem(id);
      await refresh(activeLessonId);
    } catch {
      setError('Could not delete this word.');
    }
  };

  const handleViewImage = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const visibleWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return words;
    return words.filter((w) => w.english.toLowerCase().includes(q) || w.uzbek.toLowerCase().includes(q));
  }, [words, search]);

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Vocabulary</h1>
        <p className="mt-1 text-sm text-ink/50">Paste a word list to import it in one go.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-card">
        <label className="text-xs font-semibold text-ink/50">Lesson</label>
        <select
          value={activeLessonId || ''}
          onChange={(e) => setLessonId(Number(e.target.value))}
          className="input max-w-xs"
        >
          {sortedLessons.length === 0 && <option value="">No lessons yet</option>}
          {sortedLessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.topic}
            </option>
          ))}
        </select>
        {activeLesson?.level && <LevelBadge level={activeLesson.level} />}
      </div>

      {!activeLessonId ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">Create a lesson first.</p>
        </div>
      ) : (
        <>
          {/* Primary workflow: bulk import */}
          <div className="mb-4 rounded-xl bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center gap-2">
              <Upload size={16} className="text-brand-500" />
              <h2 className="font-display text-sm font-bold text-ink">Bulk Import Vocabulary</h2>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={'apple - olma\nbanana - banan\norange - apelsin\n\nAlso accepts apple | olma, apple: olma, apple = olma, apple — olma'}
              className="input w-full resize-y font-mono text-sm"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-ink/40">One word per line. Blank lines are ignored, duplicates are skipped automatically.</p>
              <button
                onClick={handleImport}
                disabled={importing || !bulkText.trim()}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                <Upload size={15} /> {importing ? 'Importing...' : 'Import Vocabulary'}
              </button>
            </div>

            {importResult && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-paper p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-active">
                  <CheckCircle2 size={15} /> {importResult.imported} word{importResult.imported === 1 ? '' : 's'} imported
                </p>
                {importResult.duplicateCount > 0 && (
                  <p className="flex items-center gap-1.5 text-amber-600">
                    <AlertTriangle size={15} /> {importResult.duplicateCount} duplicate{importResult.duplicateCount === 1 ? '' : 's'} skipped
                  </p>
                )}
                {importResult.invalidLines.length > 0 && (
                  <div>
                    <p className="flex items-center gap-1.5 text-inactive">
                      <XCircle size={15} /> {importResult.invalidLines.length} invalid line{importResult.invalidLines.length === 1 ? '' : 's'}
                    </p>
                    <ul className="mt-1 space-y-0.5 pl-6 font-mono text-xs text-inactive/80">
                      {importResult.invalidLines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vocabulary list */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this lesson's words..." className="input pl-9" />
            </div>
            <button
              onClick={openCreateModal}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold text-ink/60 hover:bg-ink/5"
            >
              <Plus size={14} /> Add one word
            </button>
          </div>

          {loading ? (
            <p className="p-6 text-center text-sm text-ink/40">Loading...</p>
          ) : visibleWords.length === 0 ? (
            <div className="rounded-xl bg-white p-10 text-center shadow-card">
              <p className="font-display text-lg font-semibold text-ink">{words.length === 0 ? 'No vocabulary yet for this lesson.' : 'No words match your search.'}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-2">English</th>
                    <th className="px-4 py-2">Translation</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWords.map((w) => (
                    <tr key={w.id} className="border-b border-ink/5 last:border-0 hover:bg-paper">
                      <td className="px-4 py-2.5 font-semibold text-ink">{w.english}</td>
                      <td className="px-4 py-2.5 text-ink/70">{w.uzbek}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {w.image_path && (
                            <button onClick={() => handleViewImage(w.image_path)} className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5" title="View image">
                              <ImagePlus size={14} />
                            </button>
                          )}
                          <button onClick={() => openEditModal(w)} className="rounded-md p-1.5 text-ink/40 hover:bg-ink/5" aria-label="Edit word">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(w.id)} className="rounded-md p-1.5 text-inactive hover:bg-inactive/10" aria-label="Delete word">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {wordModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4" onClick={closeModal}>
          <form
            onSubmit={handleSaveWord}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">{wordModal.mode === 'edit' ? 'Edit word' : 'Add word'}</h3>
              <button type="button" onClick={closeModal} className="rounded-md p-1 text-ink/40 hover:bg-ink/5">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                required
                autoFocus
                placeholder="English"
                value={wordModal.form.english}
                onChange={(e) => setWordModal({ ...wordModal, form: { ...wordModal.form, english: e.target.value } })}
                className="input w-full"
              />
              <input
                required
                placeholder="Uzbek"
                value={wordModal.form.uzbek}
                onChange={(e) => setWordModal({ ...wordModal, form: { ...wordModal.form, uzbek: e.target.value } })}
                className="input w-full"
              />
              <input
                placeholder="Example sentence (optional)"
                value={wordModal.form.example}
                onChange={(e) => setWordModal({ ...wordModal, form: { ...wordModal.form, example: e.target.value } })}
                className="input w-full"
              />
              <input
                placeholder="Pronunciation (optional)"
                value={wordModal.form.pronunciation}
                onChange={(e) => setWordModal({ ...wordModal, form: { ...wordModal.form, pronunciation: e.target.value } })}
                className="input w-full"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink">
                <ImagePlus size={14} />
                {wordModal.file ? wordModal.file.name : 'Attach image (optional)'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setWordModal({ ...wordModal, file: e.target.files?.[0] || null, removeImage: false })}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={savingWord}
                className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {savingWord ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={closeModal} className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/60">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
