-- Certificate deletion is broken for any certificate that was issued
-- through the Recognition workflow (Student of the Week/Month -
-- 0025/0027): recognition_awards.certificate_id references
-- certificates(id) with the default ON DELETE NO ACTION, so
-- deleteCertificate()'s `delete from certificates where id = ...`
-- (storageBridge.js) raises a 23503 foreign key violation the moment the
-- certificate has an award pointing at it. RLS (certificates_admin_all,
-- 0005) already permits the delete - this is a schema constraint, not a
-- permissions bug. Confirmed live: 3 of 4 existing certificates are
-- award-linked and fail to delete with exactly this error.
--
-- Switching to ON DELETE SET NULL keeps the recognition_awards history
-- row (period, points, winner) intact and simply clears the "a
-- certificate document was issued for this" link. Recognition.jsx (401)
-- already renders certificate_id === null as "-", so no UI change is
-- needed.

alter table public.recognition_awards
  drop constraint if exists recognition_awards_certificate_id_fkey;

alter table public.recognition_awards
  add constraint recognition_awards_certificate_id_fkey
  foreign key (certificate_id) references public.certificates (id)
  on delete set null;
