/**
 * DB-isolation hard-fail guard (E2E-03, WR-01 allow-list shape).
 *
 * Ported from scripts/diagnose-freshness.mts:42-49, INVERTED from a deny-list
 * (fail only on a `libsql://`-prefixed URL) to an allow-list (fail on
 * anything that isn't `file:`) — per the Phase 24 WR-01 code-review finding,
 * the deny-list shape has a gap: a remote URL using a different scheme
 * (or no scheme at all) would sail through undetected. The allow-list
 * closes that gap structurally.
 *
 * Call sites: playwright.config.ts (config-load time, before any browser or
 * server work) and e2e/global-setup.ts (runtime re-check, defense in depth).
 */

export function assertLocalDb(url: string | undefined): void {
  if (!url || !url.startsWith('file:')) {
    console.error('✗ FATAL: DATABASE_URL must be an isolated local file: test database.')
    console.error(`  Refusing to proceed. Got: ${url}`)
    process.exit(1)
  }
}
