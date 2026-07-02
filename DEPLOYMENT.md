# Deployment Runbook

No command in this document has been executed against production.

## 1. Prerequisites

- Supabase Owner/Admin access to the target project
- Supabase CLI authenticated
- Android signing keystore and secure passwords
- Node.js and Java/Android SDK versions required by the repository

## 2. Verify Source

```powershell
npm ci
npx tsc -p tsconfig.app.json --noEmit
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

## 3. Link Supabase

```powershell
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push --dry-run
```

Review the dry run. Then apply:

```powershell
supabase db push
```

Confirm that this migration is present:

```text
20260701213000_final_device_authority_hardening.sql
```

## 4. Deploy Edge Functions

```powershell
supabase functions deploy device-sync --project-ref <PROJECT_REF>
supabase functions deploy request-activation --project-ref <PROJECT_REF>
supabase functions deploy reports --project-ref <PROJECT_REF>
supabase functions deploy check-license --project-ref <PROJECT_REF>
supabase functions deploy admin-create-license --project-ref <PROJECT_REF>
```

Verify required secrets exist without printing their values:

```powershell
supabase secrets list --project-ref <PROJECT_REF>
```

## 5. Database Verification

Verify:

- `devices.lifecycle_state` is non-null and constrained.
- `device_heartbeat(text,text,text,text,text,uuid)` is executable only by
  `service_role`.
- protected lifecycle tables are read-only through the Data API.
- admin RPCs reject non-admin authenticated users.
- fingerprint and owner mismatch create audit rows and deny access.
- a new device creates exactly one trial.
- revoked, suspended, blocked, expired, pending, maintenance, and forced-update
  states block the application.
- license transfer cancels the old device trial and activates only the target.
- `report_transfers` is executable only by `service_role`, pages are capped at
  100 rows, and non-admin report calls return only the authenticated user.

## 6. Frontend / Android

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat clean assembleRelease
```

Sign the release using the organization's protected signing process. Do not
commit keystore files or passwords.

## 7. Staging Smoke Test

Test on at least two physical Android devices:

1. New install creates a server device and trial.
2. Offline restart works within the authorization window.
3. Expired offline authorization blocks until reconnect.
4. Activation request queues offline and appears once reconnected.
5. License key activates only the matching device.
6. Fingerprint/owner mismatch blocks and writes security/audit events.
7. Suspend, revoke, block, unblock, trial extension, permanent/temporary
   conversion, and transfer synchronize automatically.
8. Old device loses access after transfer.
9. Forced update and maintenance mode block access.
10. Contacts import/export and offline sync do not duplicate rows.
11. Arabic text, RTL, safe areas, keyboard, contacts permission, and call intent
    work on supported Android versions.

## 8. Rollback

- Keep the previous frontend/APK artifact.
- Back up the database before migration.
- Do not roll back lifecycle columns or audit history destructively.
- If a release must be halted, enable maintenance mode and redeploy the previous
  frontend/APK while preserving the hardened database migration.
