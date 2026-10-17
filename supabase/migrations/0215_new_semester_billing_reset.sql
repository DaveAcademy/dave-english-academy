-- New Semester Billing Reset: Reset semester_start_date for all active students
-- to their first payment date in September 2026 (new semester).
--
-- This implements a clean new-semester billing reset:
-- * Previous-semester billing obligations do NOT carry over
-- * Current-semester billing starts fresh from each student's first September 2026 payment date
-- * Historical payment transactions remain completely intact
-- * Student payment fees remain unchanged
-- * Historical deadline history remains intact

-- Set semester_start_date for ALL active students to their first September 2026 payment date
-- based on their current payment_deadline.
-- September 2026 has 30 days, so all deadlines 1-30 are valid.
-- The first payment date in September 2026 is September {payment_deadline}.

UPDATE public.students
SET semester_start_date = CASE
  WHEN payment_deadline <= 30 THEN ('2026-09-' || lpad(payment_deadline::text, 2, '0'))::date
  ELSE '2026-09-30'::date  -- fallback for day 31 (September has 30 days)
END
WHERE status = 'Active'
  AND semester_start_date IS NOT NULL;

-- Record the semester reset in history for audit trail
INSERT INTO public.student_semester_start_history (
  student_id,
  old_semester_start_date,
  new_semester_start_date,
  effective_date,
  reason,
  changed_by
)
SELECT
  s.id,
  s.semester_start_date,
  CASE
    WHEN s.payment_deadline <= 30 THEN ('2026-09-' || lpad(s.payment_deadline::text, 2, '0'))::date
    ELSE '2026-09-30'::date
  END,
  '2026-09-01 00:00:00+05:00'::timestamptz,
  'New semester billing reset - September 2026',
  'f7952e64-bde0-4c12-b9bc-cf1b5e534514'
FROM public.students s
WHERE s.status = 'Active'
  AND s.semester_start_date IS NOT NULL
  AND (
    s.semester_start_date <> (
      CASE
        WHEN s.payment_deadline <= 30 THEN ('2026-09-' || lpad(s.payment_deadline::text, 2, '0'))::date
        ELSE '2026-09-30'::date
      END
    )
  );

-- Add comment documenting the reset
COMMENT ON COLUMN public.students.semester_start_date IS 
'Start date of the current billing semester cycle. 
For the September 2026 new semester, this was reset to each student''s first September 2026 payment date.
Previous-semester billing obligations do NOT carry over.
';

COMMENT ON TABLE public.student_semester_start_history IS
'Audit log of semester start date changes (billing cycle resets).
Each record represents a billing cycle reset (e.g., new semester, reactivation).
';