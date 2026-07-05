# Phase 19 Plan 03: User Setup Required

**Generated:** 2026-07-05
**Phase:** 19-vercel-cron-auto-sync (Plan 03)
**Status:** Incomplete

Complete these items so the daily Vercel Cron auto-sync actually runs. Claude automated everything possible (the fail-closed auth check, the middleware branch, the cron route, and the `vercel.json` declaration); these items require human access to Vercel's dashboard/CLI.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `CRON_SECRET` | Generate a random string ≥16 chars (e.g. `openssl rand -hex 32`) | `.env.local` (for local curl testing) AND Vercel Dashboard → korean-study → Settings → Environment Variables (**Production**) |

Notes:
- Cron jobs only run against the Production environment — setting `CRON_SECRET` only in Preview/Development will not authorize the real scheduled runs.
- Do not reuse `AUTH_SECRET` (the existing shared-password HMAC secret) for this — they protect different trust boundaries.

## Dashboard Configuration

- [ ] **Set `CRON_SECRET` as a Production env var**
  - Location: Vercel Dashboard → korean-study → Settings → Environment Variables
  - Equivalent CLI: `vercel env add CRON_SECRET production`

- [ ] **Deploy so `vercel.json`'s cron declaration takes effect**
  - `git push origin main` (per this repo's normal deploy path) — Vercel reads `vercel.json`'s `crons` array on deploy and registers the daily job.

- [ ] **Confirm the cron job registered and ran**
  - Location: Vercel Dashboard → korean-study → Settings → Cron Jobs
  - After the scheduled UTC time (10:00 UTC daily, per `vercel.json`), check the job's first invocation log for a 200 response (not 401 — a 401 there means `CRON_SECRET` isn't set correctly in Production).

## Verification

After completing setup:

```bash
# Local: with CRON_SECRET set in .env.local, confirm the auth branch works end-to-end.
# NOTE: an authorized call actually triggers a real runSync() — Google Doc fetch +
# (if there's new content) a paid Claude extraction call + a DB write. Run this only
# when you're ready to actually sync, the same way you would tap "Sync now".
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync   # expect 200, not 401
curl -i http://localhost:3000/api/cron/sync                                          # expect 401 (no header)
curl -i -H "Authorization: Bearer wrong-token" http://localhost:3000/api/cron/sync    # expect 401 (wrong token)

# After a successful run, confirm the timestamp advanced:
curl -s http://localhost:3000/api/settings | jq .lastAutoSyncedAt
```

Expected results:
- No/invalid bearer → 401, never a redirect to `/login`.
- Valid bearer + `CRON_SECRET` set → 200 with a `SyncResult` JSON body (`newLessons <= 1`).
- `lastAutoSyncedAt` shows a fresh ISO timestamp after a successful run.
- Post-deploy, the Vercel Dashboard's Cron Jobs page shows the job and its first scheduled invocation log.

---

**Once all items complete:** Mark status as "Complete" at top of file.
