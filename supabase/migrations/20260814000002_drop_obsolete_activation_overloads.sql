-- ============================================================================
-- 20260814000002_drop_obsolete_activation_overloads.sql
--
-- The license_type_overhaul migration (20260808000003) intended to remove the
-- old days-based parameter from admin_approve_activation / admin_modify_activation
-- ("Removes _duration_days parameter, adds _expiry_date"), but CREATE OR REPLACE
-- only replaces the SAME signature. The obsolete overloads from
-- 20260801000001_emergency_stabilize.sql (_duration_days INTEGER) still exist in
-- production alongside the current (_expiry_date DATE) overloads.
--
-- WHY THIS MATTERS
--   * Calling the function with an untyped NULL literal (e.g. lifetime approval
--     where expiry is NULL) raises:
--       ERROR: function admin_approve_activation(uuid, text, integer, text) is
--              not unique
--     because PostgreSQL cannot choose between the two overloads.
--   * The old overload writes license_type = 'days_30'/'days_90'/... which does
--     NOT exist in the license_type enum, so even if it resolved it would fail
--     with an invalid enum value.
--   * The admin UI (ActivationRequests.tsx) always sends _expiry_date and never
--     _duration_days; nothing in the codebase or edge functions calls the old
--     signature.
--
-- FIX: drop the obsolete overloads. Safe, matches the original intent, and
-- removes the ambiguity for the activation system permanently.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_approve_activation(
  _request_id UUID,
  _license_type TEXT,
  _duration_days INTEGER,
  _notes TEXT
);

DROP FUNCTION IF EXISTS public.admin_modify_activation(
  _request_id UUID,
  _license_type TEXT,
  _duration_days INTEGER,
  _notes TEXT
);
