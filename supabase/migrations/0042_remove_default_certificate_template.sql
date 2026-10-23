-- Removes the 'default' certificate_templates row (0026). Student of the
-- Week/Month are official awards - silently falling back to an unrelated
-- "default" design (or, as the 2026-07-26 production bug showed, whatever
-- image happens to be uploaded there) let a certificate look successful
-- while actually being wrong. pickCertificateTemplate() (src/utils/pdf.js)
-- no longer has a default to fall back to: a certificate titled "Student
-- of the Week"/"Student of the Month" now either uses that award's own
-- template or throws, surfaced to the caller as a visible error instead
-- of generating anything. Any other (free-text "Issue certificate")
-- title still works exactly as before - it never used 'default' as a
-- specific look to guarantee, just a nice-to-have background, and now
-- renders the plain built-in design when nothing is configured for it.

delete from public.certificate_templates where key = 'default';
