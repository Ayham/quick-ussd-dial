# Production Hardening Audit

Date: 2026-07-01

This report covers source code only. No Supabase migration, Edge Function,
Lovable Cloud release, web deployment, or Android release was applied or
verified.

## Completed In Source Code

- Replaced app access decisions with one cached `device_heartbeat` snapshot.
- Added a 72-hour bounded offline authorization window. Missing or stale server
  state blocks access.
- Removed legacy RSA, native-trial, Google Sheets license sync, public license
  generator, and client-side admin write paths.
- Added explicit device lifecycle enforcement:
  `trial`, `pending_activation`, `active`, `suspended`, `revoked`, `blocked`.
- Added owner, device fingerprint, license fingerprint, and app-instance
  security checks with audit/security events.
- Made heartbeat callable only by the service role through `device-sync`.
- Added semantic app-version checks, maintenance mode, forced update state, and
  latest/minimum version payloads.
- Made successful sync replace cached license/trial state atomically.
- Retained failed offline event IDs in the queue instead of dropping them.
- Added idempotent reconnect handling for transfers, contacts, activation
  requests, and application events.
- Routed license, trial, activation, transfer, block/unblock, and role actions
  through audited RPCs or admin Edge Functions.
- Removed destructive delete controls for devices, licenses, and activation
  history.
- License transfer now requires a registered target, cancels the old device
  trial, updates both lifecycle states, binds the target fingerprint, and
  preserves audit history.
- Added full device IDs throughout admin devices, licenses, trials,
  activations, transfers, and events.
- Added server-backed monitoring for active/blocked devices, active/suspended/
  revoked/expiring licenses, active/expiring trials, pending activations,
  failed syncs, and suspicious devices.
- Added normalized duplicate-aware contact create/edit/delete/search plus VCF,
  JSON, CSV, and Excel SpreadsheetML import/export.
- Replaced local-only reporting with a paged server report path supporting
  daily/weekly/monthly periods and operator, user, device, trial, license,
  status, access-source, and synchronization dimensions. Offline history
  remains available when the server cannot be reached.
- Added server-side report aggregation, chart data, bounded page sizes, and
  transfer indexes for large datasets.
- Fixed detected Arabic mojibake and retained RTL/mobile safe-area behavior.
- Removed license/trial/sync authority values from user backup import/export.
- Updated tests for lifecycle mapping, stale offline state, device mismatch,
  forced update, offline activation queue, and admin RPC routing.

## Database Changes

Migration:

`supabase/migrations/20260701213000_final_device_authority_hardening.sql`

The migration adds:

- `app_version_lt`
- `admin_set_license_level`
- hardened `admin_transfer_license`
- hardened six-argument `device_heartbeat`
- service-role-only `report_transfers`
- `app_events.client_id` idempotency support
- transfer operator/status reporting indexes
- lifecycle `NOT NULL`, default, and check constraint
- read-only Data API policies for protected lifecycle tables
- service-role-only heartbeat execution

Portable copy:

`db/portable/schema/01_final_device_authority_hardening.sql`

## Edge Function Changes

- `device-sync`: validates identity before metadata updates, logs suspicious
  identity changes, processes idempotent offline contacts/activations/transfers,
  preserves failed events, and delegates access state to heartbeat.
- `request-activation`: rejects owner mismatch and blocked devices, prevents
  duplicate activation of active devices, deduplicates pending requests, and
  writes audit logs.
- `reports`: authenticates the caller, limits non-admin users to their own
  records, validates filters, and invokes the bounded report RPC.

Portable Edge Function copies are byte-identical to the Supabase versions.

## Verification Results

- TypeScript: PASS
- `npm test`: PASS, 9 files / 27 tests
- `npm run build`: PASS
- `npm run lint`: PASS with 14 non-blocking hook/fast-refresh warnings
- `npm audit --omit=dev --audit-level=high`: PASS, zero vulnerabilities
- Android `testDebugUnitTest`: PASS, 1 test
- Android `assembleDebug`: PASS; debug APK generated locally
- Local development server: PASS, HTTP 200
- UTF-8/mojibake scan over source, Supabase, and Android XML: PASS
- Full identifier truncation scan in admin components: PASS
- Direct protected-table write scan in frontend: PASS

`npm run lint` is expected to pass after the final verification run. Generated
Android build output is excluded from lint.

## Remaining Gaps

- Migrations and functions have not been deployed or exercised against a real
  Supabase project.
- Android release signing, install/update behavior, status/navigation bars,
  contacts permission, calling, offline reconnect, and device identifier
  persistence require real-device testing.
- Visual layout, keyboard, safe-area, and permission behavior still require
  screenshot and interaction verification on supported physical devices.
- The 72-hour offline authorization cache is client-readable. A determined
  attacker controlling the application runtime can patch client code; final
  commercial hardening should add signed server authorization receipts and
  Android integrity/obfuscation controls.
- Dev-tool dependency audit still needs periodic maintenance even though the
  production dependency audit is clean.

## Audit Verdict

Source licensing and device authority: **READY FOR STAGING**.

Complete commercial release: **NOT READY** until deployment, live Supabase
verification, Android device testing, signing, and release validation are
completed.
