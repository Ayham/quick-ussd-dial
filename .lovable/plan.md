# Production Readiness Plan — Quick USSD Dial

This is a large multi-domain audit. To avoid partial fixes and keep each step verifiable, work is split into 5 sequential batches. Each batch ends with an honest status report (what was fixed, what was tested, what is still open) before moving on.

## Guiding rules

- No partial fixes inside a batch — finish, verify, then report.
- Every batch ends with: code changes, manual test results, remaining risks.
- Admin notifications use **in-app notifications only** (no custom domain yet — Lovable default emails remain for auth: signup, password reset).
- Final report at the end with `READY` / `NOT READY` verdict + evidence.

## Batch 1 — Auth hardening & full auth QA

Goal: every auth flow works end-to-end on the live preview.

- Confirm the `bad_jwt` / "missing sub claim" fix in `auth-session.tsx` clears stale tokens automatically.
- Verify on live preview: email signup, email login, Google login, logout, password reset, session persistence across refresh.
- Confirm `handle_new_user` trigger creates a `profiles` row + `user_roles` row for every new signup (email and Google).
- Confirm `ayham.seif@gmail.com` is admin and routes to `/sys-panel` correctly.
- Confirm `RequireAuth` blocks all non-auth routes when logged out.
- Fix any issue found before moving on.

## Batch 2 — Trial + Activation + in-app admin notifications

Goal: trial → expiry → activation request → admin sees it → approve → device unlocked.

- Audit `trials` table + `getAppStatus()` for correct trial creation per user/device and correct expiry behavior online and offline.
- Audit `Activation.tsx` request form: collects name, phone, email, device info, app version, trial/license status.
- Replace email-based admin notification with an **in-app admin notifications panel** (new component in `/sys-panel`) backed by the existing `activations` table (status = `pending`). Add a badge with pending count.
- Confirm Arabic confirmation message after request submission.
- Manual test: expire trial → submit request → see in admin → approve → user device unlocked.

## Batch 3 — License system + Admin panel CRUD

Goal: admin can fully manage users, devices, activations, licenses.

- Audit license generation, device binding, validation, revocation, expiry (`license-system.ts`, `licenses` table, `check-license` edge function).
- Audit each admin tab: Dashboard, Users (Customers), Devices, Activations, Licenses, Transfers, Events, Sync, Trials. Fix broken queries, missing actions (block/unblock device, revoke license, approve/reject activation).
- Verify admin-only RLS: non-admin user cannot read other users' data, cannot promote self, cannot mutate licenses/activations.

## Batch 4 — Offline + Sync correctness + MTN/Syriatel workflows

Goal: app works fully offline; sync is lossless and deduped when back online.

- Audit IndexedDB / LocalStorage queue in `supabase-sync.ts` + `cloud-sync.ts`: dedupe via `client_id`, retry with backoff, conflict handling, no data loss.
- Audit `device-sync` edge function for idempotency (already uses `onConflict: device_id,client_id` for transfers — verify for other event types).
- Verify USSD workflows (MTN + Syriatel): prefix detection, presets, balance check, transfer history, reports — all work offline and reconcile when online.
- Verify user-data isolation: user A never sees user B's transfers/distributors.

## Batch 5 — Security re-scan + UI/RTL polish + final report

Goal: green security scan + production-ready UI + go/no-go verdict.

- Run `security--run_security_scan`; fix every high/critical; document any accepted findings in security memory.
- Run Supabase linter; fix flagged issues.
- Quick UI/RTL pass on all major screens (Auth, Activation, Index, Admin tabs) — Arabic default, RTL, responsive.
- Produce the full final report covering all 16 sections requested, with the explicit `READY FOR PRODUCTION LAUNCH` or `NOT READY` conclusion and supporting evidence (test results, scan results, remaining manual config: Google OAuth credentials if user wants own, custom domain for branded emails when available, publish step).

## Technical details

- Stack: React 18 + Vite + Capacitor + Supabase (Lovable Cloud).
- Auth: email/password + Google via `lovable.auth.signInWithOAuth`. Auto-confirm email enabled.
- Roles: `user_roles` table + `has_role()` SECURITY DEFINER function (already correct).
- Admin notifications: in-app only this round; branded email notifications deferred until a sender domain is available.
- Offline storage: IndexedDB (AES-GCM keys) + LocalStorage (obfuscated) + sync queue → `device-sync` edge function.
- After every batch: short status block in chat — ✅ fixed / ⚠️ needs user QA / ❌ open.

## What I need from you to start

Just say "go" and I'll execute Batch 1 immediately. Batches 2–5 follow automatically unless you stop me between them.