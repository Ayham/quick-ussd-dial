# Licensing & Authentication System — Migration Document

## Database Changes

### Migration: `20260730000000_licensing_system.sql`

#### New Enum Types
- `license_type`: `trial`, `days_30`, `days_90`, `days_180`, `days_365`, `permanent`

#### Extended Enum Values
- `license_status` now includes: `trial`, `rejected`, `permanent`, `blocked` (in addition to existing `active`, `expired`, `revoked`, `pending`, `suspended`)

#### New Columns on `profiles` Table
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `trial_start` | TIMESTAMPTZ | NULL | When the 15-day trial started |
| `trial_end` | TIMESTAMPTZ | NULL | When the trial expires |
| `license_status` | license_status | `'trial'` | Current license state |
| `license_type` | license_type | `'trial'` | License plan type |
| `expiry_date` | DATE | NULL | License expiration date |
| `current_device` | TEXT | NULL | Currently active device ID |
| `last_login` | TIMESTAMPTZ | NULL | Last successful login timestamp |
| `last_sync` | TIMESTAMPTZ | NULL | Last sync with server |
| `account_status` | TEXT | `'active'` | Account state: active, suspended, blocked |

#### New Indexes
- `idx_profiles_license_status` on `profiles(license_status)`
- `idx_profiles_expiry_date` on `profiles(expiry_date)`
- `idx_profiles_account_status` on `profiles(account_status)`

#### Updated Trigger
- `handle_new_user()` now sets `trial_start = now()`, `trial_end = now() + 15 days`, `license_status = 'trial'`

#### New RPC Functions (13)

| Function | Description | Access |
|----------|-------------|--------|
| `get_user_license_status()` | Returns full license info for calling user | authenticated |
| `admin_get_all_users_license(search, status, page, page_size)` | Paginated admin user list | admin |
| `admin_set_license(target_user_id, status, type, expiry, notes)` | Set license for user | admin |
| `admin_extend_trial(target_user_id, extra_days)` | Extend trial by N days | admin |
| `admin_suspend_user(target_user_id, status, reason)` | Suspend/block/activate user | admin |
| `get_activation_requests(status)` | User sees own; admin sees all | authenticated |
| `log_last_login()` | Update last_login for current user | authenticated |
| `get_pending_activation_request()` | Check if user has pending request | authenticated |
| `admin_get_activation_history(target_user_id)` | Full audit history for user | admin |
| `update_last_sync()` | Update last_sync for current user | authenticated |
| `admin_get_license_summary()` | Aggregate license statistics | admin |

---

## Edge Functions (7 New)

| Function | Path | Purpose | JWT |
|----------|------|---------|-----|
| `validate-session` | `supabase/functions/validate-session/index.ts` | Validate auth + license + device | Required |
| `validate-license` | `supabase/functions/validate-license/index.ts` | Check license validity | Required |
| `device-login` | `supabase/functions/device-login/index.ts` | Register device, revoke other sessions | Required |
| `device-logout` | `supabase/functions/device-logout/index.ts` | De-authorize device | Required |
| `request-activation` | `supabase/functions/request-activation/index.ts` | Submit activation request (service-role) | Required |
| `approve-license` | `supabase/functions/approve-license/index.ts` | Admin approve activation (service-role) | Required |
| `reject-license` | `supabase/functions/reject-license/index.ts` | Admin reject activation (service-role) | Required |

---

## Frontend Changes

### New Files (14)

| File | Purpose |
|------|---------|
| `src/lib/license.ts` | License service: status, activation request, trial warnings |
| `src/lib/session-service.ts` | Session validation, 7-day refresh, offline support |
| `src/lib/device.ts` | Device ID generation, fingerprint, login/logout registration |
| `src/pages/Activation.tsx` | User-facing activation page with license info + request |
| `src/pages/LicenseLocked.tsx` | Full-screen lock when trial/license expired |
| `src/components/TrialBanner.tsx` | Warning banners at 3/2/1 days remaining |
| `src/components/admin/LicenseManagement.tsx` | Admin license table with search, filters, pagination, actions |
| `supabase/functions/validate-session/index.ts` | Session validation edge function |
| `supabase/functions/validate-license/index.ts` | License validation edge function |
| `supabase/functions/device-login/index.ts` | Device registration edge function |
| `supabase/functions/device-logout/index.ts` | Device logout edge function |
| `supabase/functions/request-activation/index.ts` | Activation request edge function |
| `supabase/functions/approve-license/index.ts` | Admin approve edge function |
| `supabase/functions/reject-license/index.ts` | Admin reject edge function |

### Modified Files (7)

| File | Changes |
|------|---------|
| `src/App.tsx` | Added `RequireAuth` wrapper to ALL routes (except `/auth`). Added `/activation` and `/license-locked` routes |
| `src/lib/auth.ts` | Added `validateEmail()`, `validatePhone()`, `validatePasswordStrength()`, `validatePasswordsMatch()`. Updated signup `emailRedirectTo` to include verification mode |
| `src/lib/auth-session.tsx` | Added `RequireAuth` route guard. Added device registration on auth state change. License checking integration |
| `src/pages/Auth.tsx` | Complete rewrite: professional login/register/forgot-password/reset/verify UI. Removed Google OAuth. Added confirm password field. Added "Remember session" checkbox. Added validation error messages. Bilingual support |
| `src/lib/i18n.ts` | Added 30+ new auth/license translation keys in Arabic and English |
| `src/integrations/supabase/types.ts` | Added `trial`, `rejected`, `permanent`, `blocked` to `license_status` enum. Added `license_type` enum. Added 11 new RPC function type definitions |
| `supabase/config.toml` | Added configuration for all 6 new edge functions with `verify_jwt = true` |

---

## Security Improvements

1. **Authentication gating**: All application routes (except `/auth`) require valid authentication via `RequireAuth` guard
2. **License enforcement**: Every authenticated user's license is validated server-side via edge functions
3. **One-device policy**: `device-login` edge function revokes all existing sessions before registering a new one
4. **7-day session refresh**: Sessions are refreshed automatically every 6 hours with a 7-day maximum lifetime
5. **Service-role isolation**: Admin operations (approve/reject license) use service-role edge functions, never client-side logic
6. **RLS protection**: All new RPCs use `SECURITY DEFINER` with explicit `GRANT EXECUTE TO authenticated` only
7. **Enum validation**: License status and types use PostgreSQL enums for data integrity
8. **Audit trail**: All admin actions are logged to `admin_actions` table with full details

---

## Deployment Steps

1. Apply the database migration:
   ```bash
   supabase migration up
   ```

2. Deploy edge functions:
   ```bash
   supabase functions deploy validate-session
   supabase functions deploy validate-license
   supabase functions deploy device-login
   supabase functions deploy device-logout
   supabase functions deploy request-activation
   supabase functions deploy approve-license
   supabase functions deploy reject-license
   ```

3. Build and deploy frontend:
   ```bash
   npm run build
   ```
