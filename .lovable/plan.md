# Final Licensing, Activation, Device & Admin Audit — Implementation Plan

This is a large, multi-batch effort. Below is the proposed execution plan. I will work in sequenced batches; each batch ends with verification before the next begins.

Before starting Batch 0, please add the following requirements.

### 1. Device Registration Enforcement

Every device must be registered in the database before using the application.

A device that does not exist in the devices table must never receive access.

Device registration should happen automatically on first launch.

Store:

- device_id
- fingerprint
- app_instance_id
- first_seen_at
- last_seen_at
- app_version
- platform

### 2. Real Device Lifecycle

Each device must always be in one of the following states:

- trial
- pending_activation
- active
- suspended
- revoked
- blocked

The admin must be able to see the current lifecycle state for every device.

The device must never exist without a state.

### 3. Full Device Ownership Tracking

For every device show:

- Device ID
- User
- Registration date
- First activation date
- Current license
- Current trial
- Last sync
- Last activity
- Current status

I want complete visibility over every device using the application.

### 4. Scalability Validation

This application may eventually serve thousands of devices.

Please verify:

- indexes exist on all lookup columns
- heartbeat queries remain efficient
- device-sync remains efficient
- admin dashboard queries remain efficient
- monitoring queries remain efficient

Include recommendations if any table may become a bottleneck when scaling.

Add this review to the final PRODUCTION_READINESS report.

## Batch 0 — Audit & Inventory (read-only, no code changes)

Produce a written audit report covering:

- Every entry point that can grant app access (Index, Activation, Auth, Trial guard, License hooks).
- Every place the client makes a licensing/trial/role decision locally.
- Current Supabase tables, RPCs, edge functions, RLS policies relevant to license/device/trial/activation/audit.
- Gaps vs. the 14 requirements you listed.

Deliverable: `docs/AUDIT_REPORT.md` with a checklist mapping each requirement → current state → required change.

## Batch 1 — Database hardening (one migration)

- Add missing columns/indexes:
  - `licenses`: ensure `device_id` is NOT NULL for `status='active'` (partial constraint), already-existing unique index kept.
  - `activations`: ensure `device_id`, `user_id`, `status`, `decided_by`, `decided_at`, `decision_reason`.
  - `trials`: ensure `device_id`, `user_id`, `started_at`, `expires_at`, `status` (`active|expired|cancelled|converted`), `extended_by_days`.
  - `devices`: ensure `is_blocked`, `is_banned`, `block_reason`, `last_sync_at`, `last_activity_at`, `app_version`, `platform`, `fingerprint`.
  - `audit_logs`: ensure `old_values`, `new_values` jsonb.
- New RPCs (SECURITY DEFINER, admin-gated via `has_role`):
  - `admin_set_license_status(license_id, status, reason)`
  - `admin_extend_license(license_id, new_expiry)`
  - `admin_convert_license(license_id, permanent boolean, expiry)`
  - `admin_block_device(device_id, reason)` / `admin_unblock_device(device_id)`
  - `admin_extend_trial(device_id, days)` / `admin_end_trial(device_id)` / `admin_convert_trial(device_id, license_id)`
  - `admin_decide_activation(request_id, decision, license_id?, expiry?, reason?)`
  - `device_heartbeat(device_id, fingerprint, app_version, platform)` — updates `last_sync_at`/`last_activity_at` and returns authoritative state (trial, license, device, blocks).
- Audit triggers on `licenses`, `devices`, `trials`, `activations`, `user_roles` writing to `audit_logs` with `old_values`/`new_values`.
- Force Update System

- minimum_supported_version
- latest_version
- force_update_enabled
- maintenance_mode

Devices running versions below the minimum supported version must be blocked and redirected to update.

## Batch 2 — Edge functions (server is source of truth)

- Rewrite `device-sync` to return authoritative `{trial, license, device, blocked, reason}` payload using `device_heartbeat`.
- Rewrite `check-license` to require `device_id` + `fingerprint`, return same shape.
- New `request-activation` (or update existing) to create `activations` row + audit log; idempotent per device.
- New `admin-decide-activation` calling the RPC.
- `admin-create-license` already validated; tighten to **require** `device_id` (no pending licenses unless explicitly flagged) per your rule "Every license must belong to a specific device."

## Batch 3 — Client gating (no bypass path)

- Create `src/lib/access-guard.ts`: single async resolver that:
  1. Reads cached server state from IndexedDB.
  2. If online, calls `device-sync` heartbeat; updates cache.
  3. Returns one of: `trial_active | license_active | trial_expired | license_expired | revoked | blocked | not_registered | mismatch | pending_activation`.
- `App.tsx` wraps protected routes with `<RequireAccess>` that uses the guard. Only `trial_active`/`license_active` reach the app; everything else routes to `/activation` with a clear reason.
- Remove any client-side override of license/trial/role (audit `trial-guard.ts`, `license.ts`, `license-system.ts`, `license-sync.ts`).
- `/activation` simplified to two actions: **Request activation** | **Enter license key**. No copy-link/manual share flows. Auto-polls heartbeat every 20s while open; enters app on approval.

## Batch 4 — Unified Admin Console

Single page `/sys-panel` with left rail + detail pane (not 7 disconnected tabs):

- **Overview**: live counts, alerts (mismatch attempts, unsynced >X days, failed activations).
- **Users**: list → detail showing devices, trial, licenses, activation requests, transfers, last activity, last sync, audit history. Actions: block/unblock, force logout, end trial, activate/deactivate license.
- **Devices**: list → detail showing user, trial, license, activations, syncs, security events. Full untruncated IDs with copy button, search, filters. Actions: block/unblock, revoke license.
- **Licenses**: list → detail showing user, device, activations, expiry, audit. Actions: activate, deactivate, suspend, reactivate, revoke, extend, change expiry, convert permanent↔temporary, block/unblock device.
- **Activations**: queue with approve/reject/extend trial/activate-until-date/suspend/block-device in one panel.
- **Trials**: list → detail. Extend/reduce/end/convert/block.
- **Monitoring**: live active users + security feed.
- **Users & Roles**: existing manager, linked from user detail.

Cross-linking: clicking a user/device/license anywhere navigates to its detail pane.

## Batch 5 — Offline-first sync

- Audit `supabase-sync.ts` queue: transfers, contacts, activation requests, trial events queued offline; flushed on reconnect.
- Client never writes authoritative license/trial/device state — only mirrors server.
- Add connectivity listener that triggers heartbeat on reconnect.

## Batch 6 — Arabic encoding audit

- Grep source for mojibake patterns (`Ã`, `Ø`, replacement char `\uFFFD`).
- Verify `i18n.ts` strings, build output, Android string resources.
- Fix any corruption found.

## Batch 7 — Verification & report

- Run vitest suite; add tests for access-guard state machine and admin RPCs.
- Playwright run against localhost: trial → expiry → request activation → admin approve → enter app; revoke → blocked; mismatch attempt → denied + audit.
- Supabase linter; RLS check on every touched table.
- Produce `docs/PRODUCTION_READINESS.md` with: fixed issues, remaining issues, DB/RPC/edge-function/RLS verification tables, test report, final **READY / NOT READY** verdict with evidence.

---

## Out of scope (call out explicitly)

- Visual redesign of non-admin pages.
- Payment flow / Stripe.
- Reworking Capacitor native trial plugin internals (only its server reconciliation).
- New translation languages.

## How I will proceed

I'll execute batches in order. Each batch ends with a short status note and the next batch starts automatically — I won't stop between batches unless something needs your decision. Batches 1, 2 involve a DB migration (you'll approve it inline) and edge-function deploys (automatic).

Reply **go** to start at Batch 0, or tell me which batches to skip/reorder.