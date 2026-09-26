-- Migration 0201: Rename starter pet from personal name to species type
-- Changes "Kumush the Owl" to "Owl" per requirements:
-- "Every student should receive a free permanent starter pet."
-- "Use species/type names only."
-- "Do NOT call a pet 'Kumush' or another invented personal name."
--
-- This migration renames the existing starter pet definition.
-- The key 'september_2026_owl' is preserved; only the name changes.

-- Rename the starter pet from "Kumush the Owl" to "Owl"
UPDATE public.pet_definitions
SET name = 'Owl',
    description = 'September''s starter pet - collect all 8 body parts to complete your owl!'
WHERE key = 'september_2026_owl';

-- Verify the update
SELECT key, name, description FROM public.pet_definitions WHERE key = 'september_2026_owl';