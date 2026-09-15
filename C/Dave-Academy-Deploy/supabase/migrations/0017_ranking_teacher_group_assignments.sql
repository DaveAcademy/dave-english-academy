-- Ranking redesign, step 1 of 7: which levels a teacher is allowed to
-- award points for. Doesn't exist today - every teacher currently has
-- uniform read access to every student/level (see students_teacher_read
-- in 0003), so awarding points is scoped narrower than that on purpose.
--
-- Seeded with every existing teacher -> all three levels, so cutover does
-- not silently strip access teachers already have today; an administrator
-- narrows this per-teacher afterward through the new admin UI.

create table if not exists public.teacher_group_assignments (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  level text not null check (level in ('A', 'B', 'C')),
  created_at timestamptz not null default now(),
  unique (teacher_id, level)
);

alter table public.teacher_group_assignments enable row level security;

drop policy if exists tga_admin_all on public.teacher_group_assignments;
create policy tga_admin_all on public.teacher_group_assignments
  for all using (is_admin()) with check (is_admin());

drop policy if exists tga_teacher_select_own on public.teacher_group_assignments;
create policy tga_teacher_select_own on public.teacher_group_assignments
  for select using (teacher_id = auth.uid());

insert into public.teacher_group_assignments (teacher_id, level)
select p.id, lvl
from public.profiles p, unnest(array['A', 'B', 'C']) as lvl
where p.role = 'teacher'
on conflict (teacher_id, level) do nothing;
