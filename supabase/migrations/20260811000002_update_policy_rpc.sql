-- =============================================================================
-- Update policy RPC — server-controlled mandatory/optional update policy.
--
-- The SERVER decides the minimum app version and, optionally, the download
-- URL / latest known version. The client reads this via
-- supabase.rpc("get_update_policy") and forces the update when the installed
-- version is below minimum_version.
--
-- Values are read from public.system_config ('app_update_policy'), which the
-- operator can edit with a plain UPDATE (see examples at the bottom).
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_update_policy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value jsonb;
BEGIN
  -- Anyone who can reach the app can read the policy (it is not sensitive).
  SELECT COALESCE(value, '{}'::jsonb) INTO v_value
    FROM public.system_config
   WHERE key = 'app_update_policy';

  RETURN jsonb_build_object(
    'minimum_version', COALESCE(v_value->>'minimum_version', ''),
    'latest_version',  COALESCE(v_value->>'latest_version', ''),
    'download_url',    COALESCE(v_value->>'download_url', ''),
    'notes',           COALESCE(v_value->>'notes', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_update_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_update_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_update_policy() TO service_role;

-- -----------------------------------------------------------------------------
-- Optional default seed (comment out / edit to taste):
--   minimum_version : lowest app version the server accepts. "" = no force.
--   latest_version  : optional server-known latest version. "" = use GitHub.
--   download_url    : optional direct APK URL override. "" = use GitHub asset.
--   notes           : optional note shown in the Updates page.
-- -----------------------------------------------------------------------------
-- INSERT INTO public.system_config (key, value, description) VALUES
--   ('app_update_policy',
--    '{"minimum_version":"1.0.6","latest_version":"1.0.6","download_url":"","notes":""}'::jsonb,
--    'Server-controlled app update policy')
-- ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Post-apply sanity check (run manually):
-- SELECT public.get_update_policy();
-- =============================================================================
