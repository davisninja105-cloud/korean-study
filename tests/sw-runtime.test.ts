// Vitest unit coverage for scripts/sw-runtime.mjs's pure routing +
// cache-invalidation helpers. Imported directly (Vitest's node environment
// resolves plain ESM) — no browser globals involved, matches the module's
// own "no browser globals at module scope" contract.
import { describe, it, expect } from 'vitest'
import { SHELL_CACHE_PREFIX, NAVIGATION_ROUTES, routeStrategy, staleShellCacheKeys } from '../scripts/sw-runtime.mjs'

describe('routeStrategy', () => {
  it('returns passthrough for a cross-origin request regardless of mode or pathname', () => {
    expect(routeStrategy({ mode: 'navigate', sameOrigin: false, pathname: '/api/foo' })).toBe('passthrough')
    expect(routeStrategy({ mode: 'no-cors', sameOrigin: false, pathname: '/' })).toBe('passthrough')
  })

  it('returns navigate for a document request even when its pathname begins with the API prefix (ordering is load-bearing)', () => {
    expect(routeStrategy({ mode: 'navigate', sameOrigin: true, pathname: '/api/version' })).toBe('navigate')
  })

  it('returns network-only for API paths', () => {
    expect(routeStrategy({ mode: 'cors', sameOrigin: true, pathname: '/api/review' })).toBe('network-only')
    expect(routeStrategy({ mode: 'no-cors', sameOrigin: true, pathname: '/api/cards/due' })).toBe('network-only')
  })

  it('returns cache-first for every other same-origin path, including one matching neither the precache list nor the API prefix', () => {
    expect(routeStrategy({ mode: 'no-cors', sameOrigin: true, pathname: '/_next/static/chunks/foo.js' })).toBe(
      'cache-first'
    )
    expect(routeStrategy({ mode: 'no-cors', sameOrigin: true, pathname: '/some/totally/unknown/path.txt' })).toBe(
      'cache-first'
    )
  })

  it('is exhaustive — the four returned values are the only ones this function ever returns', () => {
    const cases = [
      { mode: 'navigate', sameOrigin: false, pathname: '/' },
      { mode: 'navigate', sameOrigin: true, pathname: '/' },
      { mode: 'no-cors', sameOrigin: true, pathname: '/api/version' },
      { mode: 'no-cors', sameOrigin: true, pathname: '/icon-192.png' },
    ]
    const results = cases.map(routeStrategy)
    for (const r of results) {
      expect(['passthrough', 'navigate', 'network-only', 'cache-first']).toContain(r)
    }
  })
})

describe('staleShellCacheKeys', () => {
  it('returns every other shell key when several generations are present', () => {
    const keys = [`${SHELL_CACHE_PREFIX}v1`, `${SHELL_CACHE_PREFIX}v2`, `${SHELL_CACHE_PREFIX}v3`]
    expect(staleShellCacheKeys(keys, `${SHELL_CACHE_PREFIX}v3`).sort()).toEqual(
      [`${SHELL_CACHE_PREFIX}v1`, `${SHELL_CACHE_PREFIX}v2`].sort()
    )
  })

  it('returns an empty array when only the current key exists', () => {
    expect(staleShellCacheKeys([`${SHELL_CACHE_PREFIX}v1`], `${SHELL_CACHE_PREFIX}v1`)).toEqual([])
  })

  it('ignores keys belonging to other prefixes', () => {
    const keys = ['ks-cache-abc123', 'ks-offline-queue', `${SHELL_CACHE_PREFIX}v1`, `${SHELL_CACHE_PREFIX}v2`]
    expect(staleShellCacheKeys(keys, `${SHELL_CACHE_PREFIX}v2`)).toEqual([`${SHELL_CACHE_PREFIX}v1`])
  })

  it('returns an empty array for an empty key list', () => {
    expect(staleShellCacheKeys([], `${SHELL_CACHE_PREFIX}v1`)).toEqual([])
  })
})

describe('exported constants', () => {
  it('SHELL_CACHE_PREFIX is the fixed string used to namespace every shell cache generation', () => {
    expect(SHELL_CACHE_PREFIX).toBe('ks-shell-')
  })

  it('NAVIGATION_ROUTES lists exactly the four main routes', () => {
    expect(NAVIGATION_ROUTES).toEqual(['/', '/study', '/cards', '/habits'])
  })
})
