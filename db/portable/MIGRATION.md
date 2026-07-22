# Cutover runbook — Lovable Cloud → `tebyyidgcsivzslaohxd`

Command-by-command procedure for migrating the Quick USSD Dial app from the
Lovable-managed Supabase project (`jwfsiqkvzmttkuxldkrq`) to your own
Supabase project (`tebyyidgcsivzslaohxd`).

> All destructive commands run against the **destination** project. Source
> project operations are strictly read-only.

---

## 1. Prerequisites

- Repo forked out of Lovable and cloned locally.
- Node ≥ 20, PostgreSQL client (`psql`, `pg_dump`) ≥ 15.
- `supabase` CLI ≥ 1.180 — `npm i -g supabase`.
- Personal access token (PAT) generated at
  https://supabase.com/dashboard/account/tokens.
- The following filled in inside `.env` (see `db/portable/.env.example`):
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL_DIRECT`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SOURCE_DB_URL_DIRECT`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

```bash
export $(grep -v '^#' .env | xargs)   # load env for shell scripts
```

## 2. Back up the SOURCE project

```bash
# schema snapshot (read-only)
./db/portable/dump-source-schema.sh
# data snapshot (CSV, read-only)
./db/portable/export-data.sh          # writes to ./_export/
tar -czf source-backup-$(date +%F).tgz db/portable/schema/99_authoritative_dump.sql _export/
```

Also trigger **Lovable → Cloud → Advanced settings → Export data** and keep
that archive.

## 3. Link the destination project

```bash
supabase login --token "$SUPABASE_ACCESS_TOKEN"
supabase link --project-ref tebyyidgcsivzslaohxd
```

## 4. Apply schema (in order)

```bash
psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 \
  -f db/portable/schema/00_full_schema.sql
psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 \
  -f db/portable/schema/01_final_device_authority_hardening.sql
psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 \
  -f db/portable/schema/02_post_hardening.sql
```

If `99_authoritative_dump.sql` diverges from `00 + 01 + 02`, prefer the
authoritative dump for tables, and re-apply `02_post_hardening.sql` on top for
grants and hardening.

## 5. Import data

```bash
./db/portable/import-data.sh          # reads ./_export/, writes destination
```

The script disables user triggers during load, TRUNCATE-CASCADEs each table
inside a per-table transaction, then re-enables triggers and resyncs every
sequence with `setval(MAX(col))`.

`auth.users` is **not** included. Options:

- Have users sign in again (works transparently for Google OAuth).
- Contact Supabase support to bulk-import a JSON of users, then rerun
  `import-data.sh` for `profiles` / `user_roles` (they FK to `auth.users`).

## 6. Deploy edge functions

```bash
for fn in db/portable/edge-functions/*/; do
  name="$(basename "$fn")"
  supabase functions deploy "$name" --project-ref tebyyidgcsivzslaohxd
done
```

`admin-reset-user` deploys with `verify_jwt = false` via
`supabase/config.toml`. All others validate the JWT in code.

## 7. Set edge-function secrets

```bash
supabase secrets set --project-ref tebyyidgcsivzslaohxd --env-file .env
# then remove anything you didn't intend to push:
supabase secrets list --project-ref tebyyidgcsivzslaohxd
```

If any code path used `LOVABLE_API_KEY`, replace it with your own provider
key before this step (e.g. `OPENAI_API_KEY=…`).

## 8. Configure auth

Supabase dashboard → Authentication:

1. **Providers → Google** — paste the Client ID + Secret from Google Cloud
   Console. Authorized redirect URI:
   `https://tebyyidgcsivzslaohxd.supabase.co/auth/v1/callback`.
2. **URL Configuration** — Site URL = `$APP_SITE_URL`; Redirect URLs =
   comma-separated `$APP_REDIRECT_URLS`.
3. **Email Templates** — reapply your branded templates (Confirmation,
   Reset password, Magic Link).

Then in the repo, swap the OAuth wrapper. See
`db/portable/POST_FORK_CHECKLIST.md` for the exact edit in `src/pages/Auth.tsx`.

## 9. Storage buckets

The current project has **zero storage buckets** (verified against
`storage.buckets`). If you later need one:

```bash
supabase storage create <name> --project-ref tebyyidgcsivzslaohxd --public
# or via SQL:
psql "$SUPABASE_DB_URL_DIRECT" -c \
  "INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true);"
```

## 10. Bootstrap the first admin

```bash
# Sign up in the app first so an auth.users row exists.
JWT="paste your access_token from browser devtools localStorage"
curl -X POST https://tebyyidgcsivzslaohxd.supabase.co/functions/v1/admin-bootstrap \
  -H "Authorization: Bearer $JWT"
```

The function promotes the first caller to `admin` and self-locks; further
promotions require an existing admin.

## 11. Point the frontend at the new project

Only after the repo is forked (Lovable will otherwise overwrite):

```bash
cp db/portable/client.template.ts src/integrations/supabase/client.ts
cp db/portable/.env.example .env       # fill in real values
supabase gen types typescript --project-id tebyyidgcsivzslaohxd \
  > src/integrations/supabase/types.ts
```

Then apply the edits listed in `db/portable/POST_FORK_CHECKLIST.md`
(remove `src/integrations/lovable/`, replace the Google OAuth handler, drop
`@lovable.dev/cloud-auth-js` from `package.json`).

## 12. Validate

```bash
./db/portable/verify-migration.sh
```

Manual smoke tests (each must pass):

- Sign in with email/password → land on `/`.
- Sign in with Google → land on `/`.
- Create a transfer offline → reconnect → row appears in `public.transfers`.
- Open `/sys-panel` → every tab loads with data.
- Admin RPC — extend a license via the panel → row updates + `audit_logs`
  entry appears.
- `POST /functions/v1/mcp` returns a valid tool list.
- Contacts sync — add a contact on device A, sign in on device B → contact
  appears after next sync.
- Trial-expired flow — force `trials.expires_at` into the past → activation
  request queues and appears in `/sys-panel → Activations`.

## 13. Rollback

If validation fails:

1. Do NOT reset the destination — investigate first.
2. Revert DNS / deployment to Lovable-hosted app.
3. Destination DB is unaffected by Lovable traffic — fix and retry.
4. Only truncate destination tables if you plan to re-run
   `import-data.sh` — the schema itself is safe to keep.

## 14. Final cutover

- Flip DNS/CDN to the forked build.
- Keep the Lovable project alive for **≥ 7 days** in case of regressions.
- After 7 clean days, disable Lovable Cloud for future projects via
  **Connectors → Lovable Cloud → Disable Cloud** (this does not remove Cloud
  from the current Lovable project — only prevents new ones).
