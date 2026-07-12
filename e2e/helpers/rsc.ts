/**
 * RSC re-fetch network-evidence predicate (D-03, D-08). Exact verbatim port
 * of scripts/diagnose-freshness.mts:131-134's `rsc: 1` header check, WITH
 * the dead OR-branch checking an uppercase RSC header key dropped per Phase
 * 24 code review IN-01 (it never matched in the 17/24 sanity-gate run and is
 * confirmed dead).
 *
 * Every freshness-regression spec test pairs this network-evidence check
 * with a DOM-content check (e2e/helpers/readers.ts) per D-03's dual-evidence
 * rule — never assert on one without the other.
 */

import type { Page, Request as PwRequest, Response } from '@playwright/test'

export function isRscRequest(req: PwRequest): boolean {
  return req.headers()['rsc'] === '1'
}

/**
 * Deterministic wait for a boundary-triggered RSC refresh response
 * (Phase 26 fixed-behavior contract). Thin wrapper over
 * `page.waitForResponse` whose predicate accepts a response when the
 * request's URL pathname equals `routePath` AND either `isRscRequest(request)`
 * is true or `request.resourceType() === 'document'` — mirroring the same
 * "data fetch occurred" evidence shape used by `newDataFetchesForRoute` in
 * the freshness specs.
 *
 * CONTRACT: callers MUST create this promise BEFORE performing the
 * triggering action (e.g. `page.goBack()` or `simulateResume(page, false)`)
 * and `await` it AFTER, so the response can never be missed in the race
 * between the trigger firing and the listener attaching. This replaces
 * fixed-timeout evidence windows (`page.waitForTimeout(...)` as the sole
 * signal) per the harness's own waitForResponse-over-waitForTimeout
 * guidance — a boundary refresh's response time is not reliably bounded by
 * a fixed sleep.
 */
export function waitForRscFetch(page: Page, routePath: string, timeout = 15_000): Promise<Response> {
  return page.waitForResponse((res) => {
    const url = new URL(res.url())
    return url.pathname === routePath && (isRscRequest(res.request()) || res.request().resourceType() === 'document')
  }, { timeout })
}
