
# Option C (v2) — Portable Supabase Bundle + In-Place Production Upgrade

Scope grew significantly. Same two-track delivery model: every change goes (1) into Lovable Cloud Supabase via the migration tool so the app keeps working today, AND (2) into `db/portable/**` as plain SQL + docs so you can apply the exact same schema to your own Supabase project later.

Work is split into **8 sequential batches**. Each batch ends with a short status report (✅ done / ⚠️ needs manual step / ❌ open). Nothing is marked done without verification.

**Reminder:** the Supabase Personal Access Token you pasted earlier is still live. Rotate it at https://supabase.com/dashboard/account/tokens. I do not need it.

## Batch 1 — Foundation schema (+ portable bundle skeleton)

Goal: every table the app needs exists, with `client_id` for sync dedupe, indexes, `updated_at` triggers, GRANTs, RLS.

New / extended tables (Cloud + bundle):

- `contacts` — user phone book, deduped on `(user_id, phone_normalized)`
- `amount_presets` — per-user packages per operator (price + label + order)
- `sim_assignments` — per-device SIM slot → operator
- `subscription_plans` — catalog: name, duration_days, price, **max_devices**, features
- `payments` — manual + online activation records, admin-approval workflow
- `daily_summaries` — per-user/per-day rollups (transfers, revenue, success, failure)
- `audit_logs` — generic security/admin audit trail
- `app_settings` — per-user settings (key/value)
- `system_config` — global app config (USSD defaults, trial days, maintenance mode, min app version, feature flags, sheets URL, sync intervals)
- `notifications` — in-app per-user + admin notifications, read/unread
- `sync_conflicts` — duplicates / conflict / failed / retry attempts
- `sync_metrics` — duration, volume, success rate, last successful sync
- `failed_logins` — login attempt tracking
- `account_lockouts` — temporary lockout state
- `device_bans` — banned devices + reason + ban time
- `sessions` — active user/device sessions for admin force-logout

Extended `devices` columns (Cloud + bundle):
`android_id`, `device_fingerprint`, `app_instance_id`, `app_version`, `platform`, `last_ip`, `last_seen_at`, `is_banned`, `ban_reason`.

Bundle layout:

```text
db/portable/
  README.md
  MIGRATION.md          # full runbook
  schema/
    00_extensions.sql
    01_enums_and_functions.sql
    02_tables.sql
    03_indexes.sql
    04_triggers.sql
    05_grants_and_rls.sql
    06_seed.sql         # subscription_plans, default system_config, default ussd_codes
  edge-functions/       # copies of supabase/functions/*
  client.template.ts
  .env.example
```

## Batch 2 — RLS hardening, multi-device limits, anti-cloning

- Rewrite every policy with `auth.uid()=user_id` + admin override via `public.has_role(auth.uid(),'admin')`.
- Explicit GRANTs on every table (authenticated + service_role; anon only where strictly needed).
- **Server-side device-limit enforcement**: `enforce_device_limit()` trigger on `devices` inserts checks active count vs `user`'s active subscription `max_devices`; deny via RLS + trigger.
- **Anti-cloning trigger**: detects duplicate `device_fingerprint` or `android_id` across users → flags device, writes `audit_logs` row + admin `notifications` row.
- Force-logout via revoking session row + `device-sync` response signal.
- Run `supabase--linter` + `security--run_security_scan` → fix all high/critical.

## Batch 3 — Offline-first sync correctness + monitoring

- Extend local sync queue (`supabase-sync.ts`) to cover all entities; every event carries `client_id` UUID; edge function upserts on `(device_id, client_id)`.
- Backoff/retry with cap; `sync_metrics` row per flush; conflicts written to `sync_conflicts`.
- `useSyncStatus()` hook + persistent badge in `AppLayout` (Online / Syncing N / Offline N queued).
- Playwright check: offline → create transfer/contact → online → row appears, queue empties, no dupes on re-sync.

## Batch 4 — Auth, sessions, security hardening

- Confirm Google login via `lovable.auth.signInWithOAuth("google")` works on preview (Cloud managed creds). Email/password kept.
- **Failed-login tracking** + **account lockout** (N failures in M minutes → temporary block; admin can clear).
- **Session management**: write `sessions` row on login (user_id, device_id, ip, ua, last_seen); admin can force-logout from sys-panel.
- **Audit logs** for every admin action and security event.
- Edge-function-level basic protections on `request-activation`, `device-sync`, contacts import, login attempts. (Note: backend has no standard rate-limiting primitive — implementing per-IP counters in DB; flagged as ad-hoc not infrastructure.)

## Batch 5 — Subscriptions, activation, multi-device licensing

- Seed `subscription_plans`: Trial 14d (1 device), Monthly (2 devices), Quarterly (3 devices), Yearly (5 devices), Lifetime (10 devices).
- `payments` admin-approval workflow → on approve, create/extend `licenses`, set device active, emit notification.
- Activation request → `activations` (pending) + admin `notifications` (badge in sys-panel) → approve/reject → push status via `device-sync` response.
- License transfer between devices of same user (admin action, audit-logged).

## Batch 6 — `/sys-panel` enterprise upgrade (no empty pages)

Top-level tabs, each functional with search + pagination + row actions + CSV export + loading/empty/error states:

Dashboard (live KPIs), Users, **User Detail page** (profile + devices + licenses + activations + counts + revenue + last login/sync + audit history), Devices, **Device Detail page** (info + owner + license + last activity + sync history + security events + transfers), Contacts, Activations (pending badge), Subscriptions & Licenses, Payments, Transfers, Reports, Sync Logs / Conflicts / Metrics, USSD Codes, Operator Prefixes, Amount Presets, SIM Assignments, **System Config** (trial days, plans, device limits, sheets URL, sync intervals, maintenance mode, min app version, feature flags), Notifications, Audit Logs, Device Bans.

## Batch 7 — Contacts I/O + Advanced Reports + UI polish

- **Contacts import/export**: CSV + XLSX both directions. Phone normalization (Syrian prefixes), operator detection, duplicate detection, **preview before commit**, merge / replace / skip modes, import-result report.
- **Advanced Reports** built on `transfers` + `daily_summaries`:
  - Transfers: daily / weekly / monthly / yearly
  - Revenue: daily / monthly / by-user / by-device
  - Operators: MTN vs Syriatel transfers + revenue
  - Activity: most active users/devices, most used packages, failed transfers, failed syncs
  - Licensing: active / expired / pending / trial / trial→paid conversion rate
  - Sync: last sync status, devices offline > N days, queue health
- **Google Sheets demoted to export-only**: writes go to Supabase first; existing Sheets script becomes an export pull from Supabase, never a primary write.
- UI polish: modern mobile-first cards, RTL preserved, safe-area, loading/empty/error everywhere, sync badge, modernized Auth/Index/Transfer/Contacts.

## Batch 8 — Deep check, security scan, final acceptance

- Walk every route with Playwright; screenshot evidence; fix broken pages.
- Run `supabase--linter` + `security--run_security_scan`; fix all high/critical; document accepted findings in security memory.
- Verify each acceptance criterion below with evidence (screenshot / SQL result / scan output).
- Produce final `READY` / `NOT READY` verdict.

## Acceptance criteria (verdict gate)

Each item requires evidence before READY:

1. All admin pages functional, no empty/placeholder pages
2. Reports use real DB data (sample queries + screenshots)
3. Offline mode works (Playwright offline test)
4. Sync works (Playwright online flush)
5. Duplicate protection works (`client_id` upsert test)
6. Multi-device licensing enforced (trigger denial test)
7. Google login works (Playwright OAuth flow)
8. Contacts import/export works (sample file round-trip)
9. Subscriptions + activations work (admin approval flow test)
10. Security audit passes (scan output)
11. Playwright suite passes
12. Portable bundle complete (`db/portable/**` exists and self-contained)
13. Documentation complete (`MIGRATION.md` + this plan)

## Portability matrix

| Concern | Portable | Notes |
|---|---|---|
| All tables, indexes, triggers, functions, RLS, grants | ✅ | `db/portable/schema/*.sql` |
| Seed data (plans, system_config, ussd_codes) | ✅ | `06_seed.sql` |
| Edge function source | ✅ | `db/portable/edge-functions/` — deploy with `supabase functions deploy` |
| Email/password auth | ✅ | Standard Supabase Auth |
| Google OAuth | ⚠️ | On your project: add your own Google client ID/secret in Auth → Providers |
| Email templates | ⚠️ | Re-upload in your project; custom domain optional |
| `client.ts` / `types.ts` / `.env` | ⚠️ | Bundle ships `client.template.ts` + `.env.example`; regenerate types with `supabase gen types typescript` |
| `supabase/config.toml` project_id | ❌ | Cloud-managed; replace in your fork |
| `LOVABLE_API_KEY` (AI gateway) | ❌ | Lovable-only; if used, swap to your AI provider key |
| Frontend code under `src/` | ✅ | Plain React/TS, portable as-is |

## Technical notes

- All new tables follow project convention: `id uuid pk`, `user_id uuid` where applicable, `device_id text` for device-scoped rows, `client_id uuid` for sync dedupe, `created_at`, `updated_at`, RLS on, GRANTs to authenticated + service_role.
- `has_role(uuid, app_role)` SECURITY DEFINER stays the only privilege-check path.
- Server-side device limit + anti-cloning via triggers + RLS — never client-side.
- No Supabase Personal Access Token used or stored anywhere.
- Rate limiting is ad-hoc (per-IP counters in DB) because the backend has no standard primitive — flagged in the final report as known infra gap.

## Start

Reply **"go"** and I execute Batch 1 immediately. Subsequent batches follow automatically with a status report between each — stop me at any boundary.
