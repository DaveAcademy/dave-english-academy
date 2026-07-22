-- Redesigns certificate_template (one global template shared by every
-- certificate) into certificate_templates (one row per certificate type,
-- keyed like point_categories) - the actual root cause the 2026-07-22
-- certificate QA pass found: the single configured template already had
-- "Student Of The Week" baked into its own artwork, so Student of the
-- Month certificates rendered with contradictory branding (the template
-- said "Week", the overlay text said "Month"), and even Student of the
-- Week certificates showed the award name twice (once in the template,
-- once in the overlay).
--
-- show_title_overlay lets an admin turn off the redundant overlay title
-- specifically for a template whose artwork already states the award -
-- studentName and issuedDate always still render, since those can never
-- be baked into a static image. Defaults to true (matches every
-- template's behavior today - nothing changes until an admin opts a
-- specific template out).
--
-- No check constraint on `key` (matches point_categories' precedent) -
-- an admin can add a template for a future award type (most_improved,
-- best_attendance, ...; see recognition_awards.award_type's check
-- constraint in 0022) without needing another migration.

create table if not exists public.certificate_templates (
  id bigint generated always as identity primary key,
  key text not null unique,
  label text not null,
  file_url text,
  file_name text,
  show_title_overlay boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.certificate_templates (key, label) values
  ('default', 'Default template'),
  ('student_of_week', 'Student of the Week'),
  ('student_of_month', 'Student of the Month')
on conflict (key) do nothing;

-- Preserve whatever's already configured - it becomes the default
-- template, exactly matching today's actual behavior (every certificate
-- used this one image) until an admin optionally uploads dedicated ones.
update public.certificate_templates ct
  set file_url = old.file_url, file_name = old.file_name, updated_at = old.updated_at, updated_by = old.updated_by
  from public.certificate_template old
  where ct.key = 'default' and old.id = true and old.file_url is not null;

alter table public.certificate_templates enable row level security;

drop policy if exists ct_read_signedin on public.certificate_templates;
create policy ct_read_signedin on public.certificate_templates
  for select using (auth.uid() is not null);

drop policy if exists ct_admin_all on public.certificate_templates;
create policy ct_admin_all on public.certificate_templates
  for all using (is_admin()) with check (is_admin());

-- Fully superseded - nothing else references it (no foreign keys point at
-- it), and its one row's data was already carried over above.
drop table if exists public.certificate_template;
