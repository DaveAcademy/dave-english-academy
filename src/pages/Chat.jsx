// Chat.jsx
// One page covers every messaging mode (direct, level broadcast, admin
// announcements, and context discussions tied to a lesson/homework/exam/
// certificate) rather than separate pages per mode - who can do what is
// enforced by RLS (see migration 0009, can_send_message/can_read_message),
// this page just reflects whatever the database allows for the signed-in
// role and renders the right compose controls for it.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Paperclip, Trash2, MessageSquare, Megaphone, Users, Mail } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { uploadAttachment, getAttachmentUrl } from '../lib/db';

const TABS = [
  { key: 'all', label: 'All', Icon: MessageSquare },
  { key: 'announcement', label: 'Announcements', Icon: Megaphone },
  { key: 'level', label: 'Level', Icon: Users },
  { key: 'direct', label: 'Direct', Icon: Mail },
];

export default function Chat() {
  const { profile, role } = useAuth();
  const {
    students, lessons, homework, exams, certificates,
    messages, messageReads, addMessage, removeMessage, markRead, error,
  } = useAcademy();
  const [searchParams] = useSearchParams();
  const contextType = searchParams.get('type');
  const contextId = searchParams.get('id') ? Number(searchParams.get('id')) : null;
  const isContextView = Boolean(contextType && contextId);

  const isAdmin = role === 'administrator';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const [tab, setTab] = useState('all');
  const [scope, setScope] = useState('direct');
  const [recipientId, setRecipientId] = useState('');
  const [level, setLevel] = useState('A');
  const [body, setBody] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [teacherProfiles, setTeacherProfiles] = useState([]);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .order('full_name')
      .then(({ data }) => setTeacherProfiles(data || []));
  }, []);

  const studentRecipients = useMemo(
    () =>
      students
        .filter((s) => s.profile_id)
        .map((s) => ({ id: s.profile_id, label: s.real_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [students]
  );

  const recipientOptions = useMemo(() => {
    if (scope !== 'direct') return [];
    if (isStudent) return teacherProfiles.map((t) => ({ id: t.id, label: `${t.full_name || t.email} (Teacher)` }));
    if (isTeacher) return studentRecipients.map((s) => ({ id: s.id, label: s.label }));
    if (isAdmin) {
      return [
        ...teacherProfiles.map((t) => ({ id: t.id, label: `${t.full_name || t.email} (Teacher)` })),
        ...studentRecipients.map((s) => ({ id: s.id, label: `${s.label} (Student)` })),
      ];
    }
    return [];
  }, [scope, isStudent, isTeacher, isAdmin, teacherProfiles, studentRecipients]);

  const scopeOptions = isAdmin
    ? ['direct', 'level', 'announcement']
    : isTeacher
    ? ['direct', 'level']
    : ['direct'];

  const contextLabel = useMemo(() => {
    if (!isContextView) return null;
    if (contextType === 'lesson') return lessons.find((l) => l.id === contextId)?.topic;
    if (contextType === 'homework') return homework.find((h) => h.id === contextId)?.title;
    if (contextType === 'exam') return exams.find((e) => e.id === contextId)?.title;
    if (contextType === 'certificate') return certificates.find((c) => c.id === contextId)?.title;
    return null;
  }, [isContextView, contextType, contextId, lessons, homework, exams, certificates]);

  const visible = useMemo(() => {
    let list = messages;
    if (isContextView) {
      list = list.filter((m) => m.scope === 'context' && m.context_type === contextType && m.context_id === contextId);
    } else {
      list = list.filter((m) => m.scope !== 'context');
      if (tab !== 'all') list = list.filter((m) => m.scope === tab);
    }
    return [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages, isContextView, contextType, contextId, tab]);

  const readIds = useMemo(
    () => new Set(messageReads.filter((r) => r.profile_id === profile.id).map((r) => r.message_id)),
    [messageReads, profile.id]
  );

  // Opening a view marks everything currently shown in it as read - a
  // simple "read the thread, it's read" model rather than per-message
  // read toggles.
  useEffect(() => {
    visible.forEach((m) => {
      if (!readIds.has(m.id)) markRead(m.id, profile.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSend = useCallback(
    async (e) => {
      e.preventDefault();
      if (!body.trim() && !file) return;
      setSending(true);
      try {
        let attachment = {};
        if (file) {
          const uploaded = await uploadAttachment(file, 'chat');
          attachment = { attachment_url: uploaded.path, attachment_name: uploaded.name, attachment_type: uploaded.type };
        }
        const payload = {
          sender_id: profile.id,
          sender_name: profile.full_name || profile.email,
          scope: isContextView ? 'context' : scope,
          body: body.trim() || null,
          ...attachment,
        };
        if (isContextView) {
          payload.context_type = contextType;
          payload.context_id = contextId;
        } else if (scope === 'direct') {
          if (!recipientId) return;
          payload.recipient_id = recipientId;
        } else if (scope === 'level') {
          payload.level = level;
        }
        await addMessage(payload);
        setBody('');
        setFile(null);
      } finally {
        setSending(false);
      }
    },
    [body, file, profile, scope, isContextView, contextType, contextId, recipientId, level, addMessage]
  );

  const handleOpenAttachment = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const scopeLabel = (m) => {
    if (m.scope === 'announcement') return 'Announcement';
    if (m.scope === 'level') return `Level ${m.level}`;
    if (m.scope === 'context') return `${m.context_type[0].toUpperCase()}${m.context_type.slice(1)} discussion`;
    return 'Direct';
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">
          {isContextView ? `Discussion: ${contextLabel || '...'}` : 'Messages'}
        </h1>
        <p className="mt-1 text-sm text-ink/50">
          {isContextView
            ? 'Everyone with access to this item can see this thread.'
            : 'Announcements, level updates, and direct messages.'}
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      {!isContextView && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === t.key ? 'bg-brand-500 text-white' : 'bg-white text-ink/60 shadow-sm'
              }`}
            >
              <t.Icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="mb-4 space-y-2 rounded-xl bg-white p-4 shadow-card">
        {!isContextView && (
          <div className="flex flex-wrap gap-2">
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setRecipientId('');
              }}
              className="input w-auto"
            >
              {scopeOptions.map((s) => (
                <option key={s} value={s}>
                  {s === 'direct' ? 'Direct message' : s === 'level' ? 'Level broadcast' : 'Announcement (everyone)'}
                </option>
              ))}
            </select>
            {scope === 'direct' && (
              <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required className="input w-auto flex-1">
                <option value="">Select recipient...</option>
                {recipientOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
            {scope === 'level' && (
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-auto">
                <option value="A">Level A</option>
                <option value="B">Level B</option>
                <option value="C">Level C</option>
              </select>
            )}
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Write a message..."
          className="input resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink">
            <Paperclip size={14} />
            {file ? file.name : 'Attach image or PDF'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <button
            type="submit"
            disabled={sending || (!body.trim() && !file) || (!isContextView && scope === 'direct' && !recipientId)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            <Send size={15} /> {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>

      {visible.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-ink">No messages yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => {
            const mine = m.sender_id === profile.id;
            return (
              <div key={m.id} className={`rounded-xl p-3 shadow-card ${mine ? 'bg-brand-50' : 'bg-white'}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-ink/50">
                    <span className="font-semibold text-ink">{m.sender_name || 'Unknown'}</span>
                    <span>·</span>
                    <span>{scopeLabel(m)}</span>
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => removeMessage(m.id)}
                      className="rounded-md p-1 text-inactive hover:bg-inactive/10"
                      aria-label="Delete message"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {m.body && <p className="whitespace-pre-wrap text-sm text-ink/80">{m.body}</p>}
                {m.attachment_url && (
                  <button
                    onClick={() => handleOpenAttachment(m.attachment_url)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
                  >
                    <Paperclip size={13} /> {m.attachment_name || 'Attachment'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
