-- =============================================================================
-- Migration: Cleanup Stale & Duplicate Devices
-- Removes old/duplicate device records from public.devices where a user has
-- multiple devices, keeping only their active `profiles.current_device` (or the
-- most recently seen device if current_device is not set).
-- =============================================================================

DO $$
DECLARE
  v_deleted int := 0;
BEGIN
  -- 1. Delete device records where the device is NOT the user's current active device
  DELETE FROM public.devices d
  USING public.profiles p
  WHERE d.user_id = p.user_id
    AND p.current_device IS NOT NULL
    AND d.device_id <> p.current_device;

  -- 2. For users who have multiple devices in public.devices and current_device is null/unmatched,
  -- keep only the single most recently seen device and delete older duplicates.
  WITH ranked_devices AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id 
             ORDER BY COALESCE(last_seen_at, last_seen, updated_at, created_at) DESC
           ) as rn
    FROM public.devices
    WHERE user_id IS NOT NULL
  )
  DELETE FROM public.devices
  WHERE id IN (SELECT id FROM ranked_devices WHERE rn > 1);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Stale and duplicate devices cleaned up successfully. Deleted count: %', v_deleted;
END $$;
