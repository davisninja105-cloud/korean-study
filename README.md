# Korean Study

A personal, iPhone-first Korean spaced-repetition app. It syncs a Google Doc of
tutoring notes, uses Claude to exhaustively extract study cards (vocabulary, grammar,
phrases) with natural example sentences, and drills them with FSRS scheduling — built to
make a daily habit stick and make the multi-year climb to C1 reading feel visible.

**Live:** https://korean-study-five.vercel.app

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 + libSQL
(SQLite local / Turso prod) · Claude API (`claude-opus-4-8` extraction, `claude-haiku-4-5` gloss) ·
Google Docs API v1 · ElevenLabs / Google Neural2 TTS (swappable via `TTS_PROVIDER`) ·
Vercel Blob (TTS audio cache) · lucide-react · sharp (icon generation).

## Develop

```bash
npm run dev     # http://localhost:3000
npm run lint    # ESLint (strict — keep clean)
npm run build   # production build (runs `prisma generate` first)
```

Needs a `.env` / `.env.local` — see **Environment Variables** in `CLAUDE.md`:
`ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_GOOGLE_DOC_ID`,
`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PASSWORD`, `AUTH_SECRET`,
`ELEVENLABS_API_KEY`, `TTS_PROVIDER`, `KOREAN_BLOB_READ_WRITE_TOKEN`.

## Deploy

`git push origin main` → GitHub triggers a Vercel production deploy. The same Prisma code
runs against the local SQLite file and hosted Turso, so no provider switch is needed.
Schema changes need the libSQL DDL workflow (not `prisma db push`) — see `CLAUDE.md`.

## Test

```bash
npm test        # Vitest unit tests (pure lib functions — no DB/API needed)
```

Tests live in `tests/` (e.g. `sequence.test.ts`, `card-key.test.ts`, `known-words.test.ts`,
`habit.test.ts`, `sentence-match.test.ts`) and cover pure `lib/` logic only — no database or
network access is required to run them. See `docs/TESTING.md` for details.

## Scripts

Operational one-off/maintenance scripts live in `scripts/` and are run locally against Turso
via `@libsql/client` or `npx tsx` (see `CLAUDE.md` for the full list and usage notes):

- `local-resync.mts` — full re-extraction of all lessons, bypassing the Vercel 60s timeout
- `apply-graph-ddl.mjs`, `apply-sentence-ddl.mjs`, `add-lesson-order.mjs` — one-time schema DDL
- `wipe-card-data.mjs` — deletes all card/lesson/review data (keeps settings + habit history)
- `relink-dependencies.mjs` — rebuilds `CardDependency` edges from stored `components`
- `find-duplicates.mjs` — fuzzy scan for near-duplicate card fronts
- `full-resync.mjs` — drives repeated `POST /api/sync` calls until the backlog is drained
- `resequence-lessons.mjs`, `reextract-lesson.mjs`, `backfill-sentences.mjs`, `check-edges.mjs`,
  `debug-doc-structure.mjs` — targeted maintenance/debugging utilities
- `gen-icons.mjs` — rasterizes `public/icon.svg` into the PWA icon set via `sharp`

## Docs

- **`CLAUDE.md`** — architecture, data flow, conventions, and gotchas. Start here.
- **`plans/`** — the design-overhaul roadmap: the `fixes_needed.txt` audit translated into
  tiered plans. **P0 (foundations)**, **P1 (identity & retention)**, and **P2 (polish &
  delight)** are all complete and deployed.
- **`docs/ARCHITECTURE.md`** — system overview, component diagram, data flow, key abstractions.
- **`docs/GETTING-STARTED.md`** — prerequisites, install steps, first run, common setup issues.
- **`docs/DEVELOPMENT.md`** — local setup, build commands, code style, branch/PR conventions.
- **`docs/TESTING.md`** — test framework, running tests, writing new tests, CI integration.
- **`docs/CONFIGURATION.md`** — environment variables, required vs. optional settings, defaults.
- **`docs/API.md`** — API route reference: auth, endpoints, request/response formats, errors.
- **`docs/DEPLOYMENT.md`** — deployment targets, build pipeline, environment setup, rollback.
