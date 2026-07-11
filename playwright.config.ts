import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { TEST_DB_URL } from './e2e/helpers/test-db'
import { assertLocalDb } from './e2e/helpers/build-guard'

// Optional, gitignored — test-only AUTH_SECRET/APP_PASSWORD overrides. The
// harness runs correctly with no .env.test present at all (the ?? fallbacks
// below cover that case), so there is zero required user setup.
loadEnv({ path: '.env.test' })

// E2E-03 defense-in-depth (config-load time, before any build/server/browser
// work): if an ambient DATABASE_URL exists anywhere in the invoking
// environment (e.g. a dev shell), refuse to proceed rather than silently
// ignoring it — an ambient remote URL is treated as a misconfiguration
// tripwire even though the harness itself never consumes process.env.DATABASE_URL
// for its own connections (every connection below pins TEST_DB_URL).
if (process.env.DATABASE_URL) {
  assertLocalDb(process.env.DATABASE_URL)
}
// Structural self-check that survives future edits to test-db.ts.
assertLocalDb(TEST_DB_URL)

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // D-07 / Pitfall 10 — must be top-level, not per-project
  workers: 1,
  retries: 0, // no CI this phase (D-14) — local runs should surface real flakes, not mask them
  reporter: 'line', // E2E-07: parseable by human + agent
  use: {
    baseURL: BASE_URL,
    // DEVIATION (documented, deliberate): E2E-07's requirement text
    // parenthetically names 'on-first-retry', but with retries: 0 locked
    // above (Ambiguity 4 — retries would mask the SQLite-race class Pitfall
    // 10 warns about, and would double-run the deliberately-red freshness
    // specs), 'on-first-retry' never fires and NO trace would ever be
    // produced — making E2E-07's actual behavior ("a failed run emits a
    // trace") unsatisfiable. 'retain-on-failure' produces a trace for every
    // genuinely failed test with zero retries, satisfying the requirement's
    // behavior over its parenthetical mechanism.
    trace: 'retain-on-failure',
    // Pitfall 11 — stabilizes animation timing (this installed @playwright/test
    // version nests reducedMotion under contextOptions, not as a top-level use key).
    contextOptions: { reducedMotion: 'reduce' },
  },
  // DEVIATION (documented, deliberate — see e2e/run-global-setup.ts's header
  // comment and 25-01-SUMMARY.md "globalSetup vs webServer ordering" for the
  // full finding): NOT wiring `globalSetup:` here. Playwright's own
  // `globalSetup` config hook loads the target file via Node's native
  // loader, which does not understand this project's tsconfig.json `@/*`
  // path alias — every attempt to load e2e/global-setup.ts through that
  // hook throws `Cannot find module '@/app/generated/prisma/client'`
  // (confirmed via the loader stack trace: node:internal/modules/esm/loader
  // -> Object.setup in playwright/lib/runner/index.js's
  // createGlobalSetupTask). The DB reset/push/seed instead runs via
  // e2e/run-global-setup.ts, invoked through the local `tsx` binary (which
  // DOES resolve tsconfig paths correctly) chained at the front of
  // webServer.command below — see that file for the full ordering finding.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Prod build only (D-12) — never dev mode. -H 127.0.0.1 is the WR-02
    // loopback carry-forward (never bind 0.0.0.0 for a weak-fixed-password app).
    // `tsx e2e/run-global-setup.ts` runs FIRST: empirically, this installed
    // @playwright/test version starts the webServer BEFORE the `globalSetup`
    // config hook below (see e2e/run-global-setup.ts's header comment for
    // the full finding), and `npm run build`'s static prerendering reads
    // DB-backed Settings even for unauthenticated routes — so the isolated
    // test DB must exist and be seeded before `npm run build` runs, not just
    // before the test run. Uses the local `tsx` devDependency (node_modules/
    // .bin, on PATH; added this plan) rather than an ad-hoc `npx tsx` call, so
    // this critical bootstrap step never depends on npx's on-demand package
    // resolution — `--tsconfig ./tsconfig.json` makes the `@/*` path-alias
    // resolution explicit and unambiguous regardless of invocation context.
    command: `tsx --tsconfig ./tsconfig.json e2e/run-global-setup.ts && npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Playwright only forwards webServer STDERR to the reporter by default
    // (stdout is silently dropped) — without this, e2e/global-setup.ts's
    // informational "[global-setup]" milestone lines (stdout) would never
    // appear in a captured run log, defeating the ordering-check acceptance
    // criterion (confirming global-setup runs before the Next.js build output).
    stdout: 'pipe',
    env: {
      DATABASE_URL: TEST_DB_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-test-secret',
      APP_PASSWORD: process.env.APP_PASSWORD ?? 'e2e-test-password',
      // Blanked so the real Turso token can never reach the child even via
      // env merge — mirrors scripts/diagnose-freshness.mts's delete of this var.
      DATABASE_AUTH_TOKEN: '',
    },
  },
})
