
-- 1. account_lockouts: restrict SELECT to admins only
DROP POLICY IF EXISTS account_lockouts_public_select ON public.account_lockouts;
CREATE POLICY account_lockouts_admin_select ON public.account_lockouts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.account_lockouts FROM anon;

-- 2. system_config: restrict SELECT to authenticated
DROP POLICY IF EXISTS system_config_read_all ON public.system_config;
CREATE POLICY system_config_read_authenticated ON public.system_config
  FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.system_config FROM anon;

-- 3. sync_conflicts: WITH CHECK must be strictly self
DROP POLICY IF EXISTS sync_conflicts_insert_self ON public.sync_conflicts;
CREATE POLICY sync_conflicts_insert_self ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. sync_metrics: WITH CHECK must be strictly self
DROP POLICY IF EXISTS sync_metrics_insert_self ON public.sync_metrics;
CREATE POLICY sync_metrics_insert_self ON public.sync_metrics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5. SECURITY DEFINER functions: revoke default PUBLIC EXECUTE and re-grant only to
--    authenticated on user-facing RPCs. Triggers/internal helpers get no direct grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- User-facing RPCs signed-in users legitimately call (admin_* self-check via _require_admin)
GRANT EXECUTE ON FUNCTION public.activate_license(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_license(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.device_heartbeat(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_device(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_license(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_license_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_convert_license(uuid, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_license(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_end_trial(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_convert_trial(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_activation(uuid, text, uuid, text) TO authenticated;
