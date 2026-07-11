/**
 * Playwright setup-project auth (D-10): logs in once via a real
 * POST /api/login call and saves the resulting storageState. All other
 * projects declare dependencies: ['setup'] + use: { storageState } so no
 * spec file needs its own login code. This is deliberately NOT a direct
 * computeAuthToken()/addCookies() injection (Phase 24 diagnosis script's
 * approach) — the setup-project pattern is the documented Playwright shape
 * and exercises the real login route as a side effect.
 */

import { test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ request }) => {
  const res = await request.post('/api/login', {
    data: { password: process.env.APP_PASSWORD ?? 'e2e-test-password' },
  })
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  }
  await request.storageState({ path: authFile })
})
