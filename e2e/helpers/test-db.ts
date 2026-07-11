/**
 * Single source of truth for the isolated E2E test database's absolute path
 * and file: URL. Every connection (playwright.config.ts's webServer.env,
 * global-setup.ts's reset/push/seed, and any helper that opens its own
 * Prisma client) MUST import these constants rather than constructing the
 * path/URL independently — this is what keeps the harness structurally
 * pinned to one, single, isolated DB file (E2E-03).
 *
 * The path is absolute (not relative) because the Prisma CLI resolves
 * relative `file:` URLs against the schema directory while the libsql
 * client resolves them against cwd — an absolute URL removes that mismatch
 * class entirely (same reasoning Phase 24's diagnosis script used).
 *
 * Lives under e2e/.tmp/ (not the repo root) so a single .gitignore entry
 * (/e2e/.tmp/) covers the DB file plus its -wal/-shm sidecars.
 */

import path from 'path'

// Under Playwright's CJS/ESM transpilation __dirname is available; if a
// future runtime lacks it, fall back to a cwd-relative resolution (documented
// assumption: the process cwd is the repo root, true for `npx playwright test`).
const baseDir = typeof __dirname !== 'undefined' ? path.resolve(__dirname, '..') : path.resolve(process.cwd(), 'e2e')

export const TEST_DB_PATH = path.resolve(baseDir, '.tmp', 'e2e-test.db')
export const TEST_DB_URL = `file:${TEST_DB_PATH}`
