-- Restoring a backup (importAllData) inserts students/payments/attendance
-- rows with their original explicit id values, which bypasses each table's
-- identity sequence and leaves it desynced from the actual max id. Once
-- desynced, every subsequent normal insert eventually collides with an id
-- already in use, failing with "duplicate key value violates unique
-- constraint". Resync now, and add a callable function so storageBridge.js
-- can resync again after every future restore.

select setval('public.students_id_seq', (select coalesce(max(id), 1) from public.students));
select setval('public.payments_id_seq', (select coalesce(max(id), 1) from public.payments));
select setval('public.attendance_id_seq', (select coalesce(max(id), 1) from public.attendance));

create or replace function public.resync_sequences()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Only administrators can do this';
  end if;
  perform setval('public.students_id_seq', (select coalesce(max(id), 1) from public.students));
  perform setval('public.payments_id_seq', (select coalesce(max(id), 1) from public.payments));
  perform setval('public.attendance_id_seq', (select coalesce(max(id), 1) from public.attendance));
end;
$$;
