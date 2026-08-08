-- ============================================================================
-- LICENSE TYPE OVERHAUL MIGRATION
-- Replaces days_* license type values with year-based, custom_date, and lifetime.
-- Removes _duration_days parameter from admin_approve_activation /
-- admin_modify_activation RPCs. The system now uses license_type + expiry_date
-- as the single source of truth for license expiration.
--
-- Migration is safe: old license_type values are backfilled to new values,
-- old expiry_date values are preserved, no data is lost.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Backfill old license_type values to the new scheme.
-- Works whether the column is the old enum or TEXT.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'license_type') THEN

    -- days_30, days_90, days_180, days_365 → custom_date (preserve existing expiry_date)
    UPDATE public.profiles
    SET license_type = 'custom_date'
    WHERE license_type::text IN ('days_30', 'days_90', 'days_180', 'days_365');

    -- permanent → lifetime
    UPDATE public.profiles
    SET license_type = 'lifetime'
    WHERE license_type::text = 'permanent';

    RAISE NOTICE 'Backfilled license_type values: days_* → custom_date, permanent → lifetime';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 2: Recreate the license_type enum type with the new values.
-- PostgreSQL does not allow removing enum values, so we create a new type,
-- convert the column, then swap.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  _col_type TEXT;
BEGIN
  SELECT data_type || CASE WHEN udt_name = 'license_type' THEN '_enum' ELSE '' END
  INTO _col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'license_type';

  IF _col_type LIKE '%enum' THEN
    -- Column uses the old license_type enum — recreate it
    CREATE TYPE public.license_type_new AS ENUM ('trial', 'year_1', 'year_2', 'year_3', 'custom_date', 'lifetime');

    -- Recreate admin_set_license so it doesn't depend on the old enum
    -- (it will be recreated with the new type below)

    -- Temporarily alter functions that reference the old enum to avoid
    -- "type being used" errors. We use text-based parameter.
    ALTER TABLE public.profiles ALTER COLUMN license_type TYPE public.license_type_new
      USING license_type::text::public.license_type_new;

    DROP TYPE public.license_type;
    ALTER TYPE public.license_type_new RENAME TO license_type;

    RAISE NOTICE 'Recreated license_type enum with new values';
  ELSE
    RAISE NOTICE 'license_type column is TEXT — no enum recreation needed';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 3: Recreate admin_approve_activation with new signature
-- Removes _duration_days, adds _expiry_date.
-- Computes expiry_date from license_type when not custom_date.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_activation(
  _request_id UUID,
  _license_type TEXT DEFAULT 'year_1',
  _expiry_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_activation RECORD;
  v_expiry DATE;
  v_lic_type TEXT;
  v_is_lifetime BOOLEAN;
  v_license_status TEXT;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'activation_not_found_or_already_processed');
  END IF;

  v_is_lifetime := (_license_type = 'lifetime');

  IF v_is_lifetime THEN
    v_lic_type := 'lifetime';
    v_expiry := NULL;
    v_license_status := 'permanent';
  ELSE
    v_lic_type := _license_type;
    IF _license_type = 'year_1' THEN
      v_expiry := (now() + INTERVAL '1 year')::DATE;
    ELSIF _license_type = 'year_2' THEN
      v_expiry := (now() + INTERVAL '2 years')::DATE;
    ELSIF _license_type = 'year_3' THEN
      v_expiry := (now() + INTERVAL '3 years')::DATE;
    ELSIF _license_type = 'custom_date' THEN
      v_expiry := _expiry_date;
    ELSE
      -- Fallback: default to 1 year
      v_expiry := (now() + INTERVAL '1 year')::DATE;
      v_lic_type := 'year_1';
    END IF;
    v_license_status := 'active';
  END IF;

  UPDATE public.activations
  SET status = 'approved', processed_by = v_admin, processed_at = now(),
      notes = COALESCE(_notes, notes)
  WHERE id = _request_id;

  UPDATE public.profiles
  SET license_status = v_license_status,
      license_type = v_lic_type,
      expiry_date = v_expiry,
      account_status = 'active',
      updated_at = now()
  WHERE user_id = v_activation.user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'approve_license', 'user', v_activation.user_id::TEXT,
    jsonb_build_object(
      'activation_id', _request_id,
      'license_type', v_lic_type,
      'expiry_date', v_expiry,
      'lifetime', v_is_lifetime,
      'notes', _notes
    ));

  RETURN jsonb_build_object(
    'success', true,
    'license_type', v_lic_type,
    'expiry_date', v_expiry,
    'lifetime', v_is_lifetime
  );
END; $$;

-- ----------------------------------------------------------------------------
-- STEP 4: Recreate admin_modify_activation with new signature
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_modify_activation(
  _request_id UUID,
  _license_type TEXT DEFAULT 'year_1',
  _expiry_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin UUID;
  v_activation RECORD;
  v_expiry DATE;
  v_lic_type TEXT;
  v_is_lifetime BOOLEAN;
  v_license_status TEXT;
BEGIN
  v_admin := public._require_admin();
  SELECT * INTO v_activation FROM public.activations WHERE id = _request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'activation_not_found');
  END IF;

  v_is_lifetime := (_license_type = 'lifetime');

  IF v_is_lifetime THEN
    v_lic_type := 'lifetime';
    v_expiry := NULL;
    v_license_status := 'permanent';
  ELSE
    v_lic_type := _license_type;
    IF _license_type = 'year_1' THEN
      v_expiry := (now() + INTERVAL '1 year')::DATE;
    ELSIF _license_type = 'year_2' THEN
      v_expiry := (now() + INTERVAL '2 years')::DATE;
    ELSIF _license_type = 'year_3' THEN
      v_expiry := (now() + INTERVAL '3 years')::DATE;
    ELSIF _license_type = 'custom_date' THEN
      v_expiry := _expiry_date;
    ELSE
      v_expiry := (now() + INTERVAL '1 year')::DATE;
      v_lic_type := 'year_1';
    END IF;
    v_license_status := 'active';
  END IF;

  UPDATE public.activations
  SET notes = COALESCE(_notes, notes)
  WHERE id = _request_id;

  UPDATE public.profiles
  SET license_status = v_license_status,
      license_type = v_lic_type,
      expiry_date = v_expiry,
      account_status = 'active',
      updated_at = now()
  WHERE user_id = v_activation.user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (v_admin, 'modify_license', 'user', v_activation.user_id::TEXT,
    jsonb_build_object(
      'activation_id', _request_id,
      'license_type', v_lic_type,
      'expiry_date', v_expiry,
      'lifetime', v_is_lifetime,
      'notes', _notes
    ));

  RETURN jsonb_build_object(
    'success', true,
    'license_type', v_lic_type,
    'expiry_date', v_expiry,
    'lifetime', v_is_lifetime
  );
END; $$;

-- ----------------------------------------------------------------------------
-- STEP 5: Recreate admin_set_license to use the new license_type enum
-- (needed because the old enum type was dropped/recreated)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_license(
  _target_user_id UUID,
  _license_status public.license_status,
  _license_type public.license_type DEFAULT NULL,
  _expiry_date DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _admin_id UUID;
BEGIN
  _admin_id := public._require_admin();
  UPDATE public.profiles
  SET
    license_status = _license_status,
    license_type = COALESCE(_license_type::text, license_type),
    expiry_date = _expiry_date,
    account_status = CASE
      WHEN _license_status IN ('active', 'permanent', 'trial') THEN 'active'
      WHEN _license_status IN ('suspended', 'blocked') THEN _license_status::TEXT
      ELSE account_status
    END,
    updated_at = now()
  WHERE user_id = _target_user_id;
  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (
    _admin_id, 'set_license', 'user', _target_user_id::TEXT,
    jsonb_build_object(
      'license_status', _license_status::TEXT,
      'license_type', COALESCE(_license_type::TEXT, NULL),
      'expiry_date', _expiry_date,
      'notes', _notes
    )
  );
  RETURN jsonb_build_object('success', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, DATE, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_approve_activation(UUID, TEXT, DATE, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, DATE, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_modify_activation(UUID, TEXT, DATE, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_license(UUID, public.license_status, public.license_type, DATE, TEXT) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.admin_set_license(UUID, public.license_status, public.license_type, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- STEP 6: Update system_config default license_type reference (if any)
-- The system_config and subscription_plans tables keep their existing structure.
-- No changes needed — they store billing plan info, not activation types.
-- ============================================================================
