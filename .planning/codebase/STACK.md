# Technology Stack

**Analysis Date:** 2026-07-02

## Languages

**Primary:**
- TypeScript 5.9.3 - Full codebase, strict mode enabled
- JavaScript (Node.js ES2017 target) - Scripts and configuration

**Runtime:**
- Node.js 25.8.2 (development verified; Vercel runs its own Node version in production)

## Runtime

**Environment:**
- Node.js (v25.8.2 local, managed by Vercel in production)

**Package Manager:**
- npm 11.11.1
- Lockfile: `package-lock.json` (lockfileVersion 3) — committed

## Frameworks

**Core:**
- Next.js 16.2.1 - Full-stack React framework; App Router with serverless API routes
- React 19.2.4 - UI rendering via functional components and hooks
- React DOM 19.2.4 - DOM mounting

**Testing:**
- Vitest 4.1.9 - Unit test runner for pure `lib/` functions; `npm test` runs in Node environment

**Build/Dev:**
- TypeScript 5.9.3 - Compilation with strict mode
- PostCSS with `@tailwindcss/postcss` 4.x - CSS processing (Tailwind v4 via `@import` syntax)
- ESLint 9.x with `eslint-config-next` 16.2.1 - Linting with core-web-vitals + TypeScript rulesets
- `npx tsx` - TypeScript script runner for local operational scripts

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` 0.80.0 - Claude API client for card extraction (opus-4-8 with adaptive thinking), tap-to-gloss lookup (haiku-4-5), and practice generation
- `@prisma/client` 7.6.0 - ORM query client (generated from `prisma/schema.prisma`)
- `@prisma/adapter-libsql` 7.6.0 - Prisma adapter for libSQL (Turso) connections

**Infrastructure:**
- `@libsql/client` 0.17.2 - Low-level libSQL/Turso database client (SQLite wire protocol)
- `@vercel/blob` 2.4.1 - Vercel Blob storage for TTS audio caching via SHA256 hash keys
- `google-auth-library` 10.7.0 - OAuth2 service account token minting for Google Docs API and Cloud TTS

**Domain Logic:**
- `ts-fsrs` 5.3.1 - FSRS spaced-repetition algorithm (grades 1–4 → stability/difficulty state updates)

**UI & Delight:**
- `lucide-react` 1.17.0 - Icon library (navigation, settings, UI chrome)
- `canvas-confetti` 1.9.4 - Celebration animations (milestone reach, CEFR band advancement)
- `dotenv` 17.3.1 - `.env` file parsing (dev/scripts only, not production)

## Configuration

**Environment:**
- Environment variables read server-side (except `NEXT_PUBLIC_*` which are safe for client)
- Development: `.env` / `.env.local` (not committed)
- Production: Vercel dashboard environment variables

**Build:**
- `tsconfig.json` - TypeScript compiler options (ES2017 target, bundler resolution, strict mode)
- `eslint.config.mjs` - ESLint flat config with Next.js + TypeScript rulesets
- `postcss.config.mjs` - PostCSS config enabling Tailwind v4 via `@tailwindcss/postcss` plugin
- `next.config.ts` - Next.js config (currently minimal, no custom settings)
- `vitest.config.ts` - Vitest config (Node.js environment for pure lib testing)

## Platform Requirements

**Development:**
- Node.js 24+ (tested with 25.8.2)
- npm 11+
- ESLint 9.x compatible shell environment
- macOS/Linux/Windows

**Production:**
- Vercel Hobby plan (serverless)
  - Hard 60-second function timeout (maxDuration=300 in code has no effect)
  - Automatic GitHub `main` → auto-deploy integration
- Turso account with hosted libSQL database (SQLite)
- Google Cloud project with Docs API + Cloud Text-to-Speech APIs enabled
- (Optional) ElevenLabs account for TTS (if `TTS_PROVIDER=elevenlabs`)
- Vercel Blob storage (public store) for TTS audio cache

---

*Stack analysis: 2026-07-02*
