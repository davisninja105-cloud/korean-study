<!-- generated-by: gsd-doc-writer -->
# Configuration

This document covers every environment variable, DB-backed application setting, and
per-environment override mechanism used by Korean Study.

## Environment Variables

Local development reads from `.env` and `.env.local` (both git-ignored — no `.env.example`
is checked into the repo, so use the table below as the canonical reference). In production
these are set as Vercel project environment variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key. Read implicitly by the `Anthropic()` SDK client constructor (`lib/extract-cards.ts`, `lib/generate-practice.ts`, `lib/gloss.ts`) — no explicit `process.env` read in app code, but the SDK throws at call time if unset. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes | — | Full Google service-account JSON, as a single-line string. Used to mint OAuth2 tokens for the Google Docs API (`lib/google-docs.ts`, read-only `documents.readonly` scope) and, when `TTS_PROVIDER=google`, for Google Cloud Text-to-Speech (`lib/tts.ts`, `cloud-platform` scope). The target Google Doc must be shared with the service account (link-view or explicit share). |
| `NEXT_PUBLIC_GOOGLE_DOC_ID` | Yes | — | ID of the Google Doc to sync from. `NEXT_PUBLIC_` prefix makes it available client-side; referenced in `components/HomeClient.tsx` and `components/SyncPanel.tsx`. |
| `DATABASE_URL` | Yes | `file:./prisma/dev.db` | Database connection string. `libsql://…` for Turso in production; `file:./dev.db` (or the fallback path) for a local SQLite file in dev. Read directly in `lib/prisma.ts` with a fallback applied if unset. |
| `DATABASE_AUTH_TOKEN` | Conditional | — | Turso auth token. Required whenever `DATABASE_URL` is a `libsql://` URL; not needed for a local `file:` database. Read in `lib/prisma.ts`. |
| `APP_PASSWORD` | Yes | — | The single shared login password. `POST /api/login` returns 500 if this is unset, and 401 if the submitted password doesn't match (`app/api/login/route.ts`). |
| `AUTH_SECRET` | Yes | — | Random string used to sign the HMAC-SHA256 session cookie (`lib/auth.ts`). `computeAuthToken()` throws if this is unset. |
| `TTS_PROVIDER` | No | `'google'` | Selects the active TTS backend: `'google'` or `'elevenlabs'`. Read in `lib/tts.ts` (`providers[process.env.TTS_PROVIDER ?? 'google']`). Currently set to `'elevenlabs'` in this project's `.env.local`. |
| `ELEVENLABS_API_KEY` | Conditional | — | Required only when `TTS_PROVIDER=elevenlabs`. Read in `lib/tts.ts`; the ElevenLabs provider throws without it. |
| `KOREAN_BLOB_READ_WRITE_TOKEN` | No (degrades) | — | Vercel Blob store token used to cache synthesized TTS audio. Must point at a **public** Blob store. `app/api/tts/route.ts` falls back to `BLOB_READ_WRITE_TOKEN` if this is unset, and returns HTTP 503 if neither is set — `components/AudioButton.tsx` then falls back to `window.speechSynthesis`. |
| `BLOB_READ_WRITE_TOKEN` | No (fallback) | — | Fallback for `KOREAN_BLOB_READ_WRITE_TOKEN` (see above). |
| `NODE_ENV` | Set by runtime | — | Standard Next.js/Node variable. Used directly in two places: `lib/prisma.ts` (only caches the Prisma client singleton on `globalThis` outside production) and `app/api/login/route.ts` (only sets the `secure` cookie flag when `=== 'production'`). Not something you set manually in `.env`. |

<!-- VERIFY: For TTS_PROVIDER=google, the Cloud Text-to-Speech API must additionally be enabled on the GCP project that owns GOOGLE_SERVICE_ACCOUNT_KEY — this is a one-time GCP Console setting, not discoverable from the repository. -->

## Config File Format

There is no dedicated JSON/YAML/TOML app-config file. Configuration is split between:

1. **Environment variables** (table above) — infrastructure/credentials, read once at
   process/request time.
2. **`prisma/schema.prisma`** — the database schema, including the `Setting` model used
   for DB-backed app settings (see next section). This is not user-editable configuration;
   changing it requires a schema migration (see `CLAUDE.md` § Schema changes for the
   Turso-specific DDL workflow — `prisma db push`/`migrate` do not work against `libsql://`).
3. **`Setting` table rows** — runtime-adjustable app preferences, set via the Settings UI
   (`/settings`) or `PUT /api/settings`, not via files.

There is no `next.config.ts` customization beyond the default scaffold — `next.config.ts`
currently exports an empty `NextConfig` object.

## DB-Backed App Settings

Unlike environment variables, these are **runtime-adjustable** rows in the `Setting`
key/value table (`prisma/schema.prisma`), managed through `lib/settings.ts` and exposed via
`GET`/`PUT /api/settings` (`app/api/settings/route.ts`). Every setter clamps its input to a
valid range before writing, so the DB always holds a valid value.

| Key | Type | Default | Valid range / format | Getter / Setter |
|---|---|---|---|---|
| `dailyGoalSeconds` | number (seconds) | `300` (5 min) | Clamped 60–3600 | `getDailyGoalSeconds` / `setDailyGoalSeconds` |
| `habitDayStartHour` | number (hour 0–23) | `2` (2:00 AM) | Clamped 0–23 | `getDayStartHour` / `setDayStartHour` |
| `sessionSize` | number (cards) | `20` | Clamped 5–100 | `getSessionSize` / `setSessionSize` |
| `readingTextScale` | number | `1` | Clamped 0.9–1.4, rounded to 1 decimal | `getReadingTextScale` / `setReadingTextScale` |
| `readingAid` | boolean (stored as `'0'`/`'1'`) | `false` | — | `getReadingAid` / `setReadingAid` |
| `buttonColor` | hex string | `#3b82f6` (blue-500) | Must match `/^#[0-9a-fA-F]{6}$/`; falls back to default if invalid | `getButtonColor` / `setButtonColor` |
| `rewardColor` | hex string | `#f97316` (orange-500) | Must match `/^#[0-9a-fA-F]{6}$/`; falls back to default if invalid | `getRewardColor` / `setRewardColor` |
| `gloss:<normalizedWord>` | JSON (`GlossResult`) | — | Non-fatal cache; not exposed in Settings UI | `getCachedGloss` / `setCachedGloss` (`lib/gloss.ts`) |

The `DEFAULT_ACTION_COLOR`/`DEFAULT_REWARD_COLOR` constants live in `lib/palettes.ts`, which
also defines 6 curated `{action, reward}` color pairings (`PALETTES`) offered in the Settings
UI's color picker. `getButtonColor`/`getRewardColor` catch Prisma read errors and return the
default color rather than throwing, so a DB hiccup never breaks page rendering.

Note: the light/dark **theme** (System/Light/Dark) is intentionally **not** in this table —
it is stored client-side in `localStorage` (key `theme`), not in the `Setting` table. See
`lib/theme.ts`.

## Required vs Optional Settings

**Fails at request time if missing:**
- `APP_PASSWORD` — `POST /api/login` returns `{ status: 500 }` when unset.
- `AUTH_SECRET` — `computeAuthToken()` in `lib/auth.ts` throws when unset, which will surface
  as a 500 on any authenticated request (via `middleware.ts`) or on login.
- `ANTHROPIC_API_KEY` — the `Anthropic()` SDK client throws when unset; only surfaces when a
  Claude-backed route is hit (`/api/sync`, `/api/generate`, `/api/gloss`).
- `GOOGLE_SERVICE_ACCOUNT_KEY` — throws inside `lib/google-docs.ts` when `/api/sync` runs, and
  inside `lib/tts.ts` when `TTS_PROVIDER=google` and `/api/tts` runs.
- `NEXT_PUBLIC_GOOGLE_DOC_ID` — required for sync to know which Doc to fetch.
- `DATABASE_AUTH_TOKEN` — required only when `DATABASE_URL` points at `libsql://` (Turso); not
  needed against a local `file:` database.
- `ELEVENLABS_API_KEY` — required only when `TTS_PROVIDER=elevenlabs`.

**Optional, with graceful degradation:**
- `KOREAN_BLOB_READ_WRITE_TOKEN` / `BLOB_READ_WRITE_TOKEN` — `GET /api/tts` returns 503 when
  neither is set; `components/AudioButton.tsx` falls back to `window.speechSynthesis`.
- `DATABASE_URL` — falls back to `file:./prisma/dev.db` for local dev if unset.
- `TTS_PROVIDER` — falls back to `'google'` if unset.

## Defaults

| Variable / Setting | Default | Defined in |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` | `lib/prisma.ts` |
| `TTS_PROVIDER` | `'google'` | `lib/tts.ts` |
| `dailyGoalSeconds` | `300` | `lib/habit.ts` (`DEFAULT_GOAL_SECONDS`) |
| `habitDayStartHour` | `2` | `lib/habit.ts` (`DEFAULT_DAY_START_HOUR`) |
| `sessionSize` | `20` | `lib/habit.ts` (`DEFAULT_SESSION_SIZE`) |
| `buttonColor` | `#3b82f6` | `lib/palettes.ts` (`DEFAULT_ACTION_COLOR`) |
| `rewardColor` | `#f97316` | `lib/palettes.ts` (`DEFAULT_REWARD_COLOR`) |
| `readingTextScale` | `1` | `lib/settings.ts` (`getReadingTextScale`) |
| `readingAid` | `false` | `lib/settings.ts` (`getReadingAid`) |

## Per-Environment Overrides

There is no `NODE_ENV`-driven config-value branching beyond the two spots noted in the
Environment Variables table (Prisma client caching, and the login cookie's `secure` flag).
Environment separation instead works as follows:

- **Local dev vs. production database:** both read the same `DATABASE_URL`/`DATABASE_AUTH_TOKEN`
  pair through the identical `@prisma/adapter-libsql` code path (`lib/prisma.ts`) — a local
  SQLite file (`file:./prisma/dev.db`) in dev, hosted Turso (`libsql://…`) in production. No
  code branches on environment; only the connection string differs.
- **Local `.env` / `.env.local`:** used for `next dev`. There is no `.env.production` or
  `.env.development` file in this repo — Vercel project environment variables are the sole
  source of truth for production.
- **Vercel environment variables:** <!-- VERIFY: exact production values for DATABASE_URL, DATABASE_AUTH_TOKEN, ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, APP_PASSWORD, AUTH_SECRET, ELEVENLABS_API_KEY, and KOREAN_BLOB_READ_WRITE_TOKEN are set in the Vercel dashboard for the `jason-d-28-projects/korean-study` project — not discoverable from the repository. --> All required variables listed above must be set for Preview and Production environments in the Vercel project dashboard, or via `npx vercel env add`.
- **DB-backed settings** (`Setting` table) are inherently per-database, so local dev and
  production naturally have independent values — there is no seed/sync step between them.

## See Also

- `CLAUDE.md` — full architecture reference, including the Turso schema-change workflow
  (`prisma db push`/`migrate` do not work against `libsql://`).
- `docs/DEPLOYMENT.md` — deployment targets, build pipeline, and environment setup for production.
- `docs/GETTING-STARTED.md` — first-run setup, including which of these variables you need
  before `npm run dev` will work end-to-end.
