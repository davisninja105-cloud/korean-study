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

/**
 * The SINGLE source of truth for "is this navigation response allowed to be
 * cached under this route key?" — consumed by BOTH the install-time
 * `warmNavigationRoute` warm and the runtime `navigate` fetch-handler branch
 * in scripts/sw-template.js. CR-01 (35-VERIFICATION.md): before this shared
 * predicate existed, those two call sites carried separately-written checks
 * that diverged — the install-time warm already compared final-URL pathname
 * to the route, but the runtime navigate branch cached ANY ok response
 * regardless of where it actually landed. Concretely: an expired `ks_auth`
 * session cookie makes `middleware.ts` redirect a live `/study` navigation to
 * `/login`, which itself renders 200 OK — `fetch()` follows that redirect and
 * exposes the FINAL url in `response.url`, so without this check the login
 * document would be written under the `/study` cache key and served, offline,
 * to a since-reauthenticated user as if it were the real app.
 *
 * Fails CLOSED: `responseUrl` is parsed with the URL constructor inside a
 * try/catch, and any parse failure (or an empty string, which the URL
 * constructor also rejects when there is no base) returns false rather than
 * throwing into the fetch handler — an unparseable/opaque response can never
 * slip through the guard by making the parse itself blow up.
 *
 * Exact pathname equality ONLY — no normalization, trimming, case-folding,
 * prefix, or suffix comparison. A response's query string is deliberately
 * ignored (the cache key is pathname-only by design), but the pathname
 * itself must match `key` exactly: `/study/` (trailing slash) and
 * `/studying` (prefix collision) are both mismatches, not near-matches.
 *
 * @param {boolean} responseOk
 * @param {string} responseUrl
 * @param {string} key
 * @returns {boolean}
 */
export function shouldCacheNavigationResponse(responseOk, responseUrl, key) {
  if (!responseOk) return false
  try {
    return new URL(responseUrl).pathname === key
  } catch {
    return false
  }
}
