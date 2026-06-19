# Admin & Licensing Redesign

Goal: replace the local-password "sys-admin" with a single Supabase-Auth login, make licenses device-bound, and reduce the admin area to the features that actually matter (licenses, devices, activation requests, trials, monitoring, roles).

## 1. Authentication — one login for everyone

- Delete local admin password system: `src/lib/admin-auth.ts`, all references in `Admin.tsx`, `Activation.tsx`, settings, etc. Remove storage keys `_internal_v1_sys_dat`, `_sys_rt_ct_v1`, `_sys_rt_lk_v1`, the "7-click header" gesture, and hardcoded `Password@5@164`.
- Single login: `/auth` (Supabase email/password + Google).
- `/sys-panel` becomes admin-only via `RequireAdmin` (already exists) — uses `has_role(auth.uid(),'admin')` server-side. No client-side bypass.
- `useAuthSession` already validates JWT; keep it.

## 2. Device-bound licenses

Schema changes (migration):

- `licenses`: enforce one active license per device. Add unique partial index `(device_id) WHERE status='active'`. Make `device_id` required for `status='active'` (trigger).
- Add `device_fingerprint TEXT` to `licenses` (snapshot at activation).
- Activation RPC `activate_license(license_key, device_id, fingerprint)`:
  - locks the row, rejects if already bound to a different device, sets `activated_at`, `device_id`, `device_fingerprint`, `status='active'`.
- Validation RPC `validate_license(device_id, fingerprint)` returns status used by `check-license` edge function.
- Edge function `admin-create-license` already device-aware; keep but allow `device_id=null` (pending) — activation binds later.

## 3. Admin area — keep only these pages

Under `/sys-panel` tabs:

1. **Dashboard** — overview counters + today's activity + alerts (queries below).
2. **Licenses** — list, generate, revoke, extend, history.
3. **Devices** — list, activate, deactivate, block, unblock, view activity.
4. **Activation Requests** — list pending, approve (creates+binds license), reject.
5. **Trials** — list, extend, cancel, disable.
6. **Monitoring** — transfers / sync / events feed (read-only).
7. **Users & Roles** — list users, grant/revoke admin (via edge function using service role + `has_role` check).

Remove/retire: `CustomersManager` placeholder, `SyncStatusMonitor` duplicate, any unfinished tabs, the 7-click gesture and admin login dialog.

## 4. Dashboard queries (real data)

- Total users: `count(profiles)`
- Active users: distinct `user_id` in `sessions` last 30d
- Trial users: `count(trials where ends_at>now())`
- Active/blocked devices: `devices where is_active`, `where is_banned`
- Active/expired licenses: `licenses` grouped by status
- Pending activations: `activations where status='pending'`
- Today's transfers/activations/syncs: counts on `transfers`, `activations`, `sync_metrics` for `created_at::date = today`
- Failed syncs: `sync_metrics where status='error'` today
- Alerts: expired licenses, devices awaiting activation, trials expiring in 3d, recent sync errors

## 5. Offline + sync

- Keep `supabase-sync.ts` queue. Add license/device push: on each `device-sync` response, update local cache of license + device flags (already partly done).
- When admin revokes/blocks/extends, device picks it up on next `device-sync` (idempotent — server is source of truth).
- Activation requests created offline get queued and posted via `request-activation` edge function on reconnect.

## 6. Audit logging

- Edge functions write to `audit_logs` (actor, target, action, entity, metadata) for: license create/revoke/extend, device activate/deactivate/block/unblock, activation approve/reject, role grant/revoke, trial extend/cancel.
- Client logs login/logout/transfer/sync events to `app_events` (already partly wired).

## 7. User communication

Activation page + Subscription page + Profile show a clear notice:
"This license is bound to this device. Changing devices requires a new activation. Licenses are not transferred automatically."

## 8. Security cleanup

- Remove all `localStorage` admin keys and the PBKDF2 admin module.
- Remove client-only "isAdminAuthenticated" checks; rely on RLS + `RequireAdmin`.
- Keep encryption helpers only if used elsewhere (audit).
- Ensure RLS on every admin-touched table requires `has_role(auth.uid(),'admin')` for cross-user reads/writes.

## Technical details

Files to modify:

- `src/App.tsx` — `/sys-panel` already wrapped with `RequireAuth`; switch to `RequireAdmin`.
- `src/pages/Admin.tsx` — rebuild as 7-tab shell.
- `src/components/admin/*` — keep `DashboardOverview`, `LicensesManager`, `DevicesManager`, `ActivationsManager`, `TrialsManager`, `EventsViewer`, `TransfersViewer`; replace with real queries. Remove `CustomersManager`, `SyncStatusMonitor` (folded into Monitoring).
- New: `src/components/admin/UsersRolesManager.tsx`.
- `src/pages/Activation.tsx` — remove admin-credential gesture; show device-bound notice.
- `src/pages/Settings.tsx`, `src/components/AppLayout.tsx` — remove 7-click admin trigger; admin link only visible when `isAdmin`.
- Delete: `src/lib/admin-auth.ts` (and all imports).
- New edge function: `admin-grant-role` (admin-only, service role).
- New edge function or RPC: `activate_license` enforcing device binding.
- New migration:
  - `ALTER TABLE licenses ADD COLUMN device_fingerprint text`
  - `CREATE UNIQUE INDEX licenses_one_active_per_device ON licenses(device_id) WHERE status='active' AND device_id IS NOT NULL`
  - RPC `public.activate_license(...)` SECURITY DEFINER
  - RPC `public.admin_grant_role(target uuid, role app_role)` SECURITY DEFINER, checks `has_role(auth.uid(),'admin')`

## Out of scope

- Visual redesign of non-admin pages.
- Payments/Stripe flows.
- Multi-language audit of new strings (use existing i18n keys; add English-only fallback for new strings).

## Rollout

1. Migration (schema + RPCs).
2. Edge function updates (`activate_license` consumer, `admin-grant-role`).
3. Remove `admin-auth.ts` + all references; gate `/sys-panel` with `RequireAdmin`.
4. Rebuild Admin shell + wire each tab to real queries.
5. Activation page: device-bound notice + new activate flow.
6. Smoke test offline queue → online flush → admin sees event.

Reply **go** to apply, or tell me what to change.  
  
-Additional Requirement: Active User Monitoring

Please add an Active Users Monitoring section.

The administrator must be able to see in real time:

- Currently active users
- Last activity time
- Last login time
- Last synchronization time
- Current device
- Device ID
- Device status
- License status
- Trial status
- Number of transfers today
- Number of transfers this month

The administrator should be able to:

- View user details
- View device details
- View transfer history
- Block a user
- Unblock a user
- Disable a device
- Force logout a user
- End a trial immediately
- Activate or deactivate a license

Dashboard should display:

- Online users now
- Active users today
- Active users this week
- Users with expired licenses
- Users with trial ending soon
- Users not synchronized for more than X days

A user is considered active if:

- Logged in recently, or
- Performed a transfer recently, or
- Successfully synchronized recently.

Store activity information in the database and make it available through the Monitoring section and Dashboard.  
  
Other Notes:  
The following situations must be tested:

### Scenario A

User clears application data.

Expected result:

- License must still be validated from Supabase.
- Device must not become activated again automatically.

### Scenario B

User reinstalls application.

Expected result:

- Device must revalidate against cloud.
- Existing activation rules must still apply.

### Scenario C

User copies local files to another device.

Expected result:

- Activation rejected.
- Device mismatch logged.  


Admin must be able to:

- View all trial users.
- View trial devices.
- End trial immediately.
- Extend trial.
- Convert trial to licensed device.

Show:

- Trial start date.
- Trial end date.
- Remaining days.
- Device information.  
  


## Monitoring Must Be Unified

Do not split monitoring into multiple pages.

Create one Monitoring Center.

Show:

### Transfers

- Live transfer feed
- Daily totals
- Weekly totals
- Monthly totals

### Devices

- Online devices
- Offline devices
- Blocked devices

### Sync

- Successful syncs
- Failed syncs
- Queue status

### Security

- Activation failures
- Device mismatch attempts
- License violations

## 9. Dashboard Improvements

Dashboard must show:

### Overview

- Users
- Devices
- Active licenses
- Expired licenses
- Pending activations
- Trial users

### Activity

- Today's transfers
- Today's activations
- Today's syncs

### Alerts

- Expired licenses
- Devices awaiting activation
- Trials expiring soon
- Sync failures
- Security alerts

## 10. Offline First Requirements

The application must continue working offline.

When internet returns:

- Sync transfers
- Sync contacts
- Sync activation requests
- Sync device status
- Sync license status

Server remains the source of truth.

Client must never override:

- License state
- Device state
- Trial state
- User roles

## 11. Security Requirements

Remove completely:

- local admin passwords
- local admin storage
- hidden admin credentials
- PBKDF2 admin login system
- tap-to-open admin authentication

Keep only:

- Supabase Auth
- has_role()
- RLS
- Edge Functions

No client-side security decisions.

## 12. Final Acceptance Requirements

Before marking complete, provide proof that:

- Non-admin users cannot access sys-panel.
- Device licenses cannot be copied.
- Trial restrictions work.
- Activation requests work.
- Device block/unblock works.
- Role management works.
- Offline sync works.
- Sync does not create duplicates.
- Audit logs are generated correctly.
- All admin pages display real data.
- No placeholder pages remain.