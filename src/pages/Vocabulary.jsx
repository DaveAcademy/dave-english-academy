// Vocabulary.jsx
// Teacher/admin manager for lesson vocabulary (Vocabulary Learning System,
// Phase 1 - see migration 0048). Pick a lesson, then add/edit/delete/reorder
// its words. No flashcards or quizzes here - that's Phase 2.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Pencil, Trash2, ImagePlus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { LevelBadge } from '../components/Badge';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';
import {
  listLessonVocabulary,
  createVocabularyItem,
  updateVocabularyItem,
  deleteVocabularyItem,
  reorderLessonVocabulary,
} from '../lib/storageBridge';

const EMPTY_FORM = { english: '', uzbek: '', example: '', pronunciation: '' };

export default function Vocabulary() {
  const { lessons } = useAcademy();
  const sortedLessons = useMemo(() => [...lessons].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [lessons]);
  const [lessonId, setLessonId] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeLessonId = lessonId ?? sortedLessons[0]?.id ?? null;
  const activeLesson = sortedLessons.find((l) => l.id === activeLessonId) || null;

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
  }, [activeLessonId, refresh]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setRemoveImage(false);
    setFormOpen(false);
    setEditingId(null);
  };

  const startEdit = (word) => {
    setEditingId(word.id);
    setForm({
      english: word.english,
      uzbek: word.uzbek,
      example: word.example || '',
      pronunciation: word.pronunciation || '',
    });
    setFile(null);
    setRemoveImage(false);
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.english.trim() || !form.uzbek.trim() || !activeLessonId) return;
    setSaving(true);
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
        if (file) {
          const uploaded = await uploadAttachment(file, `vocabulary-images/${activeLessonId}`);
          payload = { ...payload, image_path: uploaded.path, image_name: uploaded.name };
        } else if (removeImage) {
          payload = { ...payload, image_path: null, image_name: null };
        }
        await updateVocabularyItem(editingId, payload);
      } else {
        const record = await createVocabularyItem({
          ...basePayload,
          lesson_id: activeLessonId,
          display_order: words.length,
        });
        if (file) {
          const uploaded = await uploadAttachment(file, `vocabulary-images/${activeLessonId}`);
          await updateVocabularyItem(record.id, { image_path: uploaded.path, image_name: uploaded.name });
        }
      }
      resetForm();
      await refresh(activeLessonId);
    } catch {
      setError('Could not save this word. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteVocabularyItem(id);
      if (editingId === id) resetForm();
      await refresh(activeLessonId);
    } catch {
      setError('Could not delete this word.');
    }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= words.length) return;
    const reordered = [...words];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setWords(reordered);
    await reorderLessonVocabulary(
      activeLessonId,
      reordered.map((w) => w.id)
    );
  };

  const handleViewImage = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Vocabulary</h1>
        <p className="mt-1 text-sm text-ink/50">Manage each lesson's word list.</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-card">
        <label className="text-xs font-semibold text-ink/50">Lesson</label>
        <select
          value={activeLessonId || ''}
          onChange={(e) => {
            setLessonId(Number(e.target.value));
            resetForm();
          }}
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
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => (formOpen ? resetForm() : setFormOpen(true))}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus size={16} /> Add word
            </button>
          </div>

          {formOpen && (
            <form onSubmit={handleSubmit} className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-card sm:grid-cols-2">
              <input
                required
                placeholder="English"
                value={form.english}
                onChange={(e) => setForm({ ...form, english: e.target.value })}
                className="input"
              />
              <input
                required
                placeholder="Uzbek"
                value={form.uzbek}
                onChange={(e) => setForm({ ...form, uzbek: e.target.value })}
                className="input"
              />
              <input
                placeholder="Example sentence (optional)"
                value={form.example}
                onChange={(e) => setForm({ ...form, example: e.target.value })}
                className="input sm:col-span-2"
              />
              <input
                placeholder="Pronunciation (optional)"
                value={form.pronunciation}
                onChange={(e) => setForm({ ...form, pronunciation: e.target.value })}
                className="input sm:col-span-2"
              />

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink">
                  <ImagePlus size={14} />
                  {file ? file.name : 'Attach image (optional)'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] || null;
                      setFile(picked);
                      if (picked) setRemoveImage(false);
                    }}
                  />
                </label>
                {editingId && words.find((w) => w.id === editingId)?.image_path && !file && !removeImage && (
                  <button
                    type="button"
                    onClick={() => setRemoveImage(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-inactive hover:underline"
                  >
                    <X size={13} /> Remove image
                  </button>
                )}
              </div>

              <div className="flex gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add word'}
                </button>
                <button type="button" onClick={resetForm} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/60">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="p-6 text-center text-sm text-ink/40">Loading...</p>
          ) : words.length === 0 ? (
            <div className="rounded-xl bg-white p-10 text-center shadow-card">
              <p className="font-display text-lg font-semibold text-ink">No vocabulary yet for this lesson.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {words.map((w, i) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-card">
                  <div className="flex flex-shrink-0 flex-col">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-ink/30 hover:text-ink disabled:opacity-20">
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === words.length - 1}
                      className="rounded p-0.5 text-ink/30 hover:text-ink disabled:opacity-20"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {w.english} <span className="font-normal text-ink/50">— {w.uzbek}</span>
                    </p>
                    {w.example && <p className="mt-0.5 truncate text-xs italic text-ink/50">{w.example}</p>}
                  </div>
                  {w.image_path && (
                    <button
                      onClick={() => handleViewImage(w.image_path)}
                      className="flex-shrink-0 rounded-md p-1.5 text-ink/40 hover:bg-ink/5"
                      aria-label="View image"
                      title="View image"
                    >
                      <ImagePlus size={15} />
                    </button>
                  )}
                  <button onClick={() => startEdit(w)} className="flex-shrink-0 rounded-md p-1.5 text-ink/40 hover:bg-ink/5" aria-label="Edit word">
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="flex-shrink-0 rounded-md p-1.5 text-inactive hover:bg-inactive/10"
                    aria-label="Delete word"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
