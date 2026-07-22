# Portable schema

Apply files **in order** against your destination Supabase project
(`tebyyidgcsivzslaohxd`):

```
00_full_schema.sql                       # tables, RLS, GRANTs, seeds
01_final_device_authority_hardening.sql  # lifecycle_state, protected tables, admin RPCs
02_post_hardening.sql                    # contacts sync, admin-rpc lockdown, indexes, hardened policies
```

## Authoritative dump

The three curated files above cover every change I can enumerate from the live
Postgres catalog. If you want a **byte-exact** DDL snapshot of the source
project before cutover, run `./dump-source-schema.sh` from your workstation.
That produces `schema/99_authoritative_dump.sql` via `pg_dump --schema-only`.
Prefer that file over `02_post_hardening.sql` if the two ever conflict.

## Idempotency

Every statement in `02_post_hardening.sql` is guarded with `IF NOT EXISTS`,
`DROP … IF EXISTS`, or `ON CONFLICT DO NOTHING`. Re-running it is safe.
