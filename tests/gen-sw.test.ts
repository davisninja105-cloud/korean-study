// Vitest unit coverage for scripts/gen-sw.mjs's three exported pure helpers.
// A temporary fixture directory under the OS temp dir drives
// collectPrecacheList without touching the real .next/static build tree.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveBuildId, collectPrecacheList, renderServiceWorker, SHELL_ASSETS } from '../scripts/gen-sw.mjs'

describe('resolveBuildId', () => {
  it('prefers VERCEL_GIT_COMMIT_SHA when present', () => {
    expect(
      resolveBuildId({ VERCEL_GIT_COMMIT_SHA: 'sha123', VERCEL_DEPLOYMENT_ID: 'dep456' })
    ).toBe('sha123')
  })

  it('falls back to VERCEL_DEPLOYMENT_ID when VERCEL_GIT_COMMIT_SHA is absent', () => {
    expect(resolveBuildId({ VERCEL_DEPLOYMENT_ID: 'dep456' })).toBe('dep456')
  })

  it('falls back to the literal local-dev when neither env var is present', () => {
    expect(resolveBuildId({})).toBe('local-dev')
  })
})

describe('collectPrecacheList', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gen-sw-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns every file mapped to its served URL, with directories excluded', () => {
    mkdirSync(join(dir, 'chunks'), { recursive: true })
    mkdirSync(join(dir, 'media'), { recursive: true })
    writeFileSync(join(dir, 'chunks', 'a.js'), 'a')
    writeFileSync(join(dir, 'chunks', 'b.css'), 'b')
    writeFileSync(join(dir, 'media', 'font.woff2'), 'c')

    const result = collectPrecacheList(dir, [])
    expect(result).toEqual([
      '/_next/static/chunks/a.js',
      '/_next/static/chunks/b.css',
      '/_next/static/media/font.woff2',
    ])
  })

  it('is sorted, and two calls over the same tree return deeply equal arrays (determinism)', () => {
    mkdirSync(join(dir, 'z'), { recursive: true })
    mkdirSync(join(dir, 'a'), { recursive: true })
    writeFileSync(join(dir, 'z', 'z.js'), 'z')
    writeFileSync(join(dir, 'a', 'a.js'), 'a')
    writeFileSync(join(dir, 'm.js'), 'm')

    const first = collectPrecacheList(dir, [])
    const second = collectPrecacheList(dir, [])
    expect(first).toEqual(second)
    expect(first).toEqual([...first].sort())
  })

  it('a fixture directory containing zero files yields an empty list', () => {
    expect(collectPrecacheList(dir, [])).toEqual([])
  })

  it('concatenates shellAssets and keeps the whole result sorted', () => {
    writeFileSync(join(dir, 'x.js'), 'x')
    const result = collectPrecacheList(dir, ['/icon-192.png', '/apple-icon.png'])
    expect(result).toEqual([...result].sort())
    expect(result).toContain('/icon-192.png')
    expect(result).toContain('/apple-icon.png')
    expect(result).toContain('/_next/static/x.js')
  })
})

describe('renderServiceWorker', () => {
  const template = [
    '// header comment mentioning tokens only in prose, never literally',
    '__SW_RUNTIME__',
    '',
    'const CACHE_NAME = __CACHE_NAME__',
    'const PRECACHE_LIST = __PRECACHE_LIST__',
    '',
    "self.addEventListener('install', (event) => {",
    '  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_LIST)))',
    '})',
    '',
    "self.addEventListener('activate', (event) => {",
    '  event.waitUntil(self.clients.claim())',
    '})',
  ].join('\n')

  it('leaves no unsubstituted token in the output', () => {
    const rendered = renderServiceWorker({
      runtimeSource: "export const FOO = 'bar'\n",
      template,
      cacheName: 'ks-shell-abc',
      precache: ['/a.js'],
    })
    expect(rendered).not.toContain('__SW_RUNTIME__')
    expect(rendered).not.toContain('__CACHE_NAME__')
    expect(rendered).not.toContain('__PRECACHE_LIST__')
  })

  it('embeds the cache name and precache entries', () => {
    const rendered = renderServiceWorker({
      runtimeSource: "export const FOO = 'bar'\n",
      template,
      cacheName: 'ks-shell-abc',
      precache: ['/a.js', '/b.js'],
    })
    expect(rendered).toContain(JSON.stringify('ks-shell-abc'))
    expect(rendered).toContain(JSON.stringify(['/a.js', '/b.js']))
  })

  it('the rendered install handler does not self-activate', () => {
    const rendered = renderServiceWorker({
      runtimeSource: "export const FOO = 'bar'\n",
      template,
      cacheName: 'ks-shell-abc',
      precache: ['/a.js'],
    })
    const installStart = rendered.indexOf("addEventListener('install'")
    const activateStart = rendered.indexOf("addEventListener('activate'")
    expect(installStart).toBeGreaterThan(-1)
    expect(activateStart).toBeGreaterThan(installStart)
    const installHandlerSource = rendered.slice(installStart, activateStart)
    expect(installHandlerSource).not.toMatch(/skipWaiting/)
  })

  it('the rendered source contains the inlined runtime function names with no leftover module-export keyword', () => {
    const runtimeSource = [
      "export const SHELL_CACHE_PREFIX = 'ks-shell-'",
      'export function routeStrategy(params) { return params }',
      'export function staleShellCacheKeys(keys, name) { return keys }',
    ].join('\n')
    const rendered = renderServiceWorker({ runtimeSource, template, cacheName: 'ks-shell-abc', precache: [] })
    expect(rendered).toContain('function routeStrategy(')
    expect(rendered).toContain('function staleShellCacheKeys(')
    expect(rendered).not.toMatch(/export\s+(const|function)/)
  })
})

describe('real sw-runtime.mjs + sw-template.js render end-to-end', () => {
  it('produces a syntactically self-consistent worker with the real source files', () => {
    const runtimeSource = readFileSync(join(__dirname, '..', 'scripts', 'sw-runtime.mjs'), 'utf8')
    const template = readFileSync(join(__dirname, '..', 'scripts', 'sw-template.js'), 'utf8')
    const rendered = renderServiceWorker({
      runtimeSource,
      template,
      cacheName: 'ks-shell-test',
      precache: ['/_next/static/chunks/a.js'],
    })
    expect(rendered).not.toContain('__SW_RUNTIME__')
    expect(rendered).not.toContain('__CACHE_NAME__')
    expect(rendered).not.toContain('__PRECACHE_LIST__')
    expect(rendered).not.toMatch(/export\s+(const|function)/)
    expect(rendered).toContain('function routeStrategy(')
    expect(rendered).toContain('function staleShellCacheKeys(')
  })
})

describe('SHELL_ASSETS', () => {
  it('includes the self-hosted font and the full icon set', () => {
    expect(SHELL_ASSETS).toContain('/fonts/PretendardVariable.woff2')
    expect(SHELL_ASSETS).toContain('/icon-192.png')
    expect(SHELL_ASSETS).toContain('/manifest.webmanifest')
  })
})
