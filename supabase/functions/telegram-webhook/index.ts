// telegram-webhook - Telegram auto-connect, first version (34-student
// scale). Fully separate from send-payment-reminder: different trust
// model (no Supabase JWT - Telegram calls this directly), different
// tables, different edge function. Never touches payment_reminders,
// billing, or any payment status calculation.
//
// All student-facing text is Uzbek (confirmed 2026-08-02) - code,
// DB fields, statuses, and comments stay English for dev consistency.
//
// Conversation flow (state held in telegram_link_requests, since edge
// functions are stateless between invocations):
//   1. /start or first message -> "send me your full name"
//   2. name text -> search active students -> best match found:
//      - already linked to someone -> refuse, log 'already_linked'
//      - no match -> log 'rejected', ask to retry
//      - match -> log 'pending', show inline Ha/Yo'q buttons
//   3. Button press (callback_query) on a pending request:
//      - Ha -> atomic UPDATE students set telegram_chat_id where still
//        null (race guard) -> 'confirmed' or 'already_linked' if the
//        race lost
//      - Yo'q -> 'rejected', ask for name again
//      A plain-text YES/NO/ha/yo'q reply is still accepted as a fallback
//      for anyone who types instead of tapping, but buttons are the
//      primary path per the design decision - less typing, fewer typo
//      mismatches.
//
// Security: secret-token header check (Telegram-side, not a Supabase
// JWT), rate limit of 5 non-confirmed attempts per chat_id per 30
// minutes, never overwrites an existing telegram_chat_id, one chat_id
// can only ever link once (DB unique constraint is the final guard even
// if this logic has a bug).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RATE_LIMIT_WINDOW_MINUTES = 30;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

const CONFIRM_YES_DATA = 'link_confirm_yes';
const CONFIRM_NO_DATA = 'link_confirm_no';

function ok() {
  // Telegram only cares about 200 vs non-200; body is ignored, but kept
  // for local debugging.
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function sendMessage(botToken: string, chatId: string, text: string, replyMarkup?: unknown) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  }).catch(() => {});
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => {});
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Ha ✅", callback_data: CONFIRM_YES_DATA },
        { text: "Yo'q ❌", callback_data: CONFIRM_NO_DATA },
      ],
    ],
  };
}

// Text fallback for anyone who types instead of tapping a button.
function isYes(text: string) {
  return ['yes', 'y', 'ha'].includes(text.trim().toLowerCase());
}
function isNo(text: string) {
  return ['no', 'n', "yo'q", 'yoq'].includes(text.trim().toLowerCase());
}

// A bare "hi"/"hey"/"ok" etc. is not a name search - without this,
// ilike '%text%' would spuriously match any student whose name happens
// to contain that substring (e.g. "Hi" matched "Javohir" in testing).
const GREETING_WORDS = new Set([
  'hi', 'hey', 'hello', 'ok', 'okay', 'salom', 'assalomu', 'rahmat', 'thanks',
]);
function looksLikeNameSearch(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;
  if (trimmed.startsWith('/')) return false; // commands (e.g. /start) are never a name search
  if (GREETING_WORDS.has(trimmed.toLowerCase())) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();

  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!expectedSecret || secretHeader !== expectedSecret) {
    // Not a real Telegram callback - reject without touching the DB.
    return new Response('Unauthorized', { status: 401 });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return ok(); // nothing we can do without a bot token; ack anyway so Telegram stops retrying

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  const update = await req.json().catch(() => null);

  const callbackQuery = update?.callback_query;
  const message = update?.message;

  const chatId = callbackQuery ? String(callbackQuery.message?.chat?.id ?? '') : String(message?.chat?.id ?? '');
  if (!chatId) return ok();

  // Button press vs typed text - normalized to the same yes/no/text shape
  // the rest of the flow already understands.
  let text: string;
  if (callbackQuery) {
    await answerCallbackQuery(botToken, callbackQuery.id);
    text = callbackQuery.data === CONFIRM_YES_DATA ? 'HA' : callbackQuery.data === CONFIRM_NO_DATA ? "YO'Q" : '';
  } else {
    text = String(message?.text ?? '').trim();
  }

  const reply = (t: string, replyMarkup?: unknown) => sendMessage(botToken, chatId, t, replyMarkup);

  // Already linked to a student? Refuse outright - no re-link path from
  // the bot, ever. Only an admin can change this via the Students page.
  const { data: existingStudent } = await db
    .from('students')
    .select('id, real_name')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();
  if (existingStudent) {
    await db.from('telegram_link_requests').insert({
      chat_id: chatId,
      searched_name: text || '(no text)',
      matched_student_id: existingStudent.id,
      status: 'already_linked',
    });
    await reply('Bu Telegram hisobi allaqachon o\'quvchi bilan bog\'langan.');
    return ok();
  }

  // Rate limit: too many non-confirmed attempts recently -> block.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: recentAttempts } = await db
    .from('telegram_link_requests')
    .select('id', { count: 'exact', head: true })
    .eq('chat_id', chatId)
    .neq('status', 'confirmed')
    .gte('created_at', windowStart);
  if ((recentAttempts ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    await db.from('telegram_link_requests').insert({
      chat_id: chatId,
      searched_name: text || '(no text)',
      status: 'blocked',
    });
    await reply('Juda ko\'p urinish bo\'ldi. Iltimos, administrator bilan bog\'laning.');
    return ok();
  }

  // Is there a pending confirmation waiting on this chat_id?
  const { data: pending } = await db
    .from('telegram_link_requests')
    .select('id, matched_student_id')
    .eq('chat_id', chatId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending?.matched_student_id) {
    if (isYes(text)) {
      // Atomic race guard: only succeeds if telegram_chat_id is still
      // null at the moment of update.
      const { data: updated, error: updateErr } = await db
        .from('students')
        .update({ telegram_chat_id: chatId })
        .eq('id', pending.matched_student_id)
        .is('telegram_chat_id', null)
        .select('id')
        .maybeSingle();

      if (updateErr || !updated) {
        await db
          .from('telegram_link_requests')
          .update({ status: 'already_linked', updated_at: new Date().toISOString() })
          .eq('id', pending.id);
        await reply("Bu o'quvchi hozirgina boshqa birov tomonidan bog'landi. Iltimos, administrator bilan bog'laning.");
      } else {
        await db
          .from('telegram_link_requests')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', pending.id);
        await reply(
          "✅ Telegram hisobingiz muvaffaqiyatli bog'landi.\nEndi to'lov eslatmalari va boshqa muhim xabarlarni shu yerda olasiz."
        );
      }
      return ok();
    }

    if (isNo(text)) {
      await db
        .from('telegram_link_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', pending.id);
      await reply("Xo'p, to'liq ismingizni qayta yozing.");
      return ok();
    }

    await reply("Iltimos, yuqoridagi tugmalardan birini bosing: Ha ✅ yoki Yo'q ❌.");
    return ok();
  }

  // No pending confirmation - only treat text that actually looks like a
  // name as a search (/start, empty messages, and greetings just get the
  // prompt instead of triggering a spurious substring match).
  if (!looksLikeNameSearch(text)) {
    await reply(
      "Assalomu alaykum! Dave English Academy botiga xush kelibsiz.\nTelegram hisobingizni bog'lash uchun to'liq ismingizni yozing."
    );
    return ok();
  }

  const { data: matches } = await db
    .from('students')
    .select('id, real_name, level, group_name, telegram_chat_id')
    .eq('status', 'Active')
    .ilike('real_name', `%${text}%`)
    .limit(5);

  const match = (matches ?? [])[0];

  if (!match) {
    await db.from('telegram_link_requests').insert({ chat_id: chatId, searched_name: text, status: 'rejected' });
    await reply("❌ O'quvchi topilmadi. Iltimos, ismingizni to'liq va to'g'ri yozing yoki administrator bilan bog'laning.");
    return ok();
  }

  if (match.telegram_chat_id) {
    await db.from('telegram_link_requests').insert({
      chat_id: chatId,
      searched_name: text,
      matched_student_id: match.id,
      status: 'already_linked',
    });
    await reply("Bu o'quvchi allaqachon boshqa Telegram hisobiga bog'langan. Agar bu xato bo'lsa, administrator bilan bog'laning.");
    return ok();
  }

  await db.from('telegram_link_requests').insert({
    chat_id: chatId,
    searched_name: text,
    matched_student_id: match.id,
    status: 'pending',
  });

  const groupLine = match.group_name ? `\nGuruh: ${match.group_name}` : '';
  await reply(
    `Siz quyidagi o'quvchimisiz?\nIsm: ${match.real_name}\nDaraja: ${match.level}${groupLine}`,
    confirmKeyboard()
  );
  return ok();
});
