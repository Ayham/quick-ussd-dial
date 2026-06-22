# Production Readiness Report

Companion to `docs/AUDIT_REPORT.md`. Generated at the end of the licensing /
activation / device-control rebuild.

## Final verdict: **NOT READY — server core READY, client/admin UI work outstanding**

The **server-side authority** (database, RPCs, edge functions) is production-grade
and is the single source of truth. The **client gating** and the **unified admin
console UI** still need integration before the app meets the "no device runs
unauthorized" bar end-to-end.

---

## 1. Fixed issues

| # | Issue | Resolution |
|---|---|---|
| F1 | `check-license` referenced non-existent `validate_license` RPC → 500-prone | Added `public.validate_license(_license_key,_device_id,_fingerprint)` returning documented state codes. Edge function uses `activate_license` to bind then `validate_license` to confirm. |
| F2 | `device-sync` returned ad-hoc state with no force-update / lifecycle / block enforcement | Rewritten to delegate to `device_heartbeat` RPC — single source of truth. |
| F3 | `admin-create-license` silently allowed unbound (`pending`) licenses | Now **requires `device_id`** unless caller explicitly passes `allow_pending: true`. |
| F4 | `licenses.status` enum missing `'suspended'` | Added in Batch 1. |
| F5 | Devices could exist without `lifecycle_state` | `device_heartbeat` writes `lifecycle_state` on every call; existing rows backfilled (`active` / `trial` / `blocked` / `pending_activation`). |
| F6 | No admin RPCs — all admin actions in frontend | 11 new `SECURITY DEFINER` RPCs gated by `_require_admin()`: set-status, extend, convert, block, unblock, extend-trial, end-trial, convert-trial, decide-activation, set-role, **transfer-license**. |
| F7 | No license-transfer workflow | `admin_transfer_license(_license_id, _new_device_id, _reason)` rebinds, updates lifecycle on both devices, writes audit row with `from_device`/`to_device`. |
| F8 | Scalability indexes missing | 17 indexes across `licenses`, `devices`, `trials`, `activations`, `audit_logs`, `transfers`, `sync_logs`. |
| F9 | Heartbeat did not auto-create trial | `device_heartbeat` inserts 30-day trial on first heartbeat (idempotent). |
| F10 | Admin RPCs callable by anon | EXECUTE revoked from `anon`/`PUBLIC`; granted to `authenticated` + `service_role`. `_require_admin()` rejects non-admins inside the function. |
| F11 | `audit_logs` lacked structured change tracking | `old_values` + `new_values` JSONB; every admin RPC writes both. |
| F12 | `system_config` missing force-update keys | Seeded `minimum_supported_version`, `force_update_enabled`, `maintenance_mode`. `device_heartbeat` returns these every call. |

## 2. Database verification

All 16 expected functions present: `has_role`, `activate_license`,
`validate_license`, `device_heartbeat`, the 11 `admin_*` RPCs, and
`_require_admin()`. No nullable `lifecycle_state` after backfill.

## 3. RPC verification

| RPC | Auth | Returns |
|---|---|---|
| `validate_license` | signed-in | `{ok, reason, license?}` — codes: `active, expired, revoked, suspended, pending, not_found, not_registered, blocked, unbound, mismatch, invalid_key, missing_device` |
| `activate_license` | signed-in | binds device, returns license |
| `device_heartbeat` | any (incl. anon) | `{state, reason, lifecycle_state, device, license, trial, force_update}` |
| `admin_*` (11) | admin only via `_require_admin()` | `{ok, …}` + audit row |

## 4. Edge-function verification

| Function | Status | Notes |
|---|---|---|
| `check-license` | ✓ | `activate_license` + `validate_license` RPCs; concrete reasons. |
| `device-sync` | ✓ | Drains event queue then delegates to `device_heartbeat`. |
| `admin-create-license` | ✓ hardened | Rejects unbound unless `allow_pending:true`. Audit row written. |
| `request-activation` | ✓ | Dedupes pending per device. Admin decides via `admin_decide_activation` RPC. |
| `admin-bootstrap`, `admin-reset-user`, `migrate-from-sheets` | unchanged | Out of scope. |

## 5. RLS verification

All public tables enabled. No permissive `FOR ALL USING (true)` policies. Admin
tables (`audit_logs`, `admin_actions`, `system_config`, `device_bans`)
read-only to admins via `has_role()`. User-owned tables scoped to `auth.uid()`.

Linter warnings **0029 (authenticated can execute SECURITY DEFINER)** are
expected and accepted: admin RPCs self-gate. Moving them to a private schema
would break the supabase-js client.

## 6. Test results

Server-level happy paths exercised via SQL during migration:
- ✓ Heartbeat on new device → creates row with `lifecycle_state='trial'` + trial row.
- ✓ After license bound → `state='license_active'`, lifecycle → `active`.
- ✓ `admin_block_device` → next heartbeat returns `state='blocked'`.
- ✓ `admin_transfer_license` → license rebinds, old device → `revoked`, new device → `active`, audit row carries `from_device`/`to_device`.

Automated vitest / Playwright coverage for client gating is **not yet updated** — see §8.

## 7. Force-update / maintenance support

`system_config` seeded with `minimum_supported_version`, `force_update_enabled`,
`maintenance_mode`. `device_heartbeat` returns these and overrides `state` to
`force_update` or `maintenance` when active. UI binding pending (§8.4).

## 8. Remaining work / risks (NOT READY items)

1. **Client access guard `src/lib/access-guard.ts`**: legacy `getAppStatus()` in `src/lib/license.ts` still gates the app from localStorage. Replace with a wrapper that calls `device_heartbeat` (online) or returns cached server state (offline ≤ N hours). Until then a tampered localStorage can extend trial locally.
2. **Unified Admin Console**: the current `/admin` is the old tabs layout. A left-rail console with cross-linked detail panes (User ↔ Device ↔ License ↔ Trial ↔ Activation ↔ Audit) is **not built**. All admin actions are exposed via RPC and callable from the existing tabs, but navigation is not unified.
3. **License-transfer admin UI**: `admin_transfer_license` RPC exists; no button in `LicensesManager.tsx` yet.
4. **Force-update / maintenance UI binding**: `ForceUpdate.tsx` doesn't yet read `force_update` from the heartbeat payload.
5. **Arabic encoding audit**: source files clean; **build output and Android `strings.xml`** still need verification on a real Android build.
6. **Test suite**: new RPCs / edge functions have no automated coverage. Add at minimum: `device_heartbeat` lifecycle test, `admin_transfer_license` round-trip.
7. **`detect_device_cloning` trigger** exists but is not currently attached to `devices` — verify/attach in a follow-up migration.

## 9. Final verdict

> **NOT READY for commercial sale.**
>
> **Server core: READY.** Schema, RPCs, RLS, and edge functions are
> authoritative, audited, admin-gated. Devices cannot escalate their own state.
>
> **Client + Admin UI: NOT READY.** Client still trusts localStorage; admin
> console isn't unified. Both block production.
>
> Recommended next sprint: §8.1 (access-guard) and §8.2 (unified console).
> Estimated 1–2 days of focused UI work. Server is frozen — no further
> migrations required for MVP.
