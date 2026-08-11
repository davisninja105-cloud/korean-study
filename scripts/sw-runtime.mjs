/**
 * sw-runtime.mjs — pure, testable service-worker routing + cache-invalidation
 * helpers. No browser globals at module scope: this file is imported
 * directly by Vitest (tests/sw-runtime.test.ts) AND has its source text
 * inlined verbatim into the generated worker by scripts/gen-sw.mjs, so it
 * must be plain, dependency-free Node ESM that also happens to be valid
 * service-worker-context JS once the leading `export` keywords are stripped.
 */

// Every shell (app-route document) cache this app ever creates carries this
// prefix, versioned by build id — e.g. `ks-shell-abc123`. Used both to name
// the current cache and to recognize + delete prior generations on activate.
export const SHELL_CACHE_PREFIX = 'ks-shell-'

// The four main routes warmed at install time (Task 2) and consulted by the
// navigate fetch-handler branch for its offline cache fallback.
export const NAVIGATION_ROUTES = ['/', '/study', '/cards', '/habits']

/**
 * Decide how the generated worker's fetch handler should treat a request.
 * Evaluated in exactly this order — ordering is load-bearing (a same-origin
 * document request to a path that happens to start with `/api/` must still
 * resolve to `navigate`, not `network-only`; see tests/sw-runtime.test.ts).
 *
 * @param {{ mode: string, sameOrigin: boolean, pathname: string }} params
 * @returns {'passthrough' | 'navigate' | 'network-only' | 'cache-first'}
 */
export function routeStrategy({ mode, sameOrigin, pathname }) {
  if (!sameOrigin) return 'passthrough'
  if (mode === 'navigate') return 'navigate'
  if (pathname.startsWith('/api/')) return 'network-only'
  return 'cache-first'
}

/**
 * Given every cache key currently open in this origin's CacheStorage, return
 * the subset that belong to a prior shell-cache generation — i.e. every key
 * starting with SHELL_CACHE_PREFIX that is not the current cache name. Keys
 * belonging to some other subsystem (a different prefix entirely) are never
 * returned, so `activate` can safely delete exactly this list and nothing
 * else.
 *
 * @param {string[]} allKeys
 * @param {string} currentCacheName
 * @returns {string[]}
 */
export function staleShellCacheKeys(allKeys, currentCacheName) {
  return allKeys.filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== currentCacheName)
}
