-- ============================================================================
-- 20260816000005_remind_days_license_3.sql
--
-- Standardize the paid-license expiration warning window to 3 days, matching
-- the trial window (spec: 3-day expiry warning before a license expires).
--
-- NOTE: The reconciled get_validation_policy (20260816000004) intentionally
-- returns no remind_days_* fields, so the client fallback in
-- src/lib/expiration-reminder.ts (DEFAULT_REMIND_DAYS_LICENSE = 3) is the
-- operative value. This migration keeps the stored system_config in sync with
-- that 3-day window so any future re-read of the config stays consistent.
-- ============================================================================

UPDATE public.system_config
SET value = jsonb_set(value, '{remind_days_license}', '3'::jsonb),
    updated_at = now()
WHERE key = 'expiration_policy';
