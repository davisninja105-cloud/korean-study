# Technology Stack
_Last updated: 2026-07-01 (v1.2 Performance & Snappiness)_

## Summary

This is a Next.js 16 App Router application written in TypeScript 5, using React 19. Styling is done with Tailwind CSS v4 via PostCSS. The database layer uses Prisma 7 with a libSQL adapter targeting Turso (hosted SQLite) in production and a local `file:` SQLite in development. The app is deployed on Vercel (Hobby plan). Vitest covers the pure `lib/` functions (`npm test`); everything else (routes, components, RSC hydration behavior) is verified through strict ESLint (`eslint-config-next` with core-web-vitals + TypeScript rules) plus manual/browser verification. No new npm packages were added in v1.2 — the RSC + DTO hydration pattern, `loading.tsx` skeletons, and `Promise.allSettled` parallelization are all built into the existing Next.js 16 + React 19 stack.

---

## Languages & Runtime

| Item | Version | Notes |
|------|---------|-------|
| TypeScript | 5.9.3 | Strict mode; `moduleResolution: bundler` |
| JavaScript (ESM) | — | Scripts in `scripts/` use `.mjs`/`.mts` |
| Node.js | 25.8.2 (dev) | No engine pin in `package.json`; Vercel uses its own Node version |
| npm | 11.11.1 | `package-lock.json` lockfileVersion 3 present |

---

## Frameworks

| Framework | Version | Role |
|-----------|---------|------|
| Next.js | 16.2.1 | Full-stack React framework; App Router; serverless API routes |
| React | 19.2.4 | UI rendering |
| React DOM | 19.2.4 | DOM renderer |

**Key Next.js conventions used:**
- App Router (`app/` directory with `page.tsx`, `layout.tsx`, `route.ts`)
- Server Components by default; `'use client'` directive on interactive components
- `middleware.ts` for auth gating at the edge
- `app/manifest.ts` for PWA manifest generation

---

## Styling

| Tool | Version | Notes |
|------|---------|-------|
| Tailwind CSS | 4.2.2 | v4 syntax; configured via `@theme inline` in `app/globals.css` |
| `@tailwindcss/postcss` | 4.x | PostCSS integration (config: `postcss.config.mjs`) |

Tailwind v4 is configured entirely through CSS (`@theme inline`, `@custom-variant dark`) — there is **no `tailwind.config.js`**. Semantic design tokens are defined as CSS custom properties (`--surface-1/2/3`, `--reward`, `--button`, etc.) in `app/globals.css`.

---

## Database

| Tool | Version | Role |
|------|---------|------|
| Prisma | 7.6.0 | ORM / schema management / client generation |
| `@prisma/client` | 7.6.0 | Generated query client |
| `@prisma/adapter-libsql` | 7.6.0 | Prisma → libSQL driver adapter |
| `@libsql/client` | 0.17.2 | Low-level libSQL client (Turso wire protocol) |

Schema file: `prisma/schema.prisma`
Prisma client singleton: `lib/prisma.ts`

**Important constraint:** `prisma db push` / `prisma migrate` do NOT work with `libsql://` URLs. DDL must be applied manually via `@libsql/client` scripts in `scripts/`.

---

## Key Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | 0.80.0 | Claude API client (extraction, gloss, practice generation) |
| `ts-fsrs` | 5.3.1 | FSRS spaced-repetition algorithm (`lib/fsrs.ts`) |
| `@vercel/blob` | 2.4.1 | Vercel Blob storage for TTS audio cache |
| `google-auth-library` | 10.7.0 | OAuth2 token minting for Google Docs API |
| `lucide-react` | 1.17.0 | Icon set (nav, UI chrome) |
| `canvas-confetti` | 1.9.4 | Celebration animations (milestone, band-up) |
| `dotenv` | 17.3.1 | `.env` loading for local scripts |
| `sharp` | 0.34.5 | devDep — rasterizes `public/icon.svg` to PNG icon set via `scripts/gen-icons.mjs` |

---

## Build & Tooling

| Tool | Version / File | Purpose |
|------|---------------|---------|
| `next build` | — | Production build; runs `prisma generate` first (via `prebuild` in `scripts`) |
| `next dev` | — | Dev server at `http://localhost:3000` with hot reload |
| `prisma generate` | — | Regenerates Prisma client from `prisma/schema.prisma` |
| `npx tsx` | — | Runs `.mts` scripts (e.g., `scripts/local-resync.mts`) |
| PostCSS | `postcss.config.mjs` | Processes Tailwind v4 |

**Build script sequence:**
```bash
npm run build   # → prisma generate && next build
npm run dev     # → next dev
npm run lint    # → eslint
```

---

## Linting

| Tool | Version | Config |
|------|---------|--------|
| ESLint | 9.x | `eslint.config.mjs` |
| `eslint-config-next` | 16.2.1 | `core-web-vitals` + `typescript` rule sets |

ESLint is strict. Two rules are commonly triggered:
- `react-hooks/purity` — no impure calls (`Date.now()`, `Math.random()`) during render
- `react-hooks/set-state-in-effect` — no synchronous `setState` in effect bodies

No Prettier config detected. Formatting is not automated beyond ESLint.

---

## TypeScript Configuration

File: `tsconfig.json`

| Option | Value |
|--------|-------|
| `target` | `ES2017` |
| `strict` | `true` |
| `module` | `esnext` |
| `moduleResolution` | `bundler` |
| `paths` | `@/*` → `./*` (root alias) |
| `jsx` | `react-jsx` |
| `incremental` | `true` |

---

## Testing

| Tool | Version | Notes |
|------|---------|-------|
| Vitest | ^4.1.9 | `npm test` → `vitest run`; config at `vitest.config.ts` |

6 test files in `tests/` cover the pure `lib/` modules (`card-key`, `habit`, `known-words`, `proficiency`, `sentence-match`, `sequence`) — see `docs/TESTING.md` or `.planning/codebase/TESTING.md` for the full breakdown. Scope is deliberately narrow: no DB/API/component tests. Quality assurance beyond that relies on:
1. Strict TypeScript
2. Strict ESLint (`eslint-config-next`)
3. Manual / browser verification (RSC hydration and paint-timing behavior in particular cannot be unit tested)

---

## PWA / Assets

- `app/manifest.ts` — Next.js manifest route (PWA)
- `public/icon.svg` — Source icon (한 on brand-blue rounded square)
- `scripts/gen-icons.mjs` — Generates `icon-192.png`, `icon-512.png`, `apple-icon.png`, `icon-512-maskable.png` from SVG via `sharp`

---

## Scripts (`scripts/`)

Operational scripts run locally with `npx tsx` or `node`:

| Script | Purpose |
|--------|---------|
| `local-resync.mts` | Full re-extraction of all lessons (bypasses Vercel 60s timeout) |
| `wipe-card-data.mjs` | Deletes all card/lesson/review data |
| `apply-graph-ddl.mjs` | One-time DDL for `CardDependency` table |
| `relink-dependencies.mjs` | Retroactively rebuilds `CardDependency` edges |
| `find-duplicates.mjs` | Fuzzy scan for near-duplicate card fronts |
| `full-resync.mjs` | Drives repeated `POST /api/sync` until `remaining=0` |
| `gen-icons.mjs` | Rasterizes SVG icon to PNG set |

---

## Notable Config Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config (currently minimal / default) |
| `tsconfig.json` | TypeScript compiler options |
| `eslint.config.mjs` | ESLint flat config |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` |
| `prisma/schema.prisma` | Database schema (source of truth) |
| `.env` / `.env.local` | Local environment variables (not committed) |
| `middleware.ts` | Edge middleware for auth gating |
