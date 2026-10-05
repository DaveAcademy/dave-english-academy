-- Personal theme override per user (NULL = inherit the site default from
-- app_settings.website_theme). Owner-writable via the existing
-- profiles_update_own policy; no RLS changes needed (row-level policies).

alter table public.profiles
  add column if not exists theme text default null;

comment on column public.profiles.theme is
  'Personal theme override (light/dark/system); NULL inherits the site default.';
