# Post-fork checklist

After you fork this repo out of Lovable, these files are the ones Lovable
Cloud was managing. Replace them with the portable equivalents **before**
`npm install && npm run dev`.

## Files to REPLACE

| File                                    | Replace with                              |
| --------------------------------------- | ----------------------------------------- |
| `src/integrations/supabase/client.ts`   | `db/portable/client.template.ts`          |
| `.env`                                  | `db/portable/.env.example` (filled in)    |
| `supabase/config.toml`                  | See snippet below                         |

New `supabase/config.toml`:

```toml
project_id = "tebyyidgcsivzslaohxd"

[functions.admin-reset-user]
verify_jwt = false
```

## Files to REMOVE

| File / dir                              | Why                                                   |
| --------------------------------------- | ----------------------------------------------------- |
| `src/integrations/lovable/`             | Lovable-managed OAuth wrapper — not portable          |
| `.lovable/`                             | Lovable metadata                                      |
| `bun.lock` (optional)                   | Regenerate with npm if you drop Bun                   |

## Files to EDIT

1. **`src/pages/Auth.tsx`** — replace the Google button handler:

   ```ts
   // was: await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
   await supabase.auth.signInWithOAuth({
     provider: "google",
     options: { redirectTo: window.location.origin + "/auth" },
   });
   ```

   Then remove the `import { lovable } from "@/integrations/lovable/index"` line.

2. **`package.json`** — remove `"@lovable.dev/cloud-auth-js"` dependency.

3. **Any code path using `LOVABLE_API_KEY`** — swap for your own LLM provider
   key (OpenAI, Anthropic, etc.) added via `supabase secrets set`.

## Repo-wide references to audit

Run each grep after the fork and fix any hits:

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.git 'jwfsiqkvzmttkuxldkrq' .
grep -rn --exclude-dir=node_modules --exclude-dir=.git 'supabase_lovable_migration' .
grep -rn --exclude-dir=node_modules --exclude-dir=.git 'LOVABLE_API_KEY' .
grep -rn --exclude-dir=node_modules --exclude-dir=.git 'lovable.app' .
grep -rn --exclude-dir=node_modules --exclude-dir=.git '@lovable.dev/cloud-auth-js' .
grep -rn --exclude-dir=node_modules --exclude-dir=.git 'integrations/lovable' .
```

Expected hits AFTER the fork: none. Anything found needs to be replaced or
deleted.
