-- Fix: Enable RLS on game_points_corrections audit table
--
-- Security Advisor finding: rls_disabled_in_public
-- Table created in migration 0193 without RLS, exposing sensitive audit data
-- (student point corrections) to anonymous and authenticated users.
--
-- Access model: Backend-only / Admin-only.
--   - Written by SECURITY DEFINER migration functions (0193, 0194) which bypass RLS.
--   - No frontend code reads this table.
--   - Teachers/admins may need to view corrections for auditing.

alter table public.game_points_corrections enable row level security;

-- Teachers and admins can view correction audit logs
create policy "Teachers and admins can view game_points_corrections"
  on public.game_points_corrections
  for select
  using (
    public.is_teacher() or public.is_admin()
  );

-- No INSERT/UPDATE/DELETE policies.
-- Direct client access is blocked by RLS.
-- The SECURITY DEFINER migration functions (0193, 0194) bypass RLS
-- and will continue to write correction records.