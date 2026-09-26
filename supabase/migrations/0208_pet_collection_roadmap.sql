-- Migration 0200: Pet Collection roadmap / future pet catalog.
-- The pet_definitions schema (0196) already supports future pets via
-- release_date/expiry_date; only one pet is active at a time. This migration
-- seeds clearly-marked PLACEHOLDER future pets so the Pet Collection page can
-- show a long-term progression roadmap. These rows have NO pet_parts and are
-- not active until their release_date, so claiming/active-pet logic is
-- unaffected. Real pet names, art, and body-part schedules are added later
-- (per month) — these placeholders are intentionally generic.
-- No schema change, no RPC change, no security change.

insert into public.pet_definitions (key, name, description, icon, release_date, expiry_date)
values
  ('october_2026_pet', 'October Pet', 'A future collectible pet — unlocks in October.', '🐱', '2026-10-01', '2026-10-31'),
  ('november_2026_pet', 'November Pet', 'A future collectible pet — unlocks in November.', '🐶', '2026-11-01', '2026-11-30'),
  ('december_2026_pet', 'December Pet', 'A future collectible pet — unlocks in December.', '🦊', '2026-12-01', '2026-12-31')
on conflict (key) do nothing;
