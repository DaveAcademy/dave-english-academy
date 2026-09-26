-- Drops two duplicate unique indexes found by a fresh Supabase performance
-- advisor pass (2026-08-17): attendance and payments each carry two
-- byte-identical unique btree indexes on the same column set. The
-- `_key`-suffixed ones (Postgres's default constraint-naming convention)
-- are not referenced anywhere in the numbered migration history or app
-- code (grep confirmed) -- only the `_unique`-suffixed ones from
-- 0001_schema.sql are. Dropping the redundant duplicate halves the write
-- overhead/storage for these two indexes with zero change to the
-- uniqueness guarantee (the remaining index enforces the same
-- (student_id, date) / (student_id, year, month) constraint).
alter table public.attendance
  drop constraint if exists attendance_student_id_date_key;

alter table public.payments
  drop constraint if exists payments_student_id_year_month_key;
