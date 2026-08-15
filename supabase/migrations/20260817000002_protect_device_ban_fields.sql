-- ============================================================================
-- F7: a user can currently clear their own device's ban flags.
--
-- The devices table has the policy "Users update own device"
-- (with_check = auth.uid() = user_id) which lets any user UPDATE their own
-- row and flip is_blocked / is_banned / ban_reason / block_reason /
-- lifecycle_state back to a usable state, undoing admin blocks/bans.
--
-- Fix: BEFORE UPDATE trigger that raises 42501 whenever a non-admin
-- authenticated caller changes any of the protected ban/lifecycle columns.
--
-- Bypass rules (safe, mirrors trg_protect_profile_sensitive_fields):
--   - Admin flows: admin_* RPCs are SECURITY DEFINER and call _require_admin();
--     auth.uid() is the admin -> has_role() -> allowed.
--   - Service role (edge functions: device binding, ban enforcement writes):
--     auth.uid() is NULL -> check skipped.
--   - SQL editor / operator: runs as postgres, auth.uid() is NULL -> allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_device_ban_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL
     AND NOT public.has_role(v_uid, 'admin'::public.app_role)
     AND (
       NEW.is_blocked       IS DISTINCT FROM OLD.is_blocked
       OR NEW.is_banned     IS DISTINCT FROM OLD.is_banned
       OR NEW.ban_reason    IS DISTINCT FROM OLD.ban_reason
       OR NEW.block_reason  IS DISTINCT FROM OLD.block_reason
       OR NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     ) THEN
    RAISE EXCEPTION 'not_allowed_to_change_device_ban_fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_device_ban_fields ON public.devices;
CREATE TRIGGER trg_protect_device_ban_fields
  BEFORE UPDATE ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_device_ban_fields();
