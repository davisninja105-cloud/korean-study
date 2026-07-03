<!-- generated-by: gsd-doc-writer -->
# Development

This document covers local development setup, build/test commands, code style, and
branch/PR conventions for Korean Study.

## Local Setup

The project is a standard Next.js 16 App Router app using npm (see `package-lock.json`).

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/davisninja105-cloud/korean-study.git
   cd korean-study
   npm install
   ```
   `npm install` runs `postinstall: prisma generate` automatically, so the Prisma
   client is generated as part of install.

2. **Configure environment variables.** There is no `.env.example` checked into the
   repo — create `.env` and/or `.env.local` yourself with the variables documented in
   `docs/CONFIGURATION.md` (`ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`,
   `NEXT_PUBLIC_GOOGLE_DOC_ID`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PASSWORD`,
   `AUTH_SECRET`, `TTS_PROVIDER`, `ELEVENLABS_API_KEY`,
   `KOREAN_BLOB_READ_WRITE_TOKEN`). For a purely local database, set
   `DATABASE_URL="file:./dev.db"` and omit `DATABASE_AUTH_TOKEN`.

3. **Start the dev server:**
   ```bash
   npm run dev
   ```
   Serves the app at `http://localhost:3000` with hot reload.

4. **Schema changes are not applied with `prisma db push` / `prisma migrate`** —
   Turso's `libsql://` connection only speaks the libSQL wire protocol, not the
   Prisma schema engine's `file:`/postgres protocols (error `P1013`). To change the
   schema: edit `prisma/schema.prisma`, run `npx prisma generate`, generate DDL with
   `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
   then apply only the new `CREATE TABLE`/`ALTER` statements against Turso via a
   throwaway `@libsql/client` `executeMultiple()` script (see existing examples in
   `scripts/apply-graph-ddl.mjs` and `scripts/apply-sentence-ddl.mjs`). `prisma
   studio` also cannot connect to `libsql://`; inspect data via a script or `turso db
   shell korean-study`.

## Build Commands

All commands are run with `npm run <script>` (from `package.json` `scripts`):

| Command | Description |
|---|---|
| `npm run dev` | Starts the Next.js dev server at `http://localhost:3000` with hot reload. |
| `npm run build` | Production build. Runs `prisma generate` first, then `next build`. |
| `npm run start` | Serves the production build produced by `npm run build`. |
| `npm run lint` | Runs ESLint (`eslint`) over the project. Must pass with zero errors. |
| `npm test` | Runs the Vitest suite (`vitest run`) — pure `lib/` unit tests, no DB or network access required. |
| `npm run postinstall` | Runs automatically after `npm install`; regenerates the Prisma client (`prisma generate`). Not normally invoked directly. |

Two commands are not in `package.json` scripts but are used routinely:

```bash
npx prisma generate   # regenerate the Prisma client after editing prisma/schema.prisma
npx tsx scripts/local-resync.mts   # bulk re-extraction of all lessons, run locally (see docs/ARCHITECTURE.md)
```

## Code Style

- **Linter:** ESLint 9, configured in `eslint.config.mjs` using the flat-config
  format. It composes `eslint-config-next/core-web-vitals` and
  `eslint-config-next/typescript` (`eslint-config-next` 16.2.1) with no additional
  project rule overrides beyond restoring the default `.next/**`, `out/**`,
  `build/**`, `next-env.d.ts` ignores. Run it with:
  ```bash
  npm run lint
  ```
  Lint is expected to be clean (zero errors) at all times. Two rules from this config
  are worth knowing before writing new code:
  - `react-hooks/purity` — forbids impure calls during render (`Date.now()`,
    `Math.random()`, no-arg `new Date()`). Read time/randomness in effects or event
    handlers instead, or use a seeded pseudo-RNG (see `seededShuffle` in
    `components/StudySession.tsx`).
  - `react-hooks/set-state-in-effect` — forbids calling `setState` synchronously in
    an effect body; do it inside an async callback (e.g. `fetch().then(setX)`) or an
    event handler instead.
- **Formatter:** There is no Prettier, Biome, or `.editorconfig` configuration in the
  repository. Formatting is enforced only insofar as ESLint's rules touch style;
  match the existing formatting conventions in the file you're editing (2-space
  indentation, single quotes in most `lib/` and `scripts/` files).
- **TypeScript:** `tsconfig.json` has `"strict": true`. All new code must satisfy
  strict-mode checks (`noImplicitAny`, `strictNullChecks`, etc). The path alias
  `@/*` maps to the project root — prefer `@/lib/...` imports over deep relative
  paths.

## Branch Conventions

There is no `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, or documented
branch-naming convention in this repository. `main` is the default branch and the
only branch that deploys — pushing to it triggers an automatic Vercel production
deploy. The one other branch currently in the repo is
`ultraplan/ux-improvements`, a `<workstream>/<description>` style name, which can be
used as an informal precedent for feature branches.

## PR Process

There is no PR template or documented review process in this repository — it is a
single-maintainer project. In practice:

- Changes are committed directly to `main`, or developed on a short-lived branch and
  merged into `main` when ready.
- `git push origin main` (or merging a branch into `main` and pushing) is the deploy
  trigger — GitHub pushes to `main` cause Vercel to build and deploy automatically.
- Run `npm run lint` and `npm test` before pushing; both are expected to pass clean.
- If a schema change is included, apply the corresponding DDL to Turso (see Local
  Setup above) as part of the same change, since `prisma generate` alone does not
  touch the database.
