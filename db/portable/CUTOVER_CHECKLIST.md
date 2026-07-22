# Final cutover checklist

Three columns: **[A]** already done in the repo by the cutover kit,
**[L]** you must do in Lovable, **[S]** you must do in the Supabase dashboard
or locally with the CLI.

## Repository (already done — [A])

- [x] `db/portable/schema/02_post_hardening.sql` — deltas since original bundle
- [x] `db/portable/edge-functions/{admin-rpc,mcp}` — new functions bundled
- [x] `db/portable/edge-functions/*` — all other functions refreshed from live
- [x] `db/portable/export-data.sh` / `import-data.sh` — data migration scripts
- [x] `db/portable/verify-migration.sh` — post-migration checks
- [x] `db/portable/dump-source-schema.sh` — authoritative pg_dump helper
- [x] `db/portable/client.template.ts` — env-var driven client (no hard-coded creds)
- [x] `db/portable/.env.example` — every var placeholder documented
- [x] `db/portable/MIGRATION.md` — command-by-command runbook
- [x] `db/portable/POST_FORK_CHECKLIST.md` — files to replace/remove/edit

## In Lovable ([L]) — before you fork

- [ ] **Cloud → Advanced settings → Export data** — download the full data dump
      (Lovable Cloud does not permit direct external `pg_dump` while the
      project is Cloud-managed).
- [ ] Save the download URL / archive to a safe location.
- [ ] (Optional) Copy any secrets you actually need to keep from
      `fetch_secrets` — Lovable-managed values won't move.
- [ ] Export the repo (GitHub push / download ZIP).

## In Supabase dashboard for `tebyyidgcsivzslaohxd` ([S])

- [ ] Authentication → Providers → **Google**: create OAuth credentials in
      Google Cloud Console, redirect URI
      `https://tebyyidgcsivzslaohxd.supabase.co/auth/v1/callback`, paste
      client id + secret.
- [ ] Authentication → URL Configuration: set Site URL and Redirect URLs from
      `APP_SITE_URL` / `APP_REDIRECT_URLS`.
- [ ] Authentication → Email Templates: reapply any branded templates you had.
- [ ] Project Settings → Database: copy the direct-connection URI into
      `SUPABASE_DB_URL_DIRECT`.
- [ ] Project Settings → API: copy the anon and service-role keys into
      `.env`.
- [ ] Storage: confirm no buckets exist (this project currently has none).
      If you later need buckets, see `MIGRATION.md § 9`.

## Locally, after the fork ([S])

Follow `MIGRATION.md` sections 3–9 in order. Summary:

```bash
# 1. install CLI + link
npm i -g supabase
supabase login   # uses SUPABASE_ACCESS_TOKEN
supabase link --project-ref tebyyidgcsivzslaohxd

# 2. apply schema (in this exact order)
psql "$SUPABASE_DB_URL_DIRECT" -f db/portable/schema/00_full_schema.sql
psql "$SUPABASE_DB_URL_DIRECT" -f db/portable/schema/01_final_device_authority_hardening.sql
psql "$SUPABASE_DB_URL_DIRECT" -f db/portable/schema/02_post_hardening.sql

# 3. data
SOURCE_DB_URL_DIRECT=... ./db/portable/export-data.sh
./db/portable/import-data.sh

# 4. edge functions
for fn in db/portable/edge-functions/*/; do
  supabase functions deploy "$(basename "$fn")" --project-ref tebyyidgcsivzslaohxd
done
supabase secrets set --env-file .env --project-ref tebyyidgcsivzslaohxd

# 5. verify
./db/portable/verify-migration.sh

# 6. swap Lovable-managed files (see POST_FORK_CHECKLIST.md)
cp db/portable/client.template.ts src/integrations/supabase/client.ts
cp db/portable/.env.example .env    # then fill in

# 7. regenerate typed schema against your project
supabase gen types typescript --project-id tebyyidgcsivzslaohxd \
  > src/integrations/supabase/types.ts

# 8. build & run
npm ci && npm run build && npm run dev
```

## Only after everything above ([S])

- [ ] Bootstrap the first admin — sign up in the app, then:

  ```bash
  curl -X POST https://tebyyidgcsivzslaohxd.supabase.co/functions/v1/admin-bootstrap \
    -H "Authorization: Bearer <your JWT after login>"
  ```

- [ ] Smoke-test authenticated flows (email/password, Google), admin panel at
      `/sys-panel`, contacts sync, offline transfer queue.
- [ ] Point production DNS at the new deployment.
- [ ] Keep Lovable project available for **≥ 7 days** as rollback.

## Rollback

If anything critical fails after cutover:

1. Revert DNS to the Lovable-hosted URL.
2. Continue serving from Lovable while you diagnose.
3. The destination DB and edge functions are unchanged by the app running on
   Lovable — safe to re-attempt the cutover after fixing the issue.

## Known limitations

- `auth.users` is not exported by `export-data.sh` — users must sign in again
  or you must use `supabase auth import` from a Supabase-support-provided JSON.
- `LOVABLE_API_KEY` and any Lovable AI Gateway calls will stop working. Swap
  to a direct provider (OpenAI/Anthropic/etc.) before deploying.
- Preview URL on `lovable.app` will not reflect changes to the new backend.
- `bun.lock` may need regeneration if you switch to npm exclusively.
