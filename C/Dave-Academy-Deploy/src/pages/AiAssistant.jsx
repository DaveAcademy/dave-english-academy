// AiAssistant.jsx
// Same component renders for students and for admin/teacher - the backend
// (supabase/functions/ai-assistant) decides the tool set and persona from
// the caller's own role, this page only changes the greeting/quick prompts
// shown. Conversation history lives in local state only (session memory,
// see the edge function's header comment) - nothing is persisted here.

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, BookOpen, Languages, HelpCircle, GraduationCap } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { sendAiAssistantMessage } from '../lib/aiAssistant';

const STUDENT_QUICK_PROMPTS = [
  { key: 'aiAssistantQuickGrammar', Icon: BookOpen, prompt: "Explain a grammar point I'm struggling with." },
  { key: 'aiAssistantQuickVocabulary', Icon: Languages, prompt: 'Teach me 5 new vocabulary words for my level.' },
  { key: 'aiAssistantQuickQuiz', Icon: HelpCircle, prompt: 'Give me a short quiz to practice.' },
  { key: 'aiAssistantQuickLesson', Icon: GraduationCap, prompt: 'What is my current lesson about?' },
];

const ADMIN_QUICK_PROMPTS = [
  { label: 'My ranking data', prompt: 'Find a student by name and show me their ranking summary.' },
  { label: 'Attendance check', prompt: "Look up a student's recent attendance." },
  { label: 'Payment status', prompt: "Check a student's payment status." },
  { label: 'Lesson pace', prompt: 'What lesson number is currently active for each level?' },
];

function Bubble({ role, children }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? 'bg-brand-600 text-white' : 'border border-ink/[0.08] bg-white text-ink shadow-card'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const { t } = useTranslation('portal');
  const { profile, role } = useAuth();
  const isStudent = role === 'student';
  const firstName = (profile?.full_name || '').split(' ')[0] || '';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const reply = await sendAiAssistantMessage(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message || t('aiAssistantError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col md:h-[calc(100vh-3rem)]">
      <header className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-ink">{t('aiAssistantTitle')}</h1>
          {messages.length === 0 && (
            <p className="text-xs text-ink/50">{isStudent ? t('aiAssistantSubtitle') : 'Read-only diagnostics: rankings, points, attendance, payments, lessons.'}</p>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="rounded-xl border border-ink/[0.06] bg-white p-5 shadow-card">
            <p className="font-display text-base font-semibold text-ink">{t('aiAssistantGreeting', { name: firstName })}</p>
            <p className="mt-1 text-sm text-ink/50">{isStudent ? t('aiAssistantSubtitle') : 'Ask about a student by name to start investigating.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isStudent
                ? STUDENT_QUICK_PROMPTS.map(({ key, Icon, prompt }) => (
                    <button
                      key={key}
                      onClick={() => send(prompt)}
                      className="flex items-center gap-1.5 rounded-xl border border-ink/[0.08] bg-white px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
                    >
                      <Icon size={14} className="text-brand-500" /> {t(key)}
                    </button>
                  ))
                : ADMIN_QUICK_PROMPTS.map(({ label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => send(prompt)}
                      className="rounded-xl border border-ink/[0.08] bg-white px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
                    >
                      {label}
                    </button>
                  ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}

        {sending && (
          <Bubble role="assistant">
            <span className="text-ink/40">{t('aiAssistantThinking')}</span>
          </Bubble>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-2 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('aiAssistantPlaceholder')}
          className="input flex-1"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
          aria-label={t('aiAssistantSend')}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
