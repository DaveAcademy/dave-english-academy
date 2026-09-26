-- Archives student 44 ("Test Student ", monthly_fee = 0), flagged by the
-- 0057 backfill preview as clearly non-production data. Soft-archive via
-- the existing students.status field (the mechanism this schema already
-- uses for exactly this purpose), not a delete - the row, its attendance,
-- and its 2 skipped payment months stay intact and reachable. Guarded on
-- both id and real_name so this migration is a safe no-op if that row's
-- identity ever changes rather than silently archiving a different id 44.
update public.students
set status = 'Inactive'
where id = 44
  and real_name = 'Test Student '
  and status <> 'Inactive';
