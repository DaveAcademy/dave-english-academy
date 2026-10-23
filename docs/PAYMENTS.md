# Payments

## 1. Data model (confirmed-current)

Ledger-based, not a boolean flag. Core table: `payment_transactions` (migration `0054_payment_transactions.sql`). Reminder infrastructure added in `0081_payment_reminders_foundation.sql`.

`Payments.jsx` (admin) is the management surface; `Reports.jsx`'s Payments export reads `payment_transactions` rows directly (`paymentRows` state — columns: student, paid_at, amount, transaction_type, payment_method), not any boolean field.

## 2. Conflict with prior-session memory — resolved in favor of the repo

Prior-session memory (`dave-academy-payment-ledger-cutover`) stated: "legacy grid/write path removed; Dashboard fully on ledger now, **Reports.jsx still reads boolean `payments`**." **This pass greps `Reports.jsx` directly and finds no boolean `payments` field read anywhere in the payments report path** — it reads `paymentRows` (the ledger) exclusively, with fields `student_name`/`paid_at`/`amount`/`transaction_type`/`payment_method`, consistent with a fully ledger-based report. **The repo wins per this doc set's rule: Reports.jsx's payments export is already on the ledger, not a stale boolean.** Either the prior note was already stale by the time it was written, or a fix landed since — not independently dated in this pass. Treat the memory note as superseded.

## 3. Payment deadlines / reminders

`Reminders.jsx` (admin page) implements a Telegram reminder workflow:
- `get_payment_reminder_candidates()` RPC surfaces students with an outstanding/overdue payment and their linked `telegram_chat_id`.
- Candidates without `last_sent_at` and with a `telegram_chat_id` on file are selectable; students missing a Telegram ID are flagged ("No Telegram ID on file") rather than silently skipped.
- A test-mode send exists — sends the exact reminder message to the **admin's own Telegram only**, never the student, and is explicitly documented in-code as not logged as a real send.
- Actual sends go out via Telegram (confirmed by UI copy: "Messages will be sent via Telegram").
- Telegram linkage itself: `MissingTelegramSection` in `Reminders.jsx` lists active students with no `telegram_chat_id`; connection flow is student/parent-initiated — they message the academy's Telegram bot, send their full name, and confirm the match (i.e. no admin-side manual chat-ID entry flow found in this page).

**Not found in this pass:** any server-side scheduled job (cron) that sends reminders automatically. The workflow as read is **admin-triggered from the UI**, not a background scheduler — treat "automatic recurring reminders" as an **unverified-assumption** unless a scheduler is found elsewhere (no MCP cron/edge-function scheduling was located for this feature; a Supabase Edge Function-based scheduled job cannot be ruled out without checking `supabase/functions/`, which was not enumerated this pass).

## 4. Payment DB objects

- `payment_transactions` (`0054`) — the ledger.
- Reminder-related tables/columns from `0081_payment_reminders_foundation.sql` (not individually enumerated this pass — see the migration file directly for exact shape).
- `students.telegram_chat_id` — links a student to their Telegram identity for reminder delivery.

## 5. Known issues

- `PaymentEngineTest.jsx` (hidden `/dev/payment-engine-test` diagnostic page, created for the `0054`-`0060` ledger migration verification) removed 2026-08-17 — purpose was complete, and it was an unnecessary secondary path capable of creating real `payment_transactions` records via `recordPayment()`. Normal Payments UI/Payment Engine unaffected.
- Whether reminder sends are truly automatic (scheduled) vs. admin-triggered-only was not fully resolved this pass — see §3.
- No independent audit of `payment_transactions` RLS/reversal mechanics was performed this pass (out of scope — payments were not part of any prior dedicated audit doc found in `docs/`); treat payment-ledger integrity as **unverified-assumption** relative to the point-transaction ledger's own well-audited RLS (see `DATABASE.md` §3), which it structurally resembles but was not independently re-checked.

## 6. Status summary

| Item | Status |
|---|---|
| Ledger-based payment tracking | confirmed-current |
| Reports.jsx reading the ledger, not a boolean | confirmed-current (resolves a stale prior-session note) |
| Telegram reminder candidate list + test-send | confirmed-current |
| Automatic/scheduled reminder sending | unverified-assumption |
| `PaymentEngineTest.jsx` purpose/removal | removed 2026-08-17 |
