// Chat.jsx
// Inbox-style UI over the existing messaging architecture - nothing here
// changes what a role can read/send (still enforced server-side, see
// migrations 0009/0044/0045: can_send_message/can_read_message), just how
// it's presented. "Conversations" are a client-side grouping of the flat
// messages table (by direct counterpart, by level, or the single
// announcement stream) - there is no conversations table.
//
// Context discussions (tied to a lesson/homework/exam/certificate, opened
// via ?type=&id= from other pages) keep their own single-thread view
// below, unchanged - they're a different entry point, not part of the
// inbox list.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, Trash2, Search, ArrowLeft, Megaphone, Users, FileText, X, RotateCw } from 'lucide-react';
import { useAcademy } from '../lib/AcademyDataContext';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { uploadAttachmentWithProgress, getAttachmentUrl, listTeacherGroupAssignments } from '../lib/db';
import { LEVELS } from '../lib/levels';

// Attachments are normalized to { url, name, type } whether they come
// from the legacy single-attachment columns on messages (0009) or from
// message_attachments (0047, used when a message has more than one file).
const isImageAttachment = (a) => (a.type || '').startsWith('image/');
const isPdfAttachment = (a) => a.type === 'application/pdf' || (a.name || '').toLowerCase().endsWith('.pdf');

const MAX_ATTACHMENTS = 5;
const DISCUSSION_KEY = { lesson: 'discussionLesson', homework: 'discussionHomework', exam: 'discussionExam', certificate: 'discussionCertificate' };

function initials(label) {
  return (label || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
}

function Avatar({ label, kind }) {
  const bg = kind === 'level' ? 'bg-brand-600' : kind === 'announcement' ? 'bg-inactive' : 'bg-brand-500';
  return (
    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${bg}`}>
      {kind === 'level' ? <Users size={16} /> : kind === 'announcement' ? <Megaphone size={16} /> : initials(label)}
    </div>
  );
}

export default function Chat() {
  const { t } = useTranslation(['chat', 'common']);
  const { profile, role } = useAuth();
  const {
    students, lessons, homework, exams, certificates,
    messages, messageReads, messageAttachments, addMessage, addMessageAttachments, removeMessage, markRead,
    setActiveConversationView, error,
  } = useAcademy();
  const [searchParams] = useSearchParams();
  const contextType = searchParams.get('type');
  const contextId = searchParams.get('id') ? Number(searchParams.get('id')) : null;
  const isContextView = Boolean(contextType && contextId);
  // Set by a notification click (see buildConversationUrl in
  // useAcademyData.js) to auto-select a direct/level/announcement
  // conversation that isn't otherwise addressable by URL the way context
  // discussions already are.
  const openParam = searchParams.get('open');
  const openWith = searchParams.get('with');
  const openLevel = searchParams.get('level');

  const isAdmin = role === 'administrator';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const [activeKey, setActiveKey] = useState(null);

  // A notification click lands here with ?open=direct&with=<id> (or
  // level/announcement) - not otherwise addressable by URL the way
  // context discussions already are via ?type=&id=. Runs once on mount;
  // matches the same key format the conversations list below builds.
  useEffect(() => {
    if (!openParam || isContextView) return;
    if (openParam === 'direct' && openWith) setActiveKey(`direct:${openWith}`);
    else if (openParam === 'level' && openLevel) setActiveKey(`level:${openLevel}`);
    else if (openParam === 'announcement') setActiveKey('announcement');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [imageUrls, setImageUrls] = useState({});
  const [teacherProfiles, setTeacherProfiles] = useState([]);
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [assignedTeacherIds, setAssignedTeacherIds] = useState(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'teacher')
      .order('full_name')
      .then(({ data }) => setTeacherProfiles(data || []));
  }, []);

  // Students can always message the administrator (see can_send_message
  // in migration 0045) - unlike teachers, this isn't level-scoped.
  useEffect(() => {
    if (!isStudent) return;
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'administrator')
      .order('full_name')
      .then(({ data }) => setAdminProfiles(data || []));
  }, [isStudent]);

  // Students can only direct-message a teacher assigned to their own
  // level (RLS enforces this server-side too - see can_send_message in
  // migration 0044). teacher_group_assignments RLS already scopes rows
  // to the caller's own level for a student, so no extra filtering by
  // level is needed here - whatever comes back is the assigned set.
  useEffect(() => {
    if (!isStudent) return;
    listTeacherGroupAssignments().then((rows) => setAssignedTeacherIds(new Set(rows.map((r) => r.teacher_id))));
  }, [isStudent]);

  const studentRecipients = useMemo(
    () =>
      students
        .filter((s) => s.profile_id)
        .map((s) => ({ id: s.profile_id, label: s.real_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [students]
  );

  // Every valid direct-message counterpart for the signed-in role,
  // independent of anything already messaged - mirrors exactly who
  // can_send_message('direct', ...) would accept, so a contact always
  // shown here is always sendable.
  const directContacts = useMemo(() => {
    if (isStudent) {
      const assigned = assignedTeacherIds ? teacherProfiles.filter((p) => assignedTeacherIds.has(p.id)) : [];
      return [
        ...assigned.map((p) => ({ id: p.id, label: p.full_name || p.email, roleLabel: t('common:teacher') })),
        ...adminProfiles.map((p) => ({ id: p.id, label: p.full_name || p.email, roleLabel: t('common:administrator') })),
      ];
    }
    if (isTeacher) return studentRecipients.map((s) => ({ id: s.id, label: s.label, roleLabel: t('common:student') }));
    if (isAdmin) {
      return [
        ...teacherProfiles.map((p) => ({ id: p.id, label: p.full_name || p.email, roleLabel: t('common:teacher') })),
        ...studentRecipients.map((s) => ({ id: s.id, label: s.label, roleLabel: t('common:student') })),
      ];
    }
    return [];
  }, [isStudent, isTeacher, isAdmin, teacherProfiles, adminProfiles, assignedTeacherIds, studentRecipients, t]);

  // Which level "group" conversations to show: a student only ever sees
  // their own level's broadcasts (can_read_message enforces this too);
  // teachers/admin can post to and read all three.
  const levelKeys = useMemo(() => {
    if (isStudent) {
      const myLevel = students.find((s) => s.profile_id === profile.id)?.level;
      return myLevel ? [myLevel] : [];
    }
    if (isTeacher || isAdmin) return LEVELS;
    return [];
  }, [isStudent, isTeacher, isAdmin, students, profile.id]);

  const contextLabel = useMemo(() => {
    if (!isContextView) return null;
    if (contextType === 'lesson') return lessons.find((l) => l.id === contextId)?.topic;
    if (contextType === 'homework') return homework.find((h) => h.id === contextId)?.title;
    if (contextType === 'exam') return exams.find((e) => e.id === contextId)?.title;
    if (contextType === 'certificate') return certificates.find((c) => c.id === contextId)?.title;
    return null;
  }, [isContextView, contextType, contextId, lessons, homework, exams, certificates]);

  const readIds = useMemo(
    () => new Set(messageReads.filter((r) => r.profile_id === profile.id).map((r) => r.message_id)),
    [messageReads, profile.id]
  );

  const nonContextMessages = useMemo(() => messages.filter((m) => m.scope !== 'context'), [messages]);

  // Multi-attachment messages (0047) - keyed by message_id, ordered by
  // position. A message with a single attachment never has rows here; it
  // uses the legacy attachment_url/name/type columns instead.
  const attachmentsByMessage = useMemo(() => {
    const map = {};
    messageAttachments.forEach((a) => {
      (map[a.message_id] ||= []).push(a);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [messageAttachments]);

  // Normalized { url, name, type } list for a message. A multi-attachment
  // send stores its first file in the legacy columns (so the messages
  // table's body-or-attachment check constraint is satisfied even with
  // no caption text) and the rest in message_attachments - so a message
  // can have both at once.
  const attachmentsFor = useCallback(
    (m) => {
      const legacy = m.attachment_url ? [{ url: m.attachment_url, name: m.attachment_name, type: m.attachment_type }] : [];
      const extra = (attachmentsByMessage[m.id] || []).map((a) => ({ url: a.url, name: a.name, type: a.type }));
      return [...legacy, ...extra];
    },
    [attachmentsByMessage]
  );

  const matchesConversation = useCallback(
    (m, conv) => {
      if (conv.kind === 'direct') {
        return m.scope === 'direct' && ((m.sender_id === profile.id && m.recipient_id === conv.recipientId) || (m.sender_id === conv.recipientId && m.recipient_id === profile.id));
      }
      if (conv.kind === 'level') return m.scope === 'level' && m.level === conv.level;
      if (conv.kind === 'announcement') return m.scope === 'announcement';
      return false;
    },
    [profile.id]
  );

  // The inbox list: one row per possible direct contact, per visible
  // level, plus the single announcement stream - each annotated with its
  // latest message and unread count purely from the flat messages table.
  const conversations = useMemo(() => {
    const build = (conv, title, subtitle) => {
      const msgs = nonContextMessages.filter((m) => matchesConversation(m, conv));
      const last = msgs.reduce((acc, m) => (!acc || new Date(m.created_at) > new Date(acc.created_at) ? m : acc), null);
      const unread = msgs.filter((m) => m.sender_id !== profile.id && !readIds.has(m.id)).length;
      return { ...conv, title, subtitle, last, unread };
    };

    const list = [
      ...directContacts.map((c) => build({ key: `direct:${c.id}`, kind: 'direct', recipientId: c.id }, c.label, c.roleLabel)),
      ...levelKeys.map((lvl) => build({ key: `level:${lvl}`, kind: 'level', level: lvl }, t('chat:levelGroupLabel', { level: t(`common:level${lvl}`) }))),
      build({ key: 'announcement', kind: 'announcement' }, t('chat:tabAnnouncements')),
    ];

    return list.sort((a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0));
  }, [directContacts, levelKeys, nonContextMessages, matchesConversation, profile.id, readIds, t]);

  const filteredConversations = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase())),
    [conversations, search]
  );

  const activeConversation = useMemo(() => conversations.find((c) => c.key === activeKey) || null, [conversations, activeKey]);

  // Tells useAcademyData.js's realtime handler which conversation (if
  // any) is currently open, so it can skip a browser notification for a
  // message the user is already looking at - see Chat Phase 3.2.
  useEffect(() => {
    if (isContextView) {
      setActiveConversationView({ kind: 'context', contextType, contextId });
    } else if (activeConversation?.kind === 'direct') {
      setActiveConversationView({ kind: 'direct', otherId: activeConversation.recipientId });
    } else if (activeConversation?.kind === 'level') {
      setActiveConversationView({ kind: 'level', level: activeConversation.level });
    } else if (activeConversation?.kind === 'announcement') {
      setActiveConversationView({ kind: 'announcement' });
    } else {
      setActiveConversationView(null);
    }
    return () => setActiveConversationView(null);
  }, [isContextView, contextType, contextId, activeConversation, setActiveConversationView]);

  const contextThread = useMemo(() => {
    if (!isContextView) return [];
    return [...messages]
      .filter((m) => m.scope === 'context' && m.context_type === contextType && m.context_id === contextId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [isContextView, messages, contextType, contextId]);

  const activeThread = useMemo(() => {
    if (isContextView) return contextThread;
    if (!activeConversation) return [];
    return [...nonContextMessages].filter((m) => matchesConversation(m, activeConversation)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [isContextView, contextThread, activeConversation, nonContextMessages, matchesConversation]);

  // Image attachments are previewed inline, which needs a resolved signed
  // URL (the bucket is private - see migration 0009). Only resolve for
  // the thread that's actually open, and only once per path.
  useEffect(() => {
    const thread = isContextView ? contextThread : activeThread;
    const allAttachments = thread.flatMap(attachmentsFor);
    const toResolve = allAttachments.filter((a) => isImageAttachment(a) && !imageUrls[a.url]);
    if (toResolve.length === 0) return;
    let cancelled = false;
    Promise.all(toResolve.map((a) => getAttachmentUrl(a.url).then((url) => [a.url, url]))).then((pairs) => {
      if (cancelled) return;
      setImageUrls((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContextView, contextThread, activeThread, attachmentsFor]);

  // Opening a thread marks everything currently shown in it as read - a
  // simple "read the thread, it's read" model rather than per-message
  // read toggles.
  useEffect(() => {
    activeThread.forEach((m) => {
      if (!readIds.has(m.id)) markRead(m.id, profile.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread]);

  // Snapshot of "what was unread the moment this thread was opened", so
  // the divider has something stable to point at - readIds itself gets
  // overwritten almost immediately by the markRead effect above, which
  // would otherwise make the divider vanish on the next render. Keyed on
  // which conversation is open, not on the thread's contents, so a new
  // message arriving via realtime while the thread is already open
  // doesn't reposition or add to the divider.
  const [unreadSnapshot, setUnreadSnapshot] = useState(() => new Set());
  useEffect(() => {
    const thread = isContextView ? contextThread : activeThread;
    setUnreadSnapshot(new Set(thread.filter((m) => m.sender_id !== profile.id && !readIds.has(m.id)).map((m) => m.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isContextView, contextType, contextId, activeKey]);

  const canCompose = isContextView
    ? true
    : activeConversation
    ? activeConversation.kind === 'direct' || ((activeConversation.kind === 'level' || activeConversation.kind === 'announcement') && (isTeacher || isAdmin) && !(activeConversation.kind === 'announcement' && !isAdmin))
    : false;

  const handleSend = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!body.trim() && files.length === 0) return;
      if (!isContextView && !activeConversation) return;
      setSending(true);
      setUploadError(null);
      try {
        let attachment = {};
        let extraAttachments = [];
        if (files.length === 1) {
          // Single attachment keeps using the legacy columns on messages
          // itself (0009) - unchanged from before multi-attachment support.
          setUploadProgress(0);
          const uploaded = await uploadAttachmentWithProgress(files[0], 'chat', setUploadProgress);
          attachment = { attachment_url: uploaded.path, attachment_name: uploaded.name, attachment_type: uploaded.type };
        } else if (files.length > 1) {
          // First file keeps the legacy columns (so the message row still
          // satisfies messages_body_or_attachment even with no caption
          // text); the rest go to message_attachments.
          setUploadProgress(0);
          for (let i = 0; i < files.length; i++) {
            const uploaded = await uploadAttachmentWithProgress(files[i], 'chat', (pct) => {
              setUploadProgress(Math.round((i * 100 + pct) / files.length));
            });
            if (i === 0) {
              attachment = { attachment_url: uploaded.path, attachment_name: uploaded.name, attachment_type: uploaded.type };
            } else {
              extraAttachments.push(uploaded);
            }
          }
        }
        const payload = {
          sender_id: profile.id,
          sender_name: profile.full_name || profile.email,
          scope: isContextView ? 'context' : activeConversation.kind,
          body: body.trim() || null,
          ...attachment,
        };
        if (isContextView) {
          payload.context_type = contextType;
          payload.context_id = contextId;
        } else if (activeConversation.kind === 'direct') {
          payload.recipient_id = activeConversation.recipientId;
        } else if (activeConversation.kind === 'level') {
          payload.level = activeConversation.level;
        }
        const record = await addMessage(payload);
        if (extraAttachments.length > 0) {
          await addMessageAttachments(record.id, extraAttachments);
        }
        setBody('');
        setFiles([]);
        setUploadProgress(null);
      } catch (err) {
        setUploadError(err.message || t('chat:uploadFailed'));
      } finally {
        setSending(false);
      }
    },
    [body, files, profile, isContextView, contextType, contextId, activeConversation, addMessage, addMessageAttachments, t]
  );

  const handleOpenAttachment = async (path) => {
    const url = await getAttachmentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const previewText = (m) => {
    if (!m) return t('chat:noMessagesYet');
    if (m.body) return m.body;
    if (m.attachment_name) return `📎 ${m.attachment_name}`;
    const extra = attachmentsByMessage[m.id];
    if (extra?.length) return `📎 ${t('chat:filesCount', { count: extra.length })}`;
    return t('chat:attachmentLabel');
  };

  const readOnlyNote = activeConversation?.kind === 'announcement' && !isAdmin
    ? t('chat:readOnlyAnnouncement')
    : activeConversation?.kind === 'level' && isStudent
    ? t('chat:readOnlyLevel')
    : null;

  const renderAttachment = (a, idx, large) => {
    if (isImageAttachment(a)) {
      return (
        <button key={`${a.url}-${idx}`} onClick={() => handleOpenAttachment(a.url)} className="block overflow-hidden rounded-lg border border-ink/10">
          {imageUrls[a.url] ? (
            <img src={imageUrls[a.url]} alt={a.name || t('chat:attachmentLabel')} className={`w-full object-cover ${large ? 'max-h-64' : 'h-28'}`} />
          ) : (
            <div className={`flex w-full items-center justify-center text-xs text-ink/40 ${large ? 'h-32' : 'h-28'}`}>{t('common:loading')}</div>
          )}
        </button>
      );
    }
    if (isPdfAttachment(a)) {
      return (
        <button
          key={`${a.url}-${idx}`}
          onClick={() => handleOpenAttachment(a.url)}
          className="flex w-full items-center gap-2 rounded-lg border border-brand-500 p-2 text-left hover:bg-brand-50"
        >
          <FileText size={22} className="flex-shrink-0 text-brand-500" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-ink">{a.name || t('chat:attachmentLabel')}</span>
            <span className="text-[10px] font-semibold uppercase text-ink/40">PDF</span>
          </span>
        </button>
      );
    }
    return (
      <button
        key={`${a.url}-${idx}`}
        onClick={() => handleOpenAttachment(a.url)}
        className="flex items-center gap-1.5 rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-500 hover:bg-brand-50"
      >
        <Paperclip size={13} /> {a.name || t('chat:attachmentLabel')}
      </button>
    );
  };

  const firstUnreadId = thread => thread.find((m) => unreadSnapshot.has(m.id))?.id;

  const renderMessages = (thread) => {
    const dividerId = firstUnreadId(thread);
    return (
      <div className="space-y-2 overflow-y-auto p-4">
        {thread.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink/50">{t('chat:noMessagesYet')}</p>
        ) : (
          thread.map((m) => {
            const mine = m.sender_id === profile.id;
            const atts = attachmentsFor(m);
            const images = atts.filter(isImageAttachment);
            const others = atts.filter((a) => !isImageAttachment(a));
            return (
              <div key={m.id}>
                {m.id === dividerId && (
                  <div className="my-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-inactive/30" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-inactive">{t('chat:newMessagesDivider')}</span>
                    <div className="h-px flex-1 bg-inactive/30" />
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl p-3 shadow-card ${mine ? 'bg-brand-50' : 'bg-white'}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-ink/50">
                        <span className="font-semibold text-ink">{m.sender_name || t('chat:unknownSender')}</span>
                        <span>·</span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => removeMessage(m.id)}
                          className="rounded-md p-1 text-inactive hover:bg-inactive/10"
                          aria-label={t('chat:deleteMessageAria')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {m.body && <p className="whitespace-pre-wrap text-sm text-ink/80">{m.body}</p>}
                    {images.length > 0 && (
                      <div className={`mt-2 grid gap-1 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {images.map((a, i) => renderAttachment(a, i, images.length === 1))}
                      </div>
                    )}
                    {others.length > 0 && <div className="mt-2 space-y-1.5">{others.map((a, i) => renderAttachment(a, i, false))}</div>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  const renderComposer = () => (
    <form onSubmit={handleSend} className="space-y-2 border-t border-ink/10 p-3">
      {readOnlyNote ? (
        <p className="text-center text-xs text-ink/40">{readOnlyNote}</p>
      ) : (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={t('chat:writeMessage')}
            className="input resize-none"
          />
          {uploadError && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-inactive/30 bg-inactive/5 px-3 py-2 text-xs text-inactive">
              <span className="truncate">{uploadError}</span>
              <button
                type="button"
                onClick={() => handleSend()}
                className="flex flex-shrink-0 items-center gap-1 font-semibold hover:underline"
              >
                <RotateCw size={12} /> {t('chat:retry')}
              </button>
            </div>
          )}
          {sending && files.length > 0 && uploadProgress !== null && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-[10px] text-ink/40">{t('chat:uploadingProgress', { percent: uploadProgress })}</p>
            </div>
          )}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-paper px-2 py-1 text-[11px] text-ink/60">
                  {f.name}
                  {!sending && (
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={t('chat:removeAttachment')}
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold text-ink/50 hover:text-ink ${
                files.length >= MAX_ATTACHMENTS ? 'pointer-events-none opacity-40' : 'cursor-pointer'
              }`}
            >
              <Paperclip size={14} />
              {files.length > 0 ? t('chat:attachmentsCount', { count: files.length, max: MAX_ATTACHMENTS }) : t('chat:attachImageOrPdf')}
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  if (picked.length > 0) setFiles((prev) => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
                  setUploadError(null);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="submit"
              disabled={sending || (!body.trim() && files.length === 0)}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <Send size={15} /> {sending ? (files.length > 0 ? t('chat:uploadingMessage') : t('chat:sendingMessage')) : t('chat:send')}
            </button>
          </div>
        </>
      )}
    </form>
  );

  if (isContextView) {
    return (
      <div>
        <header className="mb-4">
          <h1 className="font-display text-2xl font-bold text-ink">{t('chat:discussionTitle', { label: contextLabel || '...' })}</h1>
          <p className="mt-1 text-sm text-ink/50">{t('chat:contextSubtitle')}</p>
        </header>
        {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-xl bg-white shadow-card">
          {renderMessages(contextThread)}
          {renderComposer()}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">{t('chat:messagesTitle')}</h1>
        <p className="mt-1 text-sm text-ink/50">{t('chat:messagesSubtitle')}</p>
      </header>

      {error && <div className="mb-4 rounded-lg border border-inactive/30 bg-inactive/5 px-4 py-3 text-sm text-inactive">{error}</div>}

      <div className="flex h-[70vh] gap-4">
        <div className={`w-full flex-shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-card md:flex md:w-80 ${activeKey ? 'hidden' : 'flex'}`}>
          <div className="border-b border-ink/10 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2">
              <Search size={14} className="text-ink/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('chat:searchConversations')}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink/50">{t('chat:noConversations')}</p>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setActiveKey(c.key)}
                  className={`flex w-full items-center gap-3 border-b border-ink/5 p-3 text-left hover:bg-paper ${activeKey === c.key ? 'bg-paper' : ''}`}
                >
                  <Avatar label={c.title} kind={c.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-display text-sm font-semibold text-ink">
                        {c.title}
                        {c.subtitle && <span className="ml-1 font-sans text-xs font-normal text-ink/40">({c.subtitle})</span>}
                      </p>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-inactive px-1.5 text-[10px] font-bold text-white">
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink/50">{previewText(c.last)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-card md:flex ${activeKey ? 'flex' : 'hidden'}`}>
          {activeConversation ? (
            <>
              <div className="flex items-center gap-2 border-b border-ink/10 p-3">
                <button onClick={() => setActiveKey(null)} className="rounded-md p-1 text-ink/50 hover:bg-paper md:hidden" aria-label={t('chat:backToConversations')}>
                  <ArrowLeft size={18} />
                </button>
                <Avatar label={activeConversation.title} kind={activeConversation.kind} />
                <div>
                  <p className="font-display text-sm font-semibold text-ink">{activeConversation.title}</p>
                  {activeConversation.subtitle && <p className="text-xs text-ink/40">{activeConversation.subtitle}</p>}
                </div>
              </div>
              {renderMessages(activeThread)}
              {renderComposer()}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-ink/40">{t('chat:noConversationSelected')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
