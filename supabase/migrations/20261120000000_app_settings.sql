-- Global application settings (single-row-per-key store).
-- Currently holds 'website_font'. Readable by everyone (students and
-- teachers need the font too); writable by administrators only.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
  on public.app_settings for select
  using (true);

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write"
  on public.app_settings for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.app_settings (key, value)
values ('website_font', 'Plus Jakarta Sans')
on conflict (key) do nothing;
