# Phase 24: Freshness Diagnosis Spike - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 2 (1 script to create, 1 diagnosis doc to create — zero production code changes)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|------------------|----------------|
| `scripts/diagnose-freshness.mts` | script (utility/orchestration) | batch / event-driven (browser automation + child-process orchestration) | `scripts/local-resync.mts` | role-match (same script shape: env-first `.mts`, dynamic imports, single-run orchestration loop) — no existing analog for the Playwright/browser-automation portion, no existing analog for DB seeding either |
| `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md` | doc (planning artifact) | n/a | Other phases' `*-VALIDATION.md` / `*-REVIEW.md` docs (structural convention only — matrix + narrative) | role-match (document convention, not code) |

There are no other new/modified files — CONTEXT.md's Phase Boundary is explicit: "no fix and no production code changes."

## Pattern Assignments

### `scripts/diagnose-freshness.mts` (script, batch/event-driven)

**Primary analog:** `scripts/local-resync.mts` (full file read above)

**1. Env-first dynamic-import pattern** (lines 12-28 of `local-resync.mts`):
```typescript
// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we use
// dynamic imports below to ensure Prisma / Anthropic SDK see the right env vars).
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at module init.
const { prisma } = await import('../lib/prisma.js')
```
**Apply to the new script as:** set `process.env.DATABASE_URL = 'file:./scripts/.tmp/24-diagnosis.db'` and a throwaway `process.env.AUTH_SECRET` **before** any dynamic import — do NOT call `config()` from the real `.env`/`.env.local` for these two vars (that would leak the real Turso URL / real secret; see the hard-fail guard below). Still fine to `config()` the real `.env` first for unrelated vars (none needed here) then override `DATABASE_URL`/`AUTH_SECRET`/`APP_PASSWORD` afterward. Use the same `.js`-extension-on-relative-TS-import convention: `await import('../lib/prisma.js')`, `await import('../lib/auth.js')`.

**2. Hard-fail guard against the real Turso DB** (new pattern, not in `local-resync.mts` since that script targets Turso *intentionally*) — mirror the spirit of this repo's Turso-gotcha awareness (CLAUDE.md) with an explicit safety check:
```typescript
if (process.env.DATABASE_URL?.startsWith('libsql://')) {
  console.error('Refusing to run: DATABASE_URL points at a hosted libsql:// DB. This script must only target a local file: test DB.')
  process.exit(1)
}
```

**3. Progress logging style** (throughout `local-resync.mts`, e.g. lines 33, 48-53, 224-231): plain `console.log`/`console.error` with `[i/total]` progress markers, `✓`/`✗` prefixes for success/failure, and a `'='.repeat(50)` banner + summary block at the end. Reuse this exact style for the 16-cell diagnosis loop and final summary.

**4. `process.exit(0)` / `process.exit(1)` explicit exit codes** (lines 31, 50, 233) — the script is a one-shot CLI run, not a long-lived process; follow the same explicit-exit convention (with a `finally`-style teardown for the spawned server child process and browser, per RESEARCH.md Pattern 5's teardown note).

**5. Sequential `for` loop over units of work with per-unit try/catch** (lines 69-209: one lesson at a time, each wrapped so one failure doesn't abort the run) — apply the same shape to the 16 route×path cells: wrap each cell's Playwright interaction in try/catch, log failures, and continue to the next cell rather than aborting the whole diagnosis run.

**No analog for:** Playwright browser automation, `child_process` orchestration of `npm run build && npm start`, RSC-request-signature detection, `visibilitychange` override, and DB seeding via direct Prisma calls against an isolated `file:` DB — none of these exist anywhere in this codebase yet. Build these fresh per RESEARCH.md's Architecture Patterns section (Patterns 1-6), which is the authoritative source for this net-new territory.

---

### Auth cookie injection sub-pattern

**Analog:** `lib/auth.ts` (full file read above, 34 lines — no separate excerpt needed, it's small enough to import as-is)

```typescript
export const AUTH_COOKIE = 'ks_auth'
const MESSAGE = 'korean-study-authenticated'

export async function computeAuthToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(MESSAGE))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
```

**Apply to script:** dynamically `import('../lib/auth.js')` for both `computeAuthToken` and `AUTH_COOKIE` (do not hardcode `'ks_auth'` in the script — import the constant so cookie name stays in sync with `middleware.ts` if it ever changes). The script's `process.env.AUTH_SECRET` must be set to the **same** throwaway value passed to the spawned `npm run start` child process's env — the cookie only validates if both sides compute against an identical secret.

---

### Prisma client construction sub-pattern (for reference — the script needs its OWN client, not the singleton)

**Analog:** `lib/prisma.ts` (full file, 19 lines)

```typescript
import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

function createPrismaClient() {
  // authToken is required for hosted Turso (libsql://…); omitted for local file DBs.
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  return new PrismaClient({ adapter })
}
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
```

**Apply to script:** DO NOT import this singleton directly for seeding — importing `lib/prisma.js` dynamically (as `local-resync.mts` does) is actually fine and correct **as long as `process.env.DATABASE_URL` has already been overridden to the isolated `file:` test path before the dynamic import happens** (per Pattern 1 above — module-init-time env read). This is the same mechanism `local-resync.mts` already relies on; no need to hand-roll a second `PrismaClient`/`PrismaLibSql` construction — just ensure env-override-before-import ordering is correct. `authToken` is safely `undefined` for a `file:` URL (matches the singleton's own comment).

---

### Prisma schema shapes for seed data

**Source:** `prisma/schema.prisma` (read directly, lines 10-150)

Minimal fixture needs, per RESEARCH.md's Code Examples + this schema read:

```prisma
model Lesson {
  id          String   @id @default(cuid())
  orderIndex  Int      @default(0)
  title       String
  rawContent  String
  contentHash String   @unique   // required, must be unique per seed run
}

model Card {
  id              String   @id @default(cuid())
  type            String   // "vocabulary" | "grammar" | "phrase"
  front           String
  back            String
  normalizedFront String   @unique  // required — dedup key, must be pre-normalized
  lessonId        String?
  sentences       Sentence[]
  review          CardReview?
}

model Sentence {
  id          String @id @default(cuid())
  cardId      String
  korean      String
  targetForm  String
  translation String
  orderIndex  Int    @default(0)
}

model CardReview {
  id            String    @id @default(cuid())
  cardId        String    @unique
  state         Int       @default(0)    // 0=New,1=Learning,2=Review,3=Relearning
  stability     Float     @default(0)
  difficulty    Float     @default(0)
  elapsedDays   Int       @default(0)
  scheduledDays Int       @default(0)
  reps          Int       @default(0)
  lapses        Int       @default(0)
  nextReview    DateTime  @default(now())   // set to a PAST Date to make it "due"
  lastReview    DateTime?
}
```

**Seed pattern to reuse (nested-create, matches `local-resync.mts` lines 122-143):**
```typescript
const created = await prisma.card.create({
  data: {
    type: 'vocabulary',
    front: '안녕',
    back: 'hello',
    normalizedFront: '안녕',
    lessonId: lesson.id,
    sentences: {
      create: [{ korean: '안녕하세요', targetForm: '안녕', translation: 'Hello', orderIndex: 0 }],
    },
    review: { create: { state: 1, stability: 1, difficulty: 5, nextReview: new Date(Date.now() - 60_000) } },
  },
})
```
This nested-create shape (`sentences: { create: [...] }`, `review: { create: {} }`) is copied verbatim from `local-resync.mts` lines 133-141 — it is this codebase's one and only precedent for constructing a `Card` + `Sentence[]` + `CardReview` graph in one call.

---

## Shared Patterns

### Dotenv / env-loading order
**Source:** `scripts/local-resync.mts` lines 12-28
**Apply to:** the diagnosis script's env setup — critical that `DATABASE_URL`/`AUTH_SECRET`/`APP_PASSWORD` overrides happen before ANY dynamic import of `lib/prisma.js` or `lib/auth.js`, and are passed identically to both the `npm run build` and `npm run start` child-process `env` objects (RESEARCH.md Pitfall 3 — build/run env mismatch).

### `.mts` script conventions
**Source:** `scripts/local-resync.mts` (whole file), reinforced by CLAUDE.md's "Scripts (`scripts/`)" section
**Apply to:** kebab-case filename, `.mts` extension (imports `lib/` modules), header JSDoc-style comment block explaining usage + required env vars, run via `npx tsx scripts/diagnose-freshness.mts`.

### Deterministic HMAC auth cookie
**Source:** `lib/auth.ts` (whole file)
**Apply to:** cookie injection into the Playwright browser context — see "Auth cookie injection sub-pattern" above.

### Progress/summary console output style
**Source:** `scripts/local-resync.mts` lines 33-53, 224-231
**Apply to:** the diagnosis script's per-cell logging and final banner summary before handing the raw log to `24-DIAGNOSIS.md`.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Playwright browser automation (chromium launch, `page.on('request')`, cookie/context setup) | script | event-driven | No Playwright usage anywhere in this repo yet — net new. Use RESEARCH.md Architecture Patterns 3, 4, 6 as the authoritative reference instead of a codebase analog. |
| `child_process` orchestration of `npm run build && npm start` on a non-default port with polling | script | batch | No existing script spawns the Next.js server itself (only `local-resync.mts` talks to Prisma/Anthropic directly, no server spawn). Use RESEARCH.md Pattern 5. |
| DB seed script (standalone, non-extraction-based) | script | CRUD (seed/fixture) | `scripts/` has no generic seeder — the closest thing (`local-resync.mts`) seeds via real Claude extraction against a real Google Doc, not applicable. Use the nested-create shape above (borrowed from `local-resync.mts`'s upsert-Card block) combined with the schema fields read directly from `prisma/schema.prisma`. |
| `24-DIAGNOSIS.md` structure (matrix + per-stale-path scenario blocks) | doc | n/a | This is a first-of-its-kind document shape for this project (no prior "diagnosis" doc exists in `.planning/phases/*`). CONTEXT.md D-08/D-09/D-10 fully specify its required structure — treat CONTEXT.md's decisions section as the template, not a codebase file. |

## Metadata

**Analog search scope:** `scripts/*.mts`, `lib/auth.ts`, `lib/prisma.ts`, `prisma/schema.prisma`, `prisma.config.ts` (referenced, not separately excerpted — confirms env-driven `DATABASE_URL` for `db push`)
**Files scanned:** `scripts/local-resync.mts`, `lib/auth.ts`, `lib/prisma.ts`, `prisma/schema.prisma` (Lesson/Card/Sentence/CardReview/CardDependency models), CONTEXT.md, RESEARCH.md
**Pattern extraction date:** 2026-07-10
