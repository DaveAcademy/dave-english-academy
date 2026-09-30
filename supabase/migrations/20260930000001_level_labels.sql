-- Level display labels: admin-renamable names for the academy's level
-- groups (A/A1/B/C). The `level` key itself is NEVER renamed - it stays
-- the stable value in students.level, lessons.level, RLS policies, fees,
-- and every query. Only this label changes what users see on screen.
--
-- Same RLS shape as the groups table (20260921000000): everyone signed in
-- reads, only administrators write (is_admin(), see 0003).

create table if not exists public.level_labels (
  level text primary key,
  label text not null,
  updated_at timestamptz not null default now()
);

alter table public.level_labels enable row level security;

drop policy if exists level_labels_read_all on public.level_labels;
create policy level_labels_read_all on public.level_labels
  for select using (auth.uid() is not null);

drop policy if exists level_labels_admin_all on public.level_labels;
create policy level_labels_admin_all on public.level_labels
  for all using (is_admin()) with check (is_admin());

-- Seed the current on-screen names so a fresh database renders exactly
-- what the app showed before this migration (no visible change until an
-- admin renames a level).
insert into public.level_labels (level, label) values
  ('A', 'Level A'),
  ('A1', 'Level A1'),
  ('B', 'Level B'),
  ('C', 'Level C')
on conflict (level) do nothing;
