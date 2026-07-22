-- =============================================================================
-- 02_post_hardening.sql
-- Consolidated deltas shipped AFTER the original portable bundle
-- (00_full_schema.sql + 01_final_device_authority_hardening.sql).
--
-- Apply order: 00 → 01 → 02.
--
-- Contents:
--   1. Contacts sync (client_id, phone_normalized, updated_at trigger, unique keys)
--   2. Admin-RPC lockdown (revoke EXECUTE on SECURITY DEFINER fns from authenticated)
--   3. has_role() EXECUTE grant to authenticated (required by every RLS policy)
--   4. Performance / scalability indexes
--   5. Security-hardened policies for account_lockouts, sync_conflicts,
--      sync_metrics, system_config
--   6. Trigger wiring for detect_device_cloning + enforce_device_limit
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Contacts sync additions
-- ---------------------------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS client_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS device_id text;

-- backfill and enforce
UPDATE public.contacts
   SET phone_normalized = regexp_replace(phone, '[^0-9+]', '', 'g')
 WHERE phone_normalized IS NULL;
ALTER TABLE public.contacts ALTER COLUMN phone_normalized SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_client_uk
  ON public.contacts (user_id, client_id);
CREATE INDEX IF NOT EXISTS contacts_user_phone_idx
  ON public.contacts (user_id, phone_normalized);
CREATE INDEX IF NOT EXISTS contacts_device_idx
  ON public.contacts (device_id);

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Admin-RPC lockdown — revoke EXECUTE on SECURITY DEFINER admin fns from
--    authenticated / anon / PUBLIC. These are only reachable through the
--    `admin-rpc` edge function (service_role).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'admin_extend_license(uuid,date)',
    'admin_convert_license(uuid,boolean,date)',
    'admin_extend_trial(text,integer)',
    'admin_end_trial(text)',
    'admin_convert_trial(text,uuid)',
    'admin_decide_activation(uuid,text,uuid,text)',
    'admin_set_role(uuid,app_role,boolean)',
    'admin_unblock_device(text)',
    'admin_set_license_status(uuid,text,text)',
    'admin_block_device(text,text)',
    'admin_transfer_license(uuid,text,text)',
    '_require_admin()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END$$;

-- ---------------------------------------------------------------------------
-- 3. has_role() must remain callable by authenticated (used in every policy).
--    Also runnable by anon so anon-visible policies don't error.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

-- Public heartbeat + license endpoints (called through service_role edge fns,
-- but also safe for authenticated callers).
GRANT EXECUTE ON FUNCTION public.device_heartbeat(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_license(text, text, text)         TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.activate_license(text, text, text)         TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Scalability indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS transfers_user_created_idx        ON public.transfers (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_device_created_idx      ON public.transfers (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_operator_status_idx     ON public.transfers (operator, status);
CREATE INDEX IF NOT EXISTS app_events_user_created_idx       ON public.app_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_device_created_idx     ON public.app_events (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx              ON public.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx             ON public.audit_logs (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS licenses_user_idx                 ON public.licenses (user_id);
CREATE INDEX IF NOT EXISTS licenses_device_idx               ON public.licenses (device_id);
CREATE INDEX IF NOT EXISTS licenses_status_idx               ON public.licenses (status);
CREATE INDEX IF NOT EXISTS devices_user_idx                  ON public.devices (user_id);
CREATE INDEX IF NOT EXISTS devices_fingerprint_idx           ON public.devices (device_fingerprint);
CREATE INDEX IF NOT EXISTS trials_device_idx                 ON public.trials (device_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx       ON public.notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS sync_logs_device_created_idx      ON public.sync_logs (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_conflicts_user_idx           ON public.sync_conflicts (user_id, resolved);
CREATE INDEX IF NOT EXISTS activations_status_idx            ON public.activations (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Security-hardened policies
-- ---------------------------------------------------------------------------

-- account_lockouts: admin only (writes are service_role via edge functions)
DROP POLICY IF EXISTS account_lockouts_public_select ON public.account_lockouts;
DROP POLICY IF EXISTS account_lockouts_authenticated_insert ON public.account_lockouts;
DROP POLICY IF EXISTS account_lockouts_admin_select ON public.account_lockouts;
DROP POLICY IF EXISTS account_lockouts_admin_all    ON public.account_lockouts;
CREATE POLICY account_lockouts_admin_select ON public.account_lockouts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY account_lockouts_admin_all ON public.account_lockouts
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- sync_conflicts / sync_metrics: prevent user_id spoofing
DROP POLICY IF EXISTS sync_conflicts_insert_self_bypass ON public.sync_conflicts;
DROP POLICY IF EXISTS sync_conflicts_owner_insert       ON public.sync_conflicts;
CREATE POLICY sync_conflicts_owner_insert ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sync_metrics_insert_self_bypass ON public.sync_metrics;
DROP POLICY IF EXISTS sync_metrics_owner_insert       ON public.sync_metrics;
CREATE POLICY sync_metrics_owner_insert ON public.sync_metrics
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- system_config: admin-read only
DROP POLICY IF EXISTS system_config_read_all_public       ON public.system_config;
DROP POLICY IF EXISTS system_config_read_authenticated    ON public.system_config;
DROP POLICY IF EXISTS system_config_read_admin            ON public.system_config;
CREATE POLICY system_config_read_admin ON public.system_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 6. Ensure trigger wiring for device lifecycle helpers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enforce_device_limit ON public.devices;
CREATE TRIGGER trg_enforce_device_limit
  BEFORE INSERT OR UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_device_limit();

DROP TRIGGER IF EXISTS trg_detect_device_cloning ON public.devices;
CREATE TRIGGER trg_detect_device_cloning
  AFTER INSERT OR UPDATE OF device_fingerprint, user_id ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.detect_device_cloning();

COMMIT;

-- =============================================================================
-- Post-apply sanity checks (run manually — see verify-migration.sh)
-- =============================================================================
-- SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosecdef;
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
--   AND tablename IN ('account_lockouts','sync_conflicts','sync_metrics','system_config');
