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

import type { Request as PwRequest } from '@playwright/test'

export function isRscRequest(req: PwRequest): boolean {
  return req.headers()['rsc'] === '1'
}
