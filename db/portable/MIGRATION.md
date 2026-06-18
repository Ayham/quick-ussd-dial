# Portable Supabase Migration Runbook

This bundle lets you move the Quick USSD Dial app off Lovable Cloud onto your **own Supabase project** while keeping the same schema, RLS, edge functions, and offline-first sync.

> ⚠️ **Rotate the access token you shared in chat** (`sbp_a55…f326`) at https://supabase.com/dashboard/account/tokens before doing anything else. Lovable never needs it.

---

## 1. Bundle contents

```
db/portable/
├── schema/
│   └── 00_full_schema.sql        # consolidated DDL: tables, RLS, GRANTs, triggers, seeds
├── edge-functions/               # one folder per function, ready for `supabase functions deploy`
│   ├── admin-bootstrap/
│   ├── admin-create-license/
│   ├── admin-reset-user/
│   ├── check-license/
│   ├── device-sync/
│   ├── migrate-from-sheets/
│   └── request-activation/
├── client.template.ts            # drop-in replacement for src/integrations/supabase/client.ts
├── .env.example                  # required env vars
└── MIGRATION.md                  # this file
```

## 2. Prerequisites

- A new Supabase project (Free tier is fine to start).
- `supabase` CLI ≥ 1.180 installed locally (`npm i -g supabase`).
- This repo cloned locally.

## 3. Steps

### 3.1 Apply the schema

```bash
# Get your DB connection string from: Project Settings → Database → Connection string (URI)
psql "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  -f db/portable/schema/00_full_schema.sql
```

This creates **all 30 tables**, RLS policies, GRANTs, triggers (`enforce_device_limit`, `detect_device_cloning`, `handle_new_user`, `update_updated_at_column`), the `has_role` security-definer function, and seeds the 5 `subscription_plans` and `system_config` defaults.

### 3.2 Deploy edge functions

```bash
supabase link --project-ref YOUR-REF
for fn in db/portable/edge-functions/*/; do
  name=$(basename "$fn")
  supabase functions deploy "$name" --no-verify-jwt
done
```

> `admin-reset-user` is the only one that needs `--no-verify-jwt`; the rest validate the JWT in code. Adjust per `supabase/config.toml` if you change defaults.

### 3.3 Configure Auth

- **Email/password**: already enabled.
- **Google OAuth** (required for in-app Google login):
  1. Create OAuth credentials at https://console.cloud.google.com/apis/credentials (Web application).
  2. Authorized redirect URI: `https://YOUR-REF.supabase.co/auth/v1/callback`.
  3. In Supabase Dashboard → Authentication → Providers → Google: paste Client ID + Client Secret.
- **Site URL / Redirect URLs**: add your production domain and `http://localhost:5173` (or your Vite port).
- **Disable** "Confirm email" only if you want instant sign-up; otherwise leave on.

### 3.4 Point the app at your project

```bash
cp db/portable/client.template.ts src/integrations/supabase/client.ts
cp db/portable/.env.example .env
# edit .env with your URL + anon key
```

Then regenerate types against **your** project:

```bash
supabase gen types typescript --project-id YOUR-REF > src/integrations/supabase/types.ts
```

### 3.5 Promote your first admin

Sign up in the app, then call the `admin-bootstrap` function once (it promotes the first user to admin and locks itself):

```bash
curl -X POST https://YOUR-REF.supabase.co/functions/v1/admin-bootstrap \
  -H "Authorization: Bearer YOUR_USER_ACCESS_TOKEN"
```

### 3.6 Verify

- Sign in → reach `/`.
- Create a transfer offline → reconnect → row appears in `public.transfers`.
- Open `/sys-panel` → all tabs load.
- Run the linter: Supabase Dashboard → Database → Linter.

---

## 4. Portability matrix

| Component                        | Portable | Notes |
|----------------------------------|----------|-------|
| Tables, indexes, RLS, GRANTs     | ✅ | `00_full_schema.sql` |
| Triggers & functions             | ✅ | `enforce_device_limit`, `detect_device_cloning`, `has_role`, `handle_new_user` |
| Seed data (plans, system_config) | ✅ | included in schema |
| Edge functions                   | ✅ | redeploy via CLI |
| Email/password auth              | ✅ | enabled by default |
| Google OAuth                     | ⚠️  | needs your own Google Client ID + Secret |
| Email templates (branding)       | ⚠️  | re-apply manually in Auth → Email Templates |
| `client.ts` + `.env`             | ⚠️  | use `client.template.ts` + regenerate `.env` |
| `supabase/config.toml` project_id | ❌ | Lovable-managed; replace with your own ref |
| `LOVABLE_API_KEY`                | ❌ | Lovable AI Gateway only; swap to your own LLM provider |

---

## 5. Offline-first sync — how it works

- Local writes go to IndexedDB / localStorage immediately (works fully offline).
- `src/lib/supabase-sync.ts` queues events under `supabase_sync_queue_v1`.
- When `navigator.onLine` flips true (or every 5 min), the queue is flushed to the `device-sync` edge function, which upserts into `transfers`, `app_events`, `sync_logs`, and returns the current license + device status.
- Duplicate protection: each event carries a `client_id` (UUID); `transfers` has a `(device_id, client_id)` unique key so retries are idempotent.

## 6. Multi-device licensing

- `subscription_plans.max_devices` is enforced by the `enforce_device_limit()` trigger on `public.devices` — activating a 2nd device on a 1-seat plan raises `device_limit_exceeded`.
- `detect_device_cloning()` writes an `audit_logs` row + admin `notifications` row when the same `device_fingerprint` appears under two users.

## 7. Known limitations after porting

- **Lovable preview URL** stops reflecting database changes — use your own dev server.
- The `/auth` page uses `lovable.auth.signInWithOAuth("google")` from `@lovable.dev/cloud-auth-js`. Replace the body of `src/pages/Auth.tsx`'s `google()` handler with:
  ```ts
  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/auth" } });
  ```
- Any future Lovable Cloud auto-edits to `src/integrations/supabase/client.ts` / `.env` will overwrite your changes — once ported, stop syncing from Lovable.

---

## 8. Remaining work (tracked, not yet shipped)

The following items from the master plan are **not** in this bundle yet and remain TODO in the running app:

1. Extending `supabase-sync.ts` queue to cover contacts, presets, distributors, licenses, payments (currently only transfers + generic events).
2. Full `/sys-panel` enterprise pages (search, pagination, CSV export, row actions) — only the basic managers exist today.
3. Contacts CSV/XLSX importer UI.
4. Advanced reports built directly off `transfers` + `daily_summaries`.
5. Playwright deep-check pass + acceptance evidence.

The schema and policies needed for all of the above are already in place, so the app code can be added incrementally without further DB migrations.
