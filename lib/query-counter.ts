/**
 * Physical libSQL round-trip counter — DEV/TEST INSTRUMENTATION ONLY.
 *
 * Definition of "round trip" (single source of truth for this project,
 * per 32-01-PLAN.md must_haves): one physical libSQL HTTP request, counted
 * at the `@libsql/client` boundary as one execute()/batch()/transaction()
 * call made BEFORE `@prisma/adapter-libsql` wraps it. `getQueryCounts()`
 * additionally reports Prisma's own `$on('query')` event count on the same
 * run so the two can be cross-checked — see 32-RESEARCH.md Assumption A4
 * ("Don't Hand-Roll" section) for why a second, independent counter is
 * cheap insurance rather than redundant effort.
 *
 * Why the Proxy sits UNDER the adapter, not over it: `@prisma/adapter-libsql`
 * 7.6.0 routes every statement through the underlying `@libsql/client`
 * instance's `execute()`/`batch()` (verified this session by reading
 * node_modules/@prisma/adapter-libsql/dist/index-node.js's `performIO()` and
 * `LibSqlTransaction`/`HranaTransaction.execute()` chain — see
 * 32-RESEARCH.md "Research Question 1"). For the HTTP (Turso) transport,
 * each of those calls is exactly one physical HTTP request. Wrapping the
 * plain `@libsql/client` object BEFORE Prisma's adapter receives it — rather
 * than counting Prisma's logical query calls — gives the ground-truth
 * physical count, independent of how many logical Prisma operations get
 * folded into (or split out of) each one.
 *
 * Inert unless `STUDY_QUERY_COUNTER` (see `QUERY_COUNTER_ENV`) is exactly
 * `'1'` — see lib/prisma.ts's env-gated branch, which is the sole caller of
 * `countingLibsqlClient()`/`notePrismaQueryEvent()`. The default (flag-unset)
 * production path never imports the Proxy machinery into its hot path; it
 * only pays for two module-scope integers existing, never allocated into.
 *
 * Logs nothing containing bound parameter values, card fronts, DATABASE_URL,
 * or DATABASE_AUTH_TOKEN — counts and statement counts only (threat T-32-05).
 * This module itself performs no logging at all; callers (the measurement
 * script) are responsible for printing only the numeric counts.
 */

import type { Client } from '@libsql/client'

/** The env var name that gates all instrumentation in lib/prisma.ts. */
export const QUERY_COUNTER_ENV = 'STUDY_QUERY_COUNTER'

let physicalCount = 0
let prismaEventCount = 0

/**
 * Wraps a `@libsql/client` instance (the object `createClient()` returns) in
 * a `Proxy` that increments the physical counter whenever `execute`,
 * `batch`, or `transaction` is accessed — the three methods
 * `@prisma/adapter-libsql`'s `performIO()`/`startTransaction()` call.
 *
 * Every returned method is explicitly `.bind(target)`ed rather than handed
 * back as a bare `Reflect.get(target, prop, receiver)` value. This matters
 * for the LOCAL (`file:`) transport specifically: `@libsql/client`'s
 * `Sqlite3Client` (used for `file:` URLs, backed by a native addon) throws
 * `TypeError: Receiver must be an instance of class Sqlite3Client` if its
 * methods are invoked with a non-`Sqlite3Client` `this` — which is exactly
 * what happens when a Proxy's default method-call semantics hand the Proxy
 * itself as `this` (`proxy.execute(...)` calls the returned function with
 * `this = proxy`, not `this = target`). Binding to `target` up front avoids
 * this for every method, not just the three counted ones, and is harmless
 * for the HTTP (Turso) transport's plain-JS `HttpClient`, which has no such
 * receiver check.
 */
export function countingLibsqlClient(client: Client): Client {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'execute' || prop === 'batch' || prop === 'transaction') {
        physicalCount++
      }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Zeroes both counters. Call before the segment being measured. */
export function resetQueryCount(): void {
  physicalCount = 0
  prismaEventCount = 0
}

/** Returns both counters as read since the last resetQueryCount() call. */
export function getQueryCounts(): { physical: number; prismaEvents: number } {
  return { physical: physicalCount, prismaEvents: prismaEventCount }
}

/**
 * Sink for `lib/prisma.ts`'s `client.$on('query', ...)` registration in the
 * instrumented branch. Increments the secondary (Prisma-logical-event)
 * counter — never logs event payloads (which would include SQL text).
 */
export function notePrismaQueryEvent(): void {
  prismaEventCount++
}
