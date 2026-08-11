-- ============================================================================
-- 20260814000001_fix_license_state_consistency.sql
--
-- Ensures profiles.license_status / license_type / expiry_date / trial_start /
-- trial_end can NEVER contradict each other, for every user, forever.
--
-- ROOT CAUSE FIXED (live DB audit, 2026-08-11)
--   admin_set_license(license_status='permanent', license_type='trial',
--   expiry_date=NULL) was accepted and left stale trial_start/trial_end behind,
--   producing a profile that was simultaneously "permanent" and "trial".
--   The license_type_overhaul migration (20260808000003) recreated
--   admin_set_license WITHOUT the trial-date handling that 20260731000001 had,
--   and no validation constrained the status<->type<->dates combination.
--   The same gap left stale trial dates on PAID users after an activation
--   approval, and validate_device_session never returned trial_start/trial_end
--   so the offline cache could not enforce the trial boundary locally.
--
-- CONTENT
--   1. Repair existing rows (all profiles audited; conflicts normalized).
--   2. BEFORE INSERT OR UPDATE trigger on profiles → canonical state on EVERY
--      write path (RPCs, edge functions, direct updates). No future conflict.
--   3. Recreate admin_set_license with coherent status<->type<->date rules.
--   4. Clear stale trial dates in admin_approve_activation /
--      admin_modify_activation when a user leaves the trial.
--   5. validate_device_session now returns trial_start/trial_end so the client
--      offline transfer guard can enforce the trial boundary locally.
--
-- CANONICAL STATE (single source of truth = profiles)
--   permanent → license_type='lifetime', expiry_date=NULL, no trial dates
--   trial     → license_type='trial',    expiry_date=NULL, trial dates present
--   active    → paid type (year_1/2/3/custom_date/lifetime*) + expiry_date
--   other     → (expired/revoked/blocked/rejected/pending/inactive/suspended)
--               no active trial dates
--   * 'lifetime' under status 'active' is normalized to 'permanent' (lifetime
--     is only representable as a permanent license).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REPAIR EXISTING DATA
-- ----------------------------------------------------------------------------

-- 1a. permanent → lifetime, undated, never carries trial dates
UPDATE public.profiles
SET license_type = 'lifetime', expiry_date = NULL, trial_start = NULL, trial_end = NULL
WHERE license_status = 'permanent';

-- 1b. trial → trial type, no expiry_date, trial dates guaranteed present
UPDATE public.profiles
SET license_type = 'trial', expiry_date = NULL,
    trial_start = COALESCE(trial_start, created_at, now()),
    trial_end   = COALESCE(trial_end, (COALESCE(trial_start, created_at, now()) + INTERVAL '15 days'))
WHERE license_status = 'trial';

-- 1c. active (paid) users must not carry stale trial dates
UPDATE public.profiles
SET trial_start = NULL, trial_end = NULL
WHERE license_status = 'active' AND (trial_start IS NOT NULL OR trial_end IS NOT NULL);

-- 1d. active + lifetime is contradictory → lifetime means permanent
UPDATE public.profiles
SET license_status = 'permanent', license_type = 'lifetime', expiry_date = NULL
WHERE license_status = 'active' AND license_type = 'lifetime';

-- 1e. active must have a paid license type
UPDATE public.profiles
SET license_type = CASE WHEN expiry_date IS NOT NULL THEN 'custom_date' ELSE 'year_1' END
WHERE license_status = 'active' AND license_type = 'trial';

-- 1f. all other statuses → no active trial dates
UPDATE public.profiles
SET trial_start = NULL, trial_end = NULL
WHERE license_status NOT IN ('trial', 'active', 'permanent')
  AND (trial_start IS NOT NULL OR trial_end IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 2. NORMALIZATION TRIGGER (enforcement on every write path)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_license_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.license_status = 'permanent' THEN
    NEW.license_type := 'lifetime';
    NEW.expiry_date := NULL;
    NEW.trial_start := NULL;
    NEW.trial_end := NULL;
  ELSIF NEW.license_status = 'trial' THEN
    NEW.license_type := 'trial';
    NEW.expiry_date := NULL;
    IF NEW.trial_start IS NULL THEN
      NEW.trial_start := COALESCE(NEW.created_at, now());
    END IF;
    IF NEW.trial_end IS NULL THEN
      NEW.trial_end := NEW.trial_start + INTERVAL '15 days';
    END IF;
  ELSE
    -- active / expired / revoked / rejected / pending / inactive / suspended
    -- never carry an active trial.
    NEW.trial_start := NULL;
    NEW.trial_end := NULL;
    IF NEW.license_status = 'active' THEN
      IF NEW.license_type IS NULL OR NEW.license_type = 'trial' THEN
        NEW.license_type := CASE WHEN NEW.expiry_date IS NOT NULL THEN 'custom_date' ELSE 'year_1' END;
      ELSIF NEW.license_type = 'lifetime' THEN
        NEW.license_status := 'permanent';
        NEW.license_type := 'lifetime';
        NEW.expiry_date := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_license_state ON public.profiles;
CREATE TRIGGER trg_normalize_license_state
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_license_state();

-- ----------------------------------------------------------------------------
-- 3. RECREATE admin_set_license — coherent status<->type<->date rules
--    (restores the trial-date handling that 20260808000003 dropped and adds
--     status/type coherence on top)
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
  _eff_status public.license_status;
  _eff_type public.license_type;
  _eff_expiry DATE;
  _existing_type public.license_type;
BEGIN
  _admin_id := public._require_admin();

  -- Resolve a coherent (status, type, expiry) triple from the request.
  -- The chosen STATUS is the primary intent; type is derived from it.
  -- lifetime under 'active' is the admin UI's "permanent" option → permanent.
  IF _license_status = 'permanent' OR (_license_status = 'active' AND _license_type = 'lifetime') THEN
    _eff_status := 'permanent';
    _eff_type   := 'lifetime';
    _eff_expiry := NULL;
  ELSIF _license_status = 'trial' THEN
    _eff_status := 'trial';
    _eff_type   := 'trial';
    _eff_expiry := NULL;
  ELSIF _license_status = 'active' THEN
    _eff_status := 'active';
    _eff_type   := CASE WHEN _license_type IS NULL OR _license_type = 'trial' THEN 'year_1' ELSE _license_type END;
    _eff_expiry := _expiry_date;
  ELSE
    -- expired / revoked / rejected / pending / inactive / suspended / blocked
    SELECT license_type INTO _existing_type FROM public.profiles WHERE user_id = _target_user_id;
    _eff_status := _license_status;
    _eff_type   := CASE WHEN _license_type IS NULL OR _license_type = 'trial'
                        THEN COALESCE(_existing_type, 'year_1')
                        ELSE _license_type END;
    _eff_expiry := _expiry_date;
  END IF;

  UPDATE public.profiles
  SET
    license_status = _eff_status,
    license_type = _eff_type,
    expiry_date = _eff_expiry,
    trial_start = CASE
      WHEN _eff_status = 'trial' AND trial_start IS NULL THEN now()
      ELSE trial_start
    END,
    trial_end = CASE
      WHEN _eff_status = 'trial' THEN GREATEST(now() + INTERVAL '15 days', COALESCE(trial_end, now() + INTERVAL '15 days'))
      ELSE NULL
    END,
    account_status = CASE
      WHEN _eff_status IN ('active', 'permanent', 'trial') THEN 'active'
      WHEN _eff_status IN ('suspended', 'blocked') THEN _eff_status::TEXT
      ELSE account_status
    END,
    updated_at = now()
  WHERE user_id = _target_user_id;

  INSERT INTO public.admin_actions (admin_id, action, target_type, target_id, details)
  VALUES (
    _admin_id, 'set_license', 'user', _target_user_id::TEXT,
    jsonb_build_object(
      'license_status', _eff_status::TEXT,
      'license_type', _eff_type::TEXT,
      'expiry_date', _eff_expiry,
      'notes', _notes
    )
  );
  RETURN jsonb_build_object('success', true);
END; $$;

-- ----------------------------------------------------------------------------
-- 4. admin_approve_activation / admin_modify_activation — clear stale trial
--    dates when a user leaves the trial (approval → paid/lifetime).
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
      trial_start = NULL,
      trial_end = NULL,
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
      trial_start = NULL,
      trial_end = NULL,
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
-- 5. validate_device_session — include trial_start/trial_end in the success
--    response so the offline cache can enforce the trial boundary locally.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_device_session(_device_id TEXT)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
  _now CONSTANT TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'profile_not_found',
      'error', 'لم يتم العثور على الملف الشخصي / Profile not found'
    );
  END IF;

  IF _profile.account_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_suspended',
      'error', 'الحساب موقوف / Account suspended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.account_status = 'blocked' THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'account_blocked',
      'error', 'الحساب محظور / Account blocked',
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_' || _profile.license_status,
      'error', CASE _profile.license_status
        WHEN 'expired' THEN 'انتهت صلاحية الترخيص / License expired'
        WHEN 'rejected' THEN 'تم رفض التفعيل / Activation rejected'
        WHEN 'blocked' THEN 'الترخيص محظور / License blocked'
        WHEN 'revoked' THEN 'تم إلغاء الترخيص / License revoked'
        WHEN 'pending' THEN 'الترخيص قيد المراجعة / License pending review'
        WHEN 'inactive' THEN 'الترخيص غير مفعل / License inactive'
        ELSE 'الترخيص غير صالح / Invalid license'
      END,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  IF _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'trial_expired',
      'error', 'انتهت الفترة التجريبية / Trial period ended',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'trial_end', _profile.trial_end
    );
  END IF;

  IF _profile.expiry_date IS NOT NULL AND _profile.license_status != 'permanent' AND _profile.expiry_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'license_expired',
      'error', 'انتهت صلاحية الترخيص / License expired',
      'license_status', _profile.license_status, 'account_status', _profile.account_status,
      'expiry_date', _profile.expiry_date
    );
  END IF;

  IF _profile.current_device IS NOT NULL AND _profile.current_device != _device_id THEN
    RETURN jsonb_build_object(
      'valid', false, 'reason', 'device_mismatch',
      'error', 'هذا الحساب مسجل على جهاز آخر / This account is registered on another device',
      'current_device', _profile.current_device,
      'license_status', _profile.license_status, 'account_status', _profile.account_status
    );
  END IF;

  -- Record the last successful server validation for admin visibility.
  UPDATE public.profiles SET last_sync = _now WHERE user_id = auth.uid();

  RETURN jsonb_build_object(
    'valid', true, 'reason', 'ok',
    'user_id', _profile.user_id, 'email', _profile.email, 'display_name', _profile.display_name,
    'license_status', _profile.license_status, 'license_type', _profile.license_type,
    'expiry_date', _profile.expiry_date, 'current_device', _profile.current_device,
    'account_status', _profile.account_status,
    'trial_start', _profile.trial_start, 'trial_end', _profile.trial_end,
    'trial_remaining_days', CASE WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM _profile.trial_end - _now)::INTEGER) ELSE NULL END,
    'is_locked', CASE WHEN _profile.account_status IN ('suspended', 'blocked') THEN true
      WHEN _profile.license_status = 'trial' AND _profile.trial_end IS NOT NULL AND _profile.trial_end < _now THEN true
      WHEN _profile.license_status IN ('expired', 'rejected', 'blocked', 'revoked', 'pending', 'inactive') THEN true ELSE false END
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_device_session FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.validate_device_session TO authenticated;
