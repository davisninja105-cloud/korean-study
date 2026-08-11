// GENERATED FILE TEMPLATE — scripts/gen-sw.mjs renders this into public/sw.js
// on every build. Do not edit the generated public/sw.js directly; edit this
// template (and scripts/sw-runtime.mjs, whose source is inlined below)
// instead.
//
// Substitution tokens below (replaced by scripts/gen-sw.mjs's
// renderServiceWorker — deliberately mentioned only ONCE each in this file,
// as the literal placeholder line itself; String.replace() only replaces
// the first match, so a second literal mention in this header comment would
// silently steal the substitution and leave the real placeholder line
// untouched):
//   1. the inlined runtime source, from scripts/sw-runtime.mjs, with the
//      leading `export ` keyword stripped from each declaration so it runs
//      as plain worker-global code
//   2. the JSON-stringified cache name `ks-shell-<buildId>`
//   3. the JSON-stringified precache URL array

__SW_RUNTIME__

const CACHE_NAME = __CACHE_NAME__
const PRECACHE_LIST = __PRECACHE_LIST__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_LIST))
  )
  // Deliberately no self.skipWaiting() here (D-08) — the new worker installs
  // and then WAITS. It only takes over once the page taps the update prompt
  // (see the 'message' listener below) or the tab is fully closed and a new
  // one is opened. Passing the whole precache write to event.waitUntil means
  // an install interrupted before this resolves never reaches 'activate' —
  // the previously active worker (and its cache) keeps serving untouched.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(staleShellCacheKeys(keys, CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin
  const strategy = routeStrategy({ mode: request.mode, sameOrigin, pathname: url.pathname })

  if (strategy === 'passthrough') {
    // Cross-origin — never intercepted. Do not call respondWith at all.
    return
  }

  if (strategy === 'navigate') {
    // Pathname-normalized cache key (query string intentionally dropped) so
    // a warmed route (Task 2) and a route cached from a real online visit
    // are interchangeable at read time.
    const key = url.pathname
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(key, copy))
          }
          return response
        })
        .catch(() => caches.match(key))
    )
    return
  }

  if (strategy === 'network-only') {
    // No cache fallback — an offline /api/* failure must reach the page as
    // a real network error (Phase 34's IndexedDB cache + postReviewWithRetry
    // already own the offline data story for /api/*, not this worker).
    event.respondWith(fetch(request))
    return
  }

  // cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        return response
      })
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
