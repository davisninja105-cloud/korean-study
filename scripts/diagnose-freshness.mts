/**
 * Phase 24 throwaway freshness-diagnosis script — Plan 24-01 (plumbing + smoke).
 *
 * THIS IS NOT THE PHASE 25 E2E HARNESS. It intentionally has no
 * playwright.config.ts, no tests-e2e/ directory, and no persistent test
 * conventions (D-01). It exists solely to prove out the DB-isolation, seed,
 * prod-server-orchestration, and cookie-auth plumbing before Plan 24-02 adds
 * the real 16-cell navigation-matrix instrumentation on top.
 *
 * This script ONLY EVER targets an isolated local `file:` SQLite test
 * database (scripts/.tmp/24-diagnosis.db) — never the real Turso
 * DATABASE_URL and never prisma/dev.db. See assertLocalDb() below.
 *
 * Usage:
 *   npx tsx scripts/diagnose-freshness.mts
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dir = path.dirname(fileURLToPath(import.meta.url))

// ── Module-scope constants ──────────────────────────────────────────────
const DIAG_PORT = 3200
const BASE_URL = `http://localhost:${DIAG_PORT}`
const TEST_DB_PATH = path.resolve(__dir, '.tmp', '24-diagnosis.db')
const TEST_DB_URL = `file:${TEST_DB_PATH}`
const THROWAWAY_SECRET = 'diagnosis-throwaway-secret'
const THROWAWAY_APP_PASSWORD = 'diagnosis-throwaway-password'

// ── Hard-fail DB-isolation guard (T-24-01) ──────────────────────────────
// Defined as a reusable helper because it must run TWICE: once immediately
// after the env override below, and again on the childEnv object right
// before the server spawn (defense in depth against a future edit that
// forgets to pin childEnv.DATABASE_URL).
function assertLocalDb(url: string | undefined): void {
  if (url && url.startsWith('libsql://')) {
    console.error('✗ FATAL: DATABASE_URL points at a hosted Turso instance (libsql://…).')
    console.error('  This script must only ever target an isolated local file: test database.')
    console.error(`  Refusing to proceed. Got: ${url}`)
    process.exit(1)
  }
}

// ── Env override BEFORE any dynamic import of lib/prisma.js or lib/auth.js ──
// Real .env / .env.local are never loaded for these vars (T-24-01, T-24-02) —
// the real Turso URL and real AUTH_SECRET must never enter this process.
process.env.DATABASE_URL = TEST_DB_URL
process.env.AUTH_SECRET = THROWAWAY_SECRET
process.env.APP_PASSWORD = THROWAWAY_APP_PASSWORD
delete process.env.DATABASE_AUTH_TOKEN

assertLocalDb(process.env.DATABASE_URL)

// Dynamic import AFTER env override — static imports are hoisted in ESM and
// would read process.env before the lines above run (repo convention, see
// scripts/local-resync.mts).
const { prisma } = await import('../lib/prisma.js')
const { normalizeFront } = await import('../lib/card-key.js')

// ── waitForServer: poll instead of a fixed sleep ────────────────────────
async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return // 200 or a redirect to /login both prove the server is up
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms: ${url}`)
}

// ── Build-output sanity gate (Pitfall 4): confirm all 4 routes are dynamic ──
function checkRouteIsDynamic(buildOutput: string, routePath: string): boolean {
  const lines = buildOutput.split('\n')
  for (const rawLine of lines) {
    // Strip Next.js's tree-drawing characters and leading whitespace.
    const cleaned = rawLine.replace(/^[\s┌├└│]+/, '').trim()
    const match = cleaned.match(/^([ƒ○●λ])\s+(\/\S*)/)
    if (!match) continue
    const [, marker, routeInLine] = match
    if (routeInLine === routePath) return marker === 'ƒ'
  }
  return false // route not found in the output at all — treat as a failure
}

// ── Graceful server teardown ─────────────────────────────────────────────
async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.killed) return
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve())
    server.kill('SIGTERM')
    // Fallback in case SIGTERM doesn't terminate the child quickly.
    setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5000)
  })
}

console.log('='.repeat(50))
console.log('Phase 24 freshness-diagnosis: plumbing + smoke check')
console.log('='.repeat(50))
console.log()

let server: ChildProcess | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let exitCode = 0

try {
  // ── Fresh-run reset ────────────────────────────────────────────────────
  console.log('→ Resetting isolated test DB…')
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
  rmSync(TEST_DB_PATH, { force: true })
  console.log(`  ✓ ${TEST_DB_PATH} cleared (or did not exist)`)
  console.log()

  // ── Schema setup ───────────────────────────────────────────────────────
  console.log('→ Pushing schema to isolated test DB…')
  // Note: this repo's installed Prisma CLI (7.6.0) does not accept
  // --skip-generate on `db push` (verified live; the flag was rejected with
  // "unknown or unexpected option"). Client generation already happened via
  // `npm run build`'s own `prisma generate` step in this and every prior
  // repo checkout, so omitting it here is a no-op either way.
  execSync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit',
  })
  console.log('  ✓ Schema pushed')
  console.log()

  // ── Seed fixture data ────────────────────────────────────────────────────
  console.log('→ Seeding fixture data (1 lesson, 3 cards, 3 due reviews)…')
  const lesson = await prisma.lesson.create({
    data: {
      title: 'Diagnosis fixture',
      rawContent: '',
      contentHash: 'diagnosis-fixture',
      orderIndex: 1,
    },
  })

  const fixtureCards = [
    {
      front: '안녕',
      back: 'hello',
      korean: '안녕하세요, 저는 학생이에요',
      targetForm: '안녕',
      translation: 'Hello, I am a student',
    },
    {
      front: '학교',
      back: 'school',
      korean: '저는 매일 학교에 가요',
      targetForm: '학교',
      translation: 'I go to school every day',
    },
    {
      front: '감사하다',
      back: 'to thank',
      korean: '저는 선생님께 감사해요',
      targetForm: '감사해요',
      translation: 'I am thankful to my teacher',
    },
  ]

  const nextReviewOneMinuteAgo = new Date(Date.now() - 60_000)
  for (const fc of fixtureCards) {
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: fc.front,
        back: fc.back,
        normalizedFront: normalizeFront(fc.front),
        lessonId: lesson.id,
        sentences: {
          create: [{ korean: fc.korean, targetForm: fc.targetForm, translation: fc.translation, orderIndex: 0 }],
        },
        review: {
          create: {
            state: 1,
            stability: 1,
            difficulty: 5,
            nextReview: nextReviewOneMinuteAgo,
          },
        },
      },
    })
  }
  console.log(`  ✓ Seeded lesson "${lesson.title}" + ${fixtureCards.length} due cards`)
  console.log()

  // ── Build (Pattern 5 + Pitfall 3): ONE childEnv object for build AND start ──
  console.log('→ Building production bundle (npm run build)…')
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: TEST_DB_URL,
    AUTH_SECRET: THROWAWAY_SECRET,
    APP_PASSWORD: THROWAWAY_APP_PASSWORD,
  }
  const buildOutput = execSync('npm run build', { env: childEnv, encoding: 'utf-8' })
  console.log(buildOutput)

  const routesToCheck = ['/', '/cards', '/study', '/habits']
  const dynamicResults = routesToCheck.map((route) => ({
    route,
    isDynamic: checkRouteIsDynamic(buildOutput, route),
  }))
  console.log('  Route dynamic-rendering check (Pitfall 4 sanity gate):')
  for (const { route, isDynamic } of dynamicResults) {
    console.log(`    ${isDynamic ? '✓' : '✗'} ${route} — ${isDynamic ? 'dynamic (ƒ)' : 'NOT dynamic'}`)
  }
  const anyNotDynamic = dynamicResults.some((r) => !r.isDynamic)
  if (anyNotDynamic) {
    throw new Error(
      'One or more of /, /cards, /study, /habits is NOT rendering as dynamic (ƒ) in the build output. ' +
        'This invalidates the force-dynamic assumption this phase depends on — aborting before any browser work.'
    )
  }
  console.log('  ✓ All four routes confirmed dynamic')
  console.log()

  // ── Start + readiness poll (Pattern 5) ──────────────────────────────────
  console.log(`→ Starting production server on port ${DIAG_PORT}…`)
  assertLocalDb(childEnv.DATABASE_URL) // defense-in-depth re-check right before spawn
  server = spawn('npm', ['run', 'start', '--', '-p', String(DIAG_PORT)], {
    env: childEnv,
    stdio: 'inherit',
  })
  await waitForServer(`${BASE_URL}/login`)
  console.log('  ✓ Server is up')
  console.log()

  // ── Browser + auth (Pattern 6, D-03) ────────────────────────────────────
  console.log('→ Launching Chromium and injecting auth cookie…')
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()

  const { computeAuthToken, AUTH_COOKIE } = await import('../lib/auth.js')
  const token = await computeAuthToken()
  await context.addCookies([{ name: AUTH_COOKIE, value: token, url: BASE_URL }])
  console.log('  ✓ Cookie injected')
  console.log()

  // ── Smoke check ──────────────────────────────────────────────────────────
  console.log('→ Smoke check: loading / and verifying due count…')
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/`, { waitUntil: 'load' })

  const currentUrl = new URL(page.url())
  if (currentUrl.pathname !== '/') {
    throw new Error(
      `Expected to land on / but got ${currentUrl.pathname} — cookie auth likely failed (redirected to /login).`
    )
  }
  console.log(`  ✓ Landed on ${currentUrl.pathname} (not redirected to /login — cookie auth worked)`)

  const expectedDueCount = await prisma.cardReview.count({
    where: { nextReview: { lte: new Date() } },
  })

  const dueCountLocator = page.locator('span.text-reward.text-6xl').first()
  const dueCountText = await dueCountLocator.textContent({ timeout: 15_000 })
  console.log(`  Matched due-count element text: "${dueCountText}"`)

  const observedDueCount = Number((dueCountText ?? '').trim())
  if (Number.isNaN(observedDueCount) || observedDueCount !== expectedDueCount) {
    throw new Error(
      `Due-count mismatch: expected ${expectedDueCount} (live query), observed "${dueCountText}" on the page.`
    )
  }

  console.log()
  console.log(`SMOKE OK: due count = ${observedDueCount} (matches live query of ${expectedDueCount})`)
} catch (err) {
  exitCode = 1
  console.error()
  console.error('✗ FAILED:', err instanceof Error ? err.message : err)
} finally {
  console.log()
  console.log('→ Tearing down…')
  if (browser) {
    await browser.close()
    console.log('  ✓ Browser closed')
  }
  if (server) {
    await stopServer(server)
    console.log('  ✓ Server stopped')
  }
  await prisma.$disconnect()
  console.log('  ✓ Prisma disconnected')
  console.log()
  console.log('='.repeat(50))
  console.log(exitCode === 0 ? 'Diagnosis plumbing run: SUCCESS' : 'Diagnosis plumbing run: FAILED')
  console.log('='.repeat(50))
}

process.exit(exitCode)
