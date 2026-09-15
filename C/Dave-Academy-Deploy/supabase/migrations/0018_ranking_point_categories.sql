-- Ranking redesign, step 2 of 7: configurable point categories. An admin
-- can change default_points or deactivate a category later with no code
-- change. point_transactions (0019) stores the point value actually
-- awarded on each row, not a live lookup here, so editing a default in
-- this table never rewrites history.

create table if not exists public.point_categories (
  id bigint generated always as identity primary key,
  key text not null unique,
  name text not null,
  icon text,
  default_points numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.point_categories enable row level security;

drop policy if exists pc_admin_all on public.point_categories;
create policy pc_admin_all on public.point_categories
  for all using (is_admin()) with check (is_admin());

drop policy if exists pc_read_signedin on public.point_categories;
create policy pc_read_signedin on public.point_categories
  for select using (auth.uid() is not null);

insert into public.point_categories (key, name, icon, default_points, sort_order) values
  ('attendance', 'Attendance', '📋', 5, 1),
  ('homework', 'Homework', '📚', 10, 2),
  ('participation', 'Participation', '🗣️', 5, 3),
  ('speaking', 'Speaking', '💬', 5, 4),
  ('vocabulary', 'Vocabulary', '📖', 5, 5),
  ('exam', 'Test/Exam', '📝', 8, 6),
  ('behavior', 'Behavior', '⭐', 5, 7),
  ('bonus', 'Bonus', '🎁', 5, 8),
  ('penalty', 'Penalty', '⚠️', -5, 9),
  ('other', 'Other', '➕', 0, 10)
on conflict (key) do nothing;
