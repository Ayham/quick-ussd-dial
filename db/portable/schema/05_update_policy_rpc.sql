-- =============================================================================
-- 05_update_policy_rpc.sql
-- Server-controlled app update policy (mandatory/optional).
--
-- Apply order: 00 → 01 → 02 → 03 → 04 → 05.
--
-- The SERVER decides the minimum app version the client must run and,
-- optionally, the latest known version + direct download URL. The client reads
-- this via supabase.rpc("get_update_policy") and forces the update when the
-- installed version is below minimum_version.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

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

-- Seed the policy (edit freely with a plain UPDATE):
--   minimum_version : lowest app version the server accepts. "" = no force.
--   latest_version  : optional server-known latest version. "" = use GitHub.
--   download_url    : optional direct APK URL override. "" = use GitHub asset.
--   notes           : optional note shown in the Updates page.
INSERT INTO public.system_config (key, value, description) VALUES
  ('app_update_policy',
   '{"minimum_version":"","latest_version":"","download_url":"","notes":""}'::jsonb,
   'Server-controlled app update policy (minimum/latest version, download URL, notes)')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- =============================================================================
-- Post-apply sanity check (run manually):
-- SELECT public.get_update_policy();
-- =============================================================================
