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
    reducedMotion: 'reduce', // Pitfall 11 — stabilizes animation timing
  },
  globalSetup: require.resolve('./e2e/global-setup.ts'),
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
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
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
