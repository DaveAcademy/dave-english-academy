// send-payment-reminder. Reuses get_payment_reminder_candidates() for the
// message data (same "exactly one implementation" invariant as the rest
// of the payment system) so a sent message can never disagree with what
// the Reminders page showed the admin before they clicked send.
//
// Two request shapes:
//   { student_id, test: true }   - unchanged from phase 2: sends the
//                                   preview to the admin's own Telegram
//                                   only, never writes payment_reminders.
//   { student_ids: [...] }       - real send, one per id: delivers to
//                                   the student's own telegram_chat_id,
//                                   and on Telegram success inserts a
//                                   payment_reminders row. The unique
//                                   index on (student_id, reminder_type,
//                                   deadline_date) is the actual
//                                   duplicate-prevention mechanism - a
//                                   23505 here is reported as "duplicate",
//                                   not treated as a failure.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// supabase.functions.invoke() sends a CORS preflight OPTIONS request before
// the real POST - without a response to it, the browser never gets past
// the preflight and the JS client reports a generic "failed to send"
// error that never reaches this function's own logic.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Two templates - due_soon (friendly reminder) and overdue (polite
// request) - deliberately different tone, not the same copy with a
// different date. Uzbek only, per the confirmed language decision.
//
// Deliberately no amount here - the reminder's job is to notify that
// payment is due/overdue, not to state a calculated balance. Amount
// investigation belongs on the Payments page, not in a Telegram message
// (confirmed 2026-08-02).
function buildMessage(candidate: { student_name: string; status: string; next_due_date: string }) {
  const date = candidate.next_due_date;
  if (candidate.status === 'overdue') {
    return `Assalomu alaykum, ${candidate.student_name} 😊\nSizning oylik to'lovingiz muddati o'tganini eslatib o'tmoqchimiz.\nTo'lov muddati: ${date}\nImkon qadar yaqin kunlarda to'lovni amalga oshirishingizni so'raymiz. Rahmat! 🙏`;
  }
  return `Assalomu alaykum, ${candidate.student_name} 😊\nSizga oylik to'lov muddati ${date} ekanini eslatib o'tmoqchimiz.\nIltimos, to'lovni belgilangan muddatdan oldin amalga oshiring. Dave English Academy oilamizning bir qismi bo'lganingiz uchun rahmat! 📚✨`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin');
  if (adminErr || !isAdmin) return json({ error: 'Admins only' }, 403);

  const body = await req.json().catch(() => ({}));
  const { student_id, student_ids, test } = body ?? {};

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500);

  const { data: candidates, error: candErr } = await userClient.rpc('get_payment_reminder_candidates');
  if (candErr) return json({ error: candErr.message }, 500);

  type Candidate = {
    student_id: number;
    student_name: string;
    status: string;
    next_due_date: string;
    next_amount_due: number;
    telegram_chat_id: string | null;
  };
  const candidateList = (candidates ?? []) as Candidate[];

  async function sendTelegram(chatId: string, text: string) {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return resp.json();
  }

  // Test mode - unchanged from phase 2: single student, admin's own
  // Telegram only, no payment_reminders write.
  if (test) {
    if (!student_id) return json({ error: 'student_id is required' }, 400);
    const testChatId = Deno.env.get('TELEGRAM_TEST_CHAT_ID');
    if (!testChatId) return json({ error: 'TELEGRAM_TEST_CHAT_ID is not configured' }, 500);

    const candidate = candidateList.find((c) => c.student_id === student_id);
    if (!candidate) return json({ error: 'Student is not a current reminder candidate' }, 404);

    const message = buildMessage(candidate);
    const preview = `[TEST - would go to ${candidate.student_name}]\n\n${message}`;
    const tgData = await sendTelegram(testChatId, preview);
    if (!tgData.ok) return json({ error: `Telegram error: ${tgData.description}` }, 502);

    return json({ success: true, sent_to: 'test', preview: message });
  }

  // Real send - admin explicitly confirmed a list of student_ids in the
  // UI's confirmation modal before this request was ever made. Each is
  // delivered to their own telegram_chat_id; a Telegram success writes a
  // payment_reminders row. The table's unique index is what actually
  // stops a duplicate send, not any in-memory check here.
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return json({ error: 'student_ids (non-empty array) is required' }, 400);
  }

  const results = [];
  for (const id of student_ids) {
    const candidate = candidateList.find((c) => c.student_id === id);
    if (!candidate) {
      results.push({ student_id: id, status: 'not_a_candidate' });
      continue;
    }
    if (!candidate.telegram_chat_id) {
      results.push({ student_id: id, student_name: candidate.student_name, status: 'no_telegram_id' });
      continue;
    }

    const message = buildMessage(candidate);
    const tgData = await sendTelegram(candidate.telegram_chat_id, message);
    if (!tgData.ok) {
      // Log the failed attempt instead of only returning it - the
      // partial unique index (status='sent' only, migration 0086) means
      // this row can never block a retry, it exists purely so the
      // failure isn't lost the moment this response is discarded.
      const { error: failInsertErr } = await userClient.from('payment_reminders').insert({
        student_id: id,
        reminder_type: candidate.status,
        deadline_date: candidate.next_due_date,
        message_text: message,
        sent_by: user.id,
        status: 'failed',
        error_detail: tgData.description ?? 'Unknown Telegram error',
      });
      results.push({
        student_id: id,
        student_name: candidate.student_name,
        status: 'failed',
        detail: tgData.description,
        logged: !failInsertErr,
      });
      continue;
    }

    const { error: insertErr } = await userClient.from('payment_reminders').insert({
      student_id: id,
      reminder_type: candidate.status,
      deadline_date: candidate.next_due_date,
      message_text: message,
      sent_by: user.id,
      status: 'sent',
    });

    if (insertErr) {
      // 23505 = unique_violation - a reminder for this exact
      // student/type/deadline was already logged (race with another
      // admin action, or a retry). The Telegram message still went out,
      // so report it as sent-but-duplicate rather than a failure.
      if (insertErr.code === '23505') {
        results.push({ student_id: id, student_name: candidate.student_name, status: 'duplicate' });
      } else {
        results.push({
          student_id: id,
          student_name: candidate.student_name,
          status: 'sent_but_not_logged',
          detail: insertErr.message,
        });
      }
      continue;
    }

    results.push({ student_id: id, student_name: candidate.student_name, status: 'sent' });
  }

  return json({ success: true, results });
});
