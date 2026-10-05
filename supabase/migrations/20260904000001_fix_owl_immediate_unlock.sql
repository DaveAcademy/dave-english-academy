-- Fix: Make active Owl's parts immediately collectible
-- The September Owl's 8 parts were staggered to 09-08/15/22, leaving the first week with nothing claimable.
-- Stage 21 requires the active pet's parts to be earned through learning NOW, not future-dated.
-- Future monthly pets can remain date-gated; only the currently active pet is fixed.

update public.pet_parts
set unlock_date = '2026-09-01'
where pet_id = (select id from public.pet_definitions where key = 'september_2026_owl')
  and unlock_date > '2026-09-01';
