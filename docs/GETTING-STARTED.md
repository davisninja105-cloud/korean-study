<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide gets Korean Study running locally, from a fresh clone to a working
dev server. For a deeper tour of how the app is built, see `CLAUDE.md` and
`docs/ARCHITECTURE.md`.

## Prerequisites

- **Node.js** — no version is pinned in `package.json` (`engines` is not set, and there is
  no `.nvmrc`/`.node-version`). Next.js 16 requires a recent Node LTS; use whatever
  current LTS you have (Node 20+ is a safe baseline).
- **npm** — the project ships a committed `package-lock.json` (lockfileVersion 3); use
  `npm install`, not `yarn`/`pnpm`, to match the lockfile.
- **A Turso account (or local SQLite)** — the app runs against `libsql://` (Turso) in
  production, or a local SQLite file (`file:./dev.db`) in dev. Turso is only required if
  you want to mirror production; a local file works for day-to-day development.
- **A Google Cloud service account** with the Google Docs API enabled and read access to
  the tutoring notes Google Doc — needed for the sync feature (`lib/google-docs.ts`).
- **An Anthropic API key** — required for card extraction (`/api/sync`), tap-to-gloss
  (`/api/gloss`), and AI practice generation (`/api/generate`).
- **An ElevenLabs API key** (or a Google Cloud project with Text-to-Speech enabled) — only
  needed if you want working audio playback; the app degrades to browser
  `speechSynthesis` without it.

See `docs/CONFIGURATION.md` for the full environment variable reference, including which
variables are strictly required versus which degrade gracefully.

## Installation Steps

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/davisninja105-cloud/korean-study.git
   cd korean-study
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   `postinstall` automatically runs `prisma generate`, so the Prisma client is ready
   immediately after install.

3. Create your local environment file. There is no `.env.example` checked into the repo
   (see `docs/CONFIGURATION.md`), so create `.env.local` in the project root with at
   least the following required variables:

   ```bash
   ANTHROPIC_API_KEY=
   GOOGLE_SERVICE_ACCOUNT_KEY=
   NEXT_PUBLIC_GOOGLE_DOC_ID=
   DATABASE_URL=file:./dev.db
   APP_PASSWORD=
   AUTH_SECRET=
   ```

   For a purely local database, `DATABASE_URL=file:./dev.db` is enough — you do not need
   `DATABASE_AUTH_TOKEN` unless `DATABASE_URL` points at a `libsql://` Turso instance. See
   `docs/CONFIGURATION.md` for the complete variable list (including `TTS_PROVIDER`,
   `ELEVENLABS_API_KEY`, and `KOREAN_BLOB_READ_WRITE_TOKEN`) and what each one does.

4. Apply the database schema. `prisma db push` / `prisma migrate` work normally against a
   local `file:` database (they only fail against `libsql://` Turso — see `CLAUDE.md` §
   Schema changes for the Turso-specific DDL workflow):

   ```bash
   npx prisma db push
   ```

## First Run

Start the dev server:

```bash
npm run dev
```

This opens the app at **http://localhost:3000**. You will land on the login screen
(`/login`) first — enter the `APP_PASSWORD` you set in `.env.local`. `middleware.ts`
gates every route except `/login`, `/api/login`, and static/PWA assets.

Once logged in, the Home page (`/`) loads. It will be empty until you run a sync: go to
Settings → Advanced (`components/SyncPanel.tsx`) and trigger a sync, or `POST /api/sync`
directly. Each sync call processes one lesson from the configured Google Doc
(`NEXT_PUBLIC_GOOGLE_DOC_ID`) — repeat until `remaining` is `0`, or run
`npx tsx scripts/local-resync.mts` locally to pull in every lesson at once (bypasses the
Vercel 60s function-timeout constraint that limits the hosted `/api/sync` endpoint to one
lesson per call).

## Common Setup Issues

- **Login returns a 500, or the app 500s on any authenticated page.** `APP_PASSWORD` or
  `AUTH_SECRET` is unset in `.env.local`. `POST /api/login` needs `APP_PASSWORD`, and
  `computeAuthToken()` (`lib/auth.ts`) throws if `AUTH_SECRET` is missing — this affects
  every route behind `middleware.ts`, not just login.
- **Sync fails or the Google Doc can't be read.** Confirm `GOOGLE_SERVICE_ACCOUNT_KEY` is
  the full service-account JSON as a single-line string, and that the target Google Doc
  (`NEXT_PUBLIC_GOOGLE_DOC_ID`) is shared with that service account's email (link-view or
  explicit share) — `lib/google-docs.ts` requests read-only (`documents.readonly`) access.
- **`prisma db push` fails with error P1013.** This means `DATABASE_URL` is a `libsql://`
  Turso URL — the Prisma schema engine only speaks `file:`/postgres and cannot push
  schema changes to Turso directly. Use a local `file:` database for `db push`, or follow
  the manual DDL workflow in `CLAUDE.md` § Schema changes for Turso.
  `npx prisma studio` has the same limitation and will not connect to `libsql://`.
  either.
- **No audio plays when tapping the speaker icon.** `KOREAN_BLOB_READ_WRITE_TOKEN` (or
  `TTS_PROVIDER`/`ELEVENLABS_API_KEY`) is unset. `GET /api/tts` returns `503` in this
  case and `components/AudioButton.tsx` intentionally falls back to the browser's
  `window.speechSynthesis` — this is expected degraded behavior, not a crash.
- **Claude-backed routes (`/api/sync`, `/api/gloss`, `/api/generate`) error out.**
  `ANTHROPIC_API_KEY` is unset or invalid; the `Anthropic()` SDK client throws at call
  time rather than at startup, so the failure only surfaces when one of these routes is
  actually hit.

## Next Steps

- `docs/CONFIGURATION.md` — the full environment variable and DB-backed settings
  reference.
- `docs/ARCHITECTURE.md` — system overview, component diagram, and data flow.
- `CLAUDE.md` — full architecture and conventions reference, including the Turso schema
  DDL workflow and the Vercel 60-second function timeout constraint.
- `docs/DEVELOPMENT.md` (once available) — local dev workflow, build commands, code
  style, and PR conventions.
- `docs/TESTING.md` (once available) — running the Vitest unit test suite (`npm test`).
