# Production Readiness

## Verdict

**NOT READY for commercial production. READY for a controlled staging
deployment.**

The source now enforces server-authoritative licensing and device lifecycle
rules. Production readiness remains blocked by deployment and live verification
that cannot be performed from this workspace, plus load testing and real
Android device validation.

## Release Gates

| Gate | Status |
|---|---|
| Server-authoritative access guard | Complete in source |
| Device registration and lifecycle | Complete in source |
| Trial/license/activation/transfer RPCs | Complete in source |
| Protected frontend writes removed | Complete in source |
| Offline idempotent queue | Complete in source |
| Monitoring dashboard | Complete in source |
| Contact CSV/Excel/VCF/JSON workflows | Complete in source |
| Paged multidimensional reports and charts | Complete in source |
| Shared mobile-first UI, loading, empty, and error states | Complete in source |
| TypeScript/tests/build | Passing |
| Production dependency audit | Passing |
| Android unit test/debug APK | Passing locally |
| Supabase migration deployment | Required |
| Edge Function deployment | Required |
| Live RLS/RPC/security verification | Required |
| Signed Android release | Required |
| Physical Android layout/permission tests | Required |
| Physical-device visual regression | Required |

## Performance Notes

- Heartbeats are indexed by device and use one authoritative RPC.
- Sync sends at most 100 events per request and retains failed IDs.
- Event/contact/transfer operations use deterministic conflict keys.
- Monitoring uses count-only queries rather than downloading entire tables.
- Reports aggregate in PostgreSQL, cap pages at 100 rows, and cap user/device
  dimension lists at 100 entries.
- Excel handling is dependency-free SpreadsheetML to avoid a vulnerable parser.
- The main JavaScript chunk remains above 500 kB. Route-level lazy loading is a
  recommended follow-up before high-volume web distribution.

## Known Risks

- Client cache tampering cannot be eliminated solely in JavaScript. Use signed
  authorization receipts and Android application integrity controls for a
  stronger commercial threat model.
- Database compatibility is unverified until migrations run against the target
  schema.
- No load test has been executed against thousands of devices.
- Physical-device screenshots and interaction checks could not be automated in
  the current environment.
- No disaster recovery, backup restore, or rollback drill has been performed.
