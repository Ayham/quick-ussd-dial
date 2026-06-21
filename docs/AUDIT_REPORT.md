# Batch 0 — Licensing / Activation / Device / Admin Audit Report

Date: 2026-06-21
Scope: read-only audit. No code changed in this batch.

## 1. Access entry points (every place that can grant the app)

| # | Location | What it does | Trust level | Issue |
|---|----------|--------------|-------------|-------|
| 1 | `src/App.tsx` `checkStatus()` → `getAppStatus()` | Reads **local** `license.ts` state to decide whether to render `<Index>` or `<Activation>`. | Client-only | Bypassable. Server is consulted only opportunistically via `verifyLicenseOnline()` and only flips to `blocked` on `revoked`. Expired/mismatch/not-registered states are not enforced from server. |
| 2 | `src/lib/license.ts` `getAppStatus()` | Combines `native-trial` + local cached license. | Client-only | Returns `licensed` if local cache says so even if server has revoked/expired. |
| 3 | `src/lib/trial-guard.ts` | Reads `native-trial` via Capacitor plugin, stores in `Preferences`, detects tamper if `daysLeft` increases. | Client-only | Once trial passes, no server reconciliation. Reinstall on a new device starts a fresh trial — server never asked. |
| 4 | `src/lib/license-sync.ts` / `syncLicense()` | Pulls server license, writes into local cache. | Server → client mirror | Good direction, but `getAppStatus` still falls back to local cache when offline and there is no "server says revoked, cache must be invalidated" path. |
| 5 | `supabase/functions/check-license` | Calls `activate_license` then `validate_license` RPC. | Server-authoritative | `validate_license` RPC is referenced but **does not exist** in the project's `pg_functions` listing — only `activate_license` and `admin_set_role` exist. This function will 500. |
| 6 | `supabase/functions/device-sync` | Upserts device, ingests events, returns license + device state. | Server-authoritative | Does not enforce `device_fingerprint`, does not return trial state, does not check `device_bans`. Returned `license` is the most recently updated row for the device, not the active one. |
| 7 | `src/pages/Activation.tsx` | Lets user enter a key or request activation. | Client UI | Activation request path exists; relies on `request-activation` edge function. |
| 8 | `src/pages/Auth.tsx` + `RequireAuth` | Supabase Auth gate. | Server-authoritative | OK. |
| 9 | `RequireAdmin` (`auth-session.tsx`) | Uses `has_role()` RPC. | Server-authoritative | OK. |

**Conclusion:** the app has a single client-side decision (`getAppStatus`) that gates every protected route. The server is consulted only as a side-channel, so any of the blocked states from your requirement #1 (revoked, suspended, mismatch, not_registered) can be bypassed by clearing local storage or by going offline.

## 2. Where the client makes its own license/trial/role decisions

| File | Decision | Should move to server |
|------|----------|-----------------------|
| `src/lib/license.ts` `getAppStatus()` | Final licensed/expired/blocked verdict | **Yes** |
| `src/lib/trial-guard.ts` | Trial countdown and tamper detection | Keep local for offline, but reconcile with server-side `trials` row on every heartbeat |
| `src/lib/license-system.ts` `adminGenerateLicenses()` (still imported by admin UI) | Direct `licenses` INSERT from the browser using anon JWT | **Yes** — already have `admin-create-license` edge function; remove the client path |
| `src/lib/license-sync.ts` | Writes server values into cache (OK) but also persists `status` overrides on conflicts | Keep read-only |
| `src/lib/activation-request.ts` | Posts to `request-activation`; on offline, queues locally. OK pattern. | Keep |

## 3. Database surface (relevant tables)

Counts and policies as of audit:

| Table | Cols | Policies | Notes |
|-------|------|----------|-------|
| `licenses` | 15 | 2 | Has `device_fingerprint`, unique partial idx `(device_id) WHERE status='active'`. `status` enum: `active|expired|pending|revoked` — missing `suspended` required by requirement #7. |
| `devices` | 23 | 4 | Has `is_blocked`, `is_banned`. No explicit `lifecycle_state` column — must be derived. |
| `trials` | 9 | 2 | Exists; need to confirm `status`, `extended_by_days`. |
| `activations` | 13 | 2 | Exists. |
| `audit_logs` | 11 | 2 | Used by `activate_license` RPC. `old_values`/`new_values` columns need confirmation. |
| `device_bans` | 7 | 2 | Separate from `devices.is_blocked`; double source of truth — risk of drift. |
| `user_roles`, `profiles`, `sessions`, `sync_logs`, `notifications`, `subscription_plans`, `system_config` | — | — | Supporting tables present. |

## 4. Database functions present vs. required

Present: `activate_license`, `admin_set_role`, `has_role`, `enforce_device_limit`, `detect_device_cloning`, `handle_new_user`, `update_updated_at_column`.

**Missing** (required by plan + your additions):
- `validate_license` — referenced by `check-license` edge function (will 500).
- `device_heartbeat` — central authoritative read used by client gating.
- `admin_set_license_status`, `admin_extend_license`, `admin_convert_license`.
- `admin_block_device`, `admin_unblock_device`.
- `admin_extend_trial`, `admin_end_trial`, `admin_convert_trial`.
- `admin_decide_activation`.
- Audit triggers on `licenses`, `devices`, `trials`, `activations`, `user_roles` writing `old_values`/`new_values`.

## 5. Edge functions present vs. required

| Function | Status | Action required |
|----------|--------|-----------------|
| `admin-create-license` | OK, but currently allows `device_id=null` (`status='pending'`). | Tighten: require `device_id`. |
| `check-license` | Calls non-existent `validate_license`. | Either implement RPC or rewrite to a single `device_heartbeat` call. |
| `device-sync` | Does not return trial, does not enforce fingerprint, does not enforce minimum app version. | Rewrite to call `device_heartbeat` and return `{trial, license, device, blocked, reason, force_update}`. |
| `request-activation` | Exists; not audited in this batch. | Confirm idempotency per device. |
| `admin-bootstrap`, `admin-reset-user`, `migrate-from-sheets` | Operational utilities. | Keep, audit RLS/role checks. |
| `admin-decide-activation` | Missing. | Create. |

## 6. Admin UI vs. requirement #3 (unified console)

Current `src/pages/Admin.tsx` = 7 disconnected tabs. No cross-linking. Devices manager truncates IDs (per your report). No "view user → see devices/licenses/trial/audit" panel. Trials manager exists but cannot convert trial → license. Activations manager exists but cannot block device in the same panel.

**Gap:** entire UI shell needs to be rebuilt around `user → device → license` graph navigation.

## 7. Offline-first review

- `supabase-sync.ts` queue exists and flushes on reconnect (good).
- `license-sync.ts` listens for `online` event (good).
- `getAppStatus` does **not** treat "offline + cache says licensed" any different from "online + server says licensed". Server revocations are invisible until next online check. That is acceptable per your requirement #12 (server is source of truth when online) but the moment a heartbeat succeeds, the client must replace its cache atomically; today it merges, which can preserve stale `active` status.

## 8. Arabic / encoding

Not audited yet (Batch 6). Quick grep deferred until then.

## 9. Scalability spot-check (your added requirement #4)

Indexes verified to exist on: `licenses(license_key)` unique, `licenses(device_id) WHERE status='active'` unique partial. Missing/likely-missing:
- `devices(user_id)`, `devices(last_seen)`, `devices(is_blocked)`.
- `transfers(device_id, created_at desc)` for monitoring queries.
- `audit_logs(target_user_id, created_at desc)`, `audit_logs(device_id, created_at desc)`.
- `activations(status, created_at desc)` for admin queue.
- `sync_logs(device_id, created_at desc)`.

Without these, the admin dashboard at thousand-device scale will degrade. Batch 1 will add them.

## 10. Requirements → status matrix

| Req | Status | Where it lands |
|-----|--------|----------------|
| 1. Core business rule (only trial/temp/perm grants access) | ❌ | Batch 3 (`access-guard`) |
| 2. Supabase = source of truth | ❌ partial | Batch 1+2+3 |
| 3. Unified admin | ❌ | Batch 4 |
| 4. Device-based licensing | ⚠ partial — column exists, enforcement gaps | Batch 1+2 |
| 5. Trial system admin controls | ⚠ partial — UI exists, RPCs missing | Batch 1+4 |
| 6. Activation flow | ⚠ partial — UI ok, server decisions missing | Batch 2+3 |
| 7. License administration | ❌ — many actions client-side or missing | Batch 1+4 |
| 8. Active user monitoring | ❌ | Batch 4 |
| 9. Device monitoring (full IDs, copy) | ❌ truncated today | Batch 4 |
| 10. Monitoring & security alerts | ❌ | Batch 4 + audit triggers |
| 11. Audit logging w/ old/new values | ⚠ partial | Batch 1 triggers |
| 12. Offline-first | ⚠ partial | Batch 5 |
| 13. Arabic audit | not started | Batch 6 |
| 14. Production readiness | not started | Batch 7 |
| Added: device registration enforcement | ❌ today auto-creates on heartbeat without rejecting unknowns | Batch 1+2 |
| Added: device lifecycle column | ❌ | Batch 1 |
| Added: full device ownership tracking | ⚠ partial | Batch 1+4 |
| Added: scalability indexes | ❌ | Batch 1 |
| Added: force-update / maintenance mode | ❌ | Batch 1+2 |

## 11. Risks / things that will break during the rework

- `src/lib/license-system.ts` is imported by `LicensesManager`, `Activation.tsx`, and `license-history.ts`. Moving all writes to RPCs/edge functions will require touching all three.
- The unique partial index on `licenses` already blocks two active rows for one device — good — but means converting a license between users requires explicit revoke first.
- `enforce_device_limit` trigger uses `subscription_plans.code`/`id` join; if `licenses.plan` is null for ad-hoc admin-created licenses, the limit is effectively 1. Need to revisit when admin grants extra device slots.
- Auth keys in `db/portable/` mirror the live edge functions; will keep them in sync.

---

## Recommendation

Audit complete. Before Batch 1 (one large migration) please confirm:

1. **Suspended status** — add `'suspended'` to the `licenses.status` allowed values? (required by your req #7)
2. **Device lifecycle column** — store explicitly on `devices.lifecycle_state` (`trial|pending_activation|active|suspended|revoked|blocked`) rather than derive?
3. **Force-update table** — add to `system_config` as rows, or new `app_versions` table?
4. **Activation auto-trial** — should a brand-new device get a `trials` row server-side on first heartbeat, or only after explicit registration call?

Reply with answers (or "your call") and I'll execute Batch 1.
