// Permanent regression guard for G-30-2: app/settings/page.tsx must never
// mutate cookies from inside a Server Component's render body — Next.js
// 16.2.1 only permits cookie mutation during the 'action' phase (Server
// Actions / Route Handlers), and calling cookies().set()/.delete() from
// render throws ReadonlyRequestCookiesError on every request (see
// .planning/debug/settings-page-server-error.md).
//
// Mirrors tests/root-layout-sync.test.ts's fs.readFileSync + regex-assertion
// style exactly — no jsdom, no Next.js runtime.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const pageSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'settings', 'page.tsx'),
  'utf-8',
)
const routeSource = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'api', 'settings', 'backfill-cookie', 'route.ts'),
  'utf-8',
)

describe('app/settings/page.tsx — no render-body cookie mutation (G-30-2)', () => {
  it('does not call cookies().set( — the exact class of bug G-30-2 diagnosed', () => {
    expect(pageSource).not.toMatch(/cookies\s*\(\s*\)\s*\.set\s*\(/)
  })

  it('does not import cookies from next/headers', () => {
    expect(pageSource).not.toMatch(/import\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*['"]next\/headers['"]/)
  })

  it('still calls getAllSettings() — server-side real-data fetch stays intact', () => {
    expect(pageSource).toMatch(/getAllSettings\(\)/)
  })
})

describe('app/api/settings/backfill-cookie/route.ts — valid action-phase cookie write', () => {
  it('writes the cookie via res.cookies.set( — the valid Route Handler pattern', () => {
    expect(routeSource).toMatch(/res\.cookies\.set\(/)
  })
})
