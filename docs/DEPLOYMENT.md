<!-- generated-by: gsd-doc-writer -->
# Deployment

This document covers how Korean Study is deployed, the build pipeline, required
production environment setup, rollback options, and monitoring status.

## Deployment Targets

Korean Study is a single Next.js application deployed to **Vercel**, with its database
hosted on **Turso** (libSQL). There is no Docker/container setup, no `docker-compose.yml`,
and no alternate platform config (`netlify.toml`, `fly.toml`, `railway.json`,
`serverless.yml`) in the repository — Vercel is the only supported deployment target.

| Signal | Value |
|---|---|
| `.vercel/project.json` | Present — project is linked (`projectName: "korean-study"`) |
| Git remote | `https://github.com/davisninja105-cloud/korean-study.git` |
| Database | Turso (libSQL), via `DATABASE_URL` (`libsql://…`) + `DATABASE_AUTH_TOKEN` |
| CI config (`.github/workflows/`) | None found in the repository |
| Container config (`Dockerfile`, `docker-compose.yml`) | None found |

<!-- VERIFY: Live production URL — CLAUDE.md and README.md both state https://korean-study-five.vercel.app and the Vercel project is jason-d-28-projects/korean-study, but the org/team name and exact live URL are not independently derivable from repository contents alone. -->

## Build Pipeline

There is no CI/CD workflow file in this repository (`.github/workflows/` does not exist).
Deployment is driven entirely by Vercel's native Git integration:

1. **Trigger:** `git push origin main`. Vercel's GitHub integration watches the linked
   repository and triggers a production deploy automatically on push to `main`.
2. **Install:** Vercel runs `npm install`, which triggers the `postinstall` script —
   `prisma generate` (from `package.json` `scripts.postinstall`).
3. **Build:** Vercel runs `npm run build`, which is `prisma generate && next build`
   (`package.json` `scripts.build`). `prisma generate` regenerates the Prisma client from
   `prisma/schema.prisma` before Next.js compiles the app.
4. **Deploy:** Vercel promotes the build output to production automatically once the build
   succeeds (no manual approval step configured in the repo).

Manual deploys are also available via the Vercel CLI:

```bash
npx vercel --prod
```

<!-- VERIFY: CLAUDE.md notes that CLI uploads "occasionally fail with a transient TLS 'bad
record mac' error — just retry"; this is an operational note from prior experience, not
something derivable from repo contents. -->

**No separate test/lint gate on push.** `npm run lint` and `npm test` (Vitest) exist as
scripts (`package.json`) but there is no CI workflow file wiring them into the deploy
path — running them before pushing is a manual developer step, not enforced automatically.

## Environment Setup

Production requires the same environment variables documented in full in
[`docs/CONFIGURATION.md`](CONFIGURATION.md). Summary of what must be set in the Vercel
project's environment variables (Production and Preview):

| Variable | Required |
|---|---|
| `ANTHROPIC_API_KEY` | Yes |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes |
| `NEXT_PUBLIC_GOOGLE_DOC_ID` | Yes |
| `DATABASE_URL` (`libsql://…` for Turso) | Yes |
| `DATABASE_AUTH_TOKEN` | Yes (required whenever `DATABASE_URL` is `libsql://`) |
| `APP_PASSWORD` | Yes |
| `AUTH_SECRET` | Yes |
| `TTS_PROVIDER` | No (defaults to `'google'`; set to `'elevenlabs'` per `docs/CONFIGURATION.md`) |
| `ELEVENLABS_API_KEY` | Conditional (required when `TTS_PROVIDER=elevenlabs`) |
| `KOREAN_BLOB_READ_WRITE_TOKEN` | No — degrades gracefully (`/api/tts` returns 503) |

Set these via the Vercel dashboard (Project → Settings → Environment Variables) or the CLI:

```bash
npx vercel env add <NAME>
```

<!-- VERIFY: The actual values configured for each of the above in the Vercel dashboard
are not present in the repository and must be confirmed directly in the Vercel project
settings for jason-d-28-projects/korean-study. -->

**Schema changes require a manual step before/after deploy.** `prisma db push` and
`prisma migrate` do not work against Turso's `libsql://` protocol (error `P1013` — the
schema engine only speaks `file:`/postgres). The workflow is:

1. Edit `prisma/schema.prisma`, then run `npx prisma generate` locally.
2. Generate DDL: `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
3. Run only the **new** `CREATE TABLE`/`ALTER` statements against Turso via a throwaway
   script using `@libsql/client` `executeMultiple()` (reads `DATABASE_URL` /
   `DATABASE_AUTH_TOKEN` from `.env`), or via `turso db shell korean-study`.

This must be done before deploying code that depends on the new schema — Vercel's build
step does not apply schema changes to Turso itself (`prisma generate` only regenerates the
client, it does not push DDL).

## Rollback Procedure

No rollback automation or scripted procedure exists in the repository (no rollback step in
any CI workflow, and no `vercel.json` rollback configuration). Rollback relies on Vercel's
built-in deployment history:

1. Open the Vercel dashboard for the `korean-study` project → **Deployments**.
2. Locate the last known-good deployment.
3. Use **Promote to Production** (or `npx vercel rollback` from the CLI) to re-point
   production traffic at that build, without needing a new git push.

**Database rollback is not automated.** Because schema changes are applied manually via
the Turso DDL workflow above (not via `prisma migrate`'s tracked migration history), there
is no `prisma migrate resolve`/down-migration path. Reverting a schema change that has
already been applied to Turso requires writing and running the inverse DDL by hand.

<!-- VERIFY: Whether `vercel rollback` is configured/available for this specific project,
and whether git-level revert + re-push is the preferred rollback path in practice, is an
operational decision not recorded in the repository. -->

## Monitoring

No monitoring or error-tracking library is present in `package.json` dependencies —
there is no Sentry (`@sentry/*`), Datadog (`dd-trace`), New Relic (`newrelic`), or
OpenTelemetry (`@opentelemetry/*`) package installed, and no corresponding config file
(e.g. `sentry.config.*`) exists in the repository.

Production visibility currently relies on:
- Vercel's built-in deployment logs and function logs (dashboard → project → Logs).
- API routes that follow the project's standard `try { … } catch (e) { return
  NextResponse.json({ error: … }, { status: 500 }) }` pattern (see `docs/API.md`), so
  failures surface as 500 responses with a JSON error body but are not forwarded to an
  external alerting service.

<!-- VERIFY: Whether any monitoring/alerting is configured at the Vercel project level
(e.g. Vercel Monitoring, Log Drains, or a third-party integration added outside the
repository) is not discoverable from repository contents. -->

## Platform-Specific Constraints

- **Vercel Hobby plan hard-limits serverless functions to 60 seconds**, regardless of any
  `maxDuration` value set in route code. `POST /api/sync` processes exactly one lesson per
  request (`MAX_LESSONS_PER_SYNC = 1` in the sync route) to stay under this limit; the
  client drains a multi-lesson backlog by calling sync repeatedly (see `remaining` in the
  sync response, and `scripts/full-resync.mjs`).
- **Bulk operations must run locally, not through the deployed app.** For a full
  re-extraction of all lessons (no timeout constraint), run
  `npx tsx scripts/local-resync.mts` on a local machine against the same Turso database —
  it uses the same `lib/` extraction code but is not subject to the Vercel function
  timeout.
- **The libSQL adapter (`lib/prisma.ts`) is what makes one build work in both
  environments** — the same Prisma code runs against a local SQLite file (`DATABASE_URL`
  starting with `file:`) in development and hosted Turso (`libsql://…`) in production; no
  code branches on environment for the database connection itself.

## See Also

- [`docs/CONFIGURATION.md`](CONFIGURATION.md) — full environment variable reference,
  required vs. optional settings, and defaults.
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — system overview and data flow.
- `CLAUDE.md` — the Turso schema-change DDL workflow in full, plus operational gotchas.
