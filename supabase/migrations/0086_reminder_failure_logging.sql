-- Reminder observability, session 1 of 3: failed sends currently vanish -
-- send-payment-reminder returns a failure in its HTTP response but never
-- writes it anywhere, so a Telegram error leaves zero trace once the
-- admin's browser tab closes. Confirmed scope with the user: log every
-- attempt (success or failure), and a failed attempt must NOT block a
-- retry - only a genuine 'sent' row should count toward the existing
-- duplicate-send guard.
--
-- status defaults to 'sent' so every pre-existing row (all of which are
-- real successes - this table has never held anything else) backfills
-- correctly with zero data migration needed.
--
-- created_at is the attempt timestamp regardless of outcome. sent_at is
-- kept as-is (still defaults to now() on insert, unchanged column) for
-- backward compatibility with anything already reading it as "when this
-- row was created" - for a 'failed' row its value is identical to
-- created_at, just not semantically "sent" (nothing was sent). New code
-- (the history view, the edge function) should treat created_at as the
-- canonical timestamp.

alter table public.payment_reminders
  add column if not exists status text not null default 'sent' check (status in ('sent', 'failed')),
  add column if not exists error_detail text,
  add column if not exists created_at timestamptz not null default now();

-- Replaces the old unconditional unique index (migration 0081) - a failed
-- attempt must never occupy the slot a real send needs. Only 'sent' rows
-- are mutually exclusive per (student, type, deadline); any number of
-- 'failed' rows can accumulate for the same key while retries happen.
drop index if exists public.payment_reminders_dedupe;

create unique index payment_reminders_dedupe
  on public.payment_reminders (student_id, reminder_type, deadline_date)
  where status = 'sent';
