import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const layoutSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf-8')

describe('app/layout.tsx RootLayout — synchronous render (LAYOUT-01)', () => {
  it('exports RootLayout as a plain (non-async) function', () => {
    expect(layoutSource).toMatch(/export default function RootLayout\(/)
    expect(layoutSource).not.toMatch(/async function RootLayout\(/)
  })

  it('contains no await call inside the RootLayout function body', () => {
    const start = layoutSource.indexOf('export default function RootLayout(')
    expect(start).toBeGreaterThan(-1)
    const returnIdx = layoutSource.indexOf('return (', start)
    expect(returnIdx).toBeGreaterThan(start)
    const body = layoutSource.slice(start, returnIdx)
    expect(body).not.toMatch(/\bawait\b/)
  })

  it('no longer imports getLayoutSettings from @/lib/settings', () => {
    expect(layoutSource).not.toMatch(/getLayoutSettings/)
  })
})
