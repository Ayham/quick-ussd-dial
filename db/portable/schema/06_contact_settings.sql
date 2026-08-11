-- =============================================================================
-- Centralized contact information ("تواصل معنا") used by the About page.
--
-- Storage: one row in the EXISTING public.system_config table under the key
-- 'contact_settings'. No new table is created — this reuses the central
-- configuration store already used by app_update_policy / expiration_policy.
--
-- Two RPCs, following the exact existing patterns:
--   1. get_contact_settings()              -> SECURITY DEFINER read for ALL
--      authenticated users (public read). Mirrors get_update_policy(): the
--      system_config table itself is admin-read-only via RLS, so a definer
--      RPC is the sanctioned way to expose public configuration.
--   2. admin_update_contact_settings(...)  -> SECURITY DEFINER + _require_admin()
--      write, mirrors the admin_* RPC architecture (audit log included).
--
-- Offline-first note: the client keeps a local cache under
-- "app_contact_settings" and only refreshes it when online. This migration
-- does not change any license / trial / auth / USSD behaviour.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Public read RPC (same shape as public.get_update_policy()).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contact_settings()
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
   WHERE key = 'contact_settings';

  RETURN jsonb_build_object(
    'whatsapp_enabled', COALESCE((v_value->>'whatsapp_enabled')::boolean, false),
    'whatsapp_number',  COALESCE(v_value->>'whatsapp_number', ''),
    'whatsapp_url',     COALESCE(v_value->>'whatsapp_url', ''),
    'email_enabled',    COALESCE((v_value->>'email_enabled')::boolean, false),
    'email_address',    COALESCE(v_value->>'email_address', ''),
    'facebook_enabled', COALESCE((v_value->>'facebook_enabled')::boolean, false),
    'facebook_url',     COALESCE(v_value->>'facebook_url', ''),
    'updated_at',       COALESCE(v_value->>'updated_at', '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_contact_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_settings() TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Admin write RPC (guarded by _require_admin(), audit-logged, bumps
--    updated_at / updated_by server-side). Mirrors admin_create_notification
--    and friends.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_contact_settings(
  p_whatsapp_enabled BOOLEAN DEFAULT false,
  p_whatsapp_number  TEXT DEFAULT NULL,
  p_whatsapp_url     TEXT DEFAULT NULL,
  p_email_enabled    BOOLEAN DEFAULT false,
  p_email_address    TEXT DEFAULT NULL,
  p_facebook_enabled BOOLEAN DEFAULT false,
  p_facebook_url     TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_value jsonb;
  v_updated_at text;
BEGIN
  v_admin := public._require_admin();

  v_value := jsonb_build_object(
    'whatsapp_enabled', COALESCE(p_whatsapp_enabled, false),
    'whatsapp_number',  NULLIF(btrim(COALESCE(p_whatsapp_number, '')), ''),
    'whatsapp_url',     NULLIF(btrim(COALESCE(p_whatsapp_url, '')), ''),
    'email_enabled',    COALESCE(p_email_enabled, false),
    'email_address',    NULLIF(btrim(COALESCE(p_email_address, '')), ''),
    'facebook_enabled', COALESCE(p_facebook_enabled, false),
    'facebook_url',     NULLIF(btrim(COALESCE(p_facebook_url, '')), ''),
    'updated_at',       now()
  );

  INSERT INTO public.system_config (key, value, description, updated_by, updated_at)
  VALUES ('contact_settings', v_value,
          'Centralized contact information shown in the About page (WhatsApp / Email / Facebook)', v_admin, now())
  ON CONFLICT (key) DO UPDATE
    SET value      = EXCLUDED.value,
        description = EXCLUDED.description,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  v_updated_at := v_value->>'updated_at';

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'contact_settings_update', 'system_config', 'contact_settings',
          jsonb_build_object(
            'whatsapp_enabled', p_whatsapp_enabled,
            'email_enabled',    p_email_enabled,
            'facebook_enabled', p_facebook_enabled,
            'updated_at',       v_updated_at
          ));

  RETURN jsonb_build_object('ok', true, 'updated_at', v_updated_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_contact_settings(
  BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_update_contact_settings(
  BOOLEAN, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Seed a sane default (all channels disabled) if no row exists yet.
--    Admins enable what they want from the admin panel.
-- -----------------------------------------------------------------------------
INSERT INTO public.system_config (key, value, description)
VALUES (
  'contact_settings',
  '{"whatsapp_enabled":false,"whatsapp_number":"","whatsapp_url":"","email_enabled":false,"email_address":"","facebook_enabled":false,"facebook_url":"","updated_at":""}'::jsonb,
  'Centralized contact information shown in the About page (WhatsApp / Email / Facebook)'
)
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Post-apply sanity checks (run manually):
--   SELECT public.get_contact_settings();
-- =============================================================================
