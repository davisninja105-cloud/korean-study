/**
 * CLI wrapper for e2e/global-setup.ts's default export. Invoked directly
 * from webServer.command's `tsx --tsconfig ./tsconfig.json e2e/run-global-setup.ts`
 * — deliberately NOT via playwright.config.ts's `globalSetup:` field. Two
 * empirically-confirmed findings, both documented in
 * 25-01-SUMMARY.md "globalSetup vs webServer ordering":
 *
 * FINDING 1 (ordering): this installed @playwright/test version (1.61.1)
 * runs the webServer plugin's setup() — which spawns `npm run build && npm
 * run start` and blocks until the server responds — BEFORE Playwright's own
 * `globalSetup` config hook, not after (the reverse of what the plan's
 * ORDERING CHECK anticipated needing to verify). Confirmed by reading
 * node_modules/playwright/lib/runner/index.js's createGlobalSetupTasks():
 * task order is [removeOutputDirs, ...pluginSetupTasks (webServer lives
 * here), ...globalTeardowns, ...globalSetups]. Since Next.js's `npm run
 * build` statically prerenders routes (e.g. /_not-found) that read DB-backed
 * Settings via lib/settings.ts even for unauthenticated pages, `npm run
 * build` fails outright if the isolated test DB file does not already exist
 * — so the DB must be reset/pushed/seeded before `npm run build` runs, not
 * merely before the test run.
 *
 * FINDING 2 (the actual hard blocker — why `globalSetup:` isn't wired at
 * all): Playwright's own `globalSetup` config hook loads the target file via
 * Node's NATIVE module loader (confirmed via the failing stack trace:
 * node:internal/modules/esm/loader -> Object.setup in
 * playwright/lib/runner/index.js's createGlobalSetupTask), which does NOT
 * understand this project's tsconfig.json `@/*` path alias. Every attempt to
 * load e2e/global-setup.ts that way — which transitively imports lib/prisma
 * via e2e/seed.ts's getTestPrisma(), and lib/prisma.ts imports
 * `@/app/generated/prisma/client` — throws `Cannot find module
 * '@/app/generated/prisma/client'`. `tsx` DOES correctly resolve tsconfig
 * paths (confirmed via multiple standalone reproductions), so invoking this
 * wrapper exclusively through `tsx` in webServer.command — and never through
 * Playwright's own `globalSetup:` field — is the fix, not a workaround.
 */

import globalSetup from './global-setup'

globalSetup().catch((err) => {
  console.error(err)
  process.exit(1)
})
