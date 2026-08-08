-- =============================================================================
-- Fix missing unique constraint on user_roles(user_id, role)
-- admin_set_role uses ON CONFLICT (user_id, role) which requires this index.
-- =============================================================================

-- Deduplicate first (keep the lowest id per (user_id, role))
DELETE FROM public.user_roles ur
USING public.user_roles dup
WHERE dup.user_id = ur.user_id
  AND dup.role = ur.role
  AND dup.id < ur.id;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key
  ON public.user_roles (user_id, role);
