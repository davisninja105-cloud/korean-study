import { NextResponse } from 'next/server'
import { getRecentGlosses } from '@/lib/gloss'

/**
 * GET /api/gloss/preload
 *
 * Returns up to GLOSS_PRELOAD_LIMIT previously-resolved gloss entries from
 * the Setting table (`gloss:` prefix) so the client (GlossProvider) can warm
 * its in-memory cache on mount — making previously-glossed words resolve
 * instantly on a fresh page load with no LLM round-trip (PERF-02).
 *
 * Authenticated by the shared-password HMAC cookie (middleware.ts). Accepts
 * NO request body or query params — the limit is fixed server-side so the
 * response size stays bounded and the client cannot influence how much data
 * is returned (threat T-14-04). Only `gloss:`-prefixed rows are read, never
 * app-config settings (threat T-14-05).
 *
 * Preload failure is non-critical: the gloss feature degrades to normal
 * per-tap fetching, so on error we return `{ entries: [] }` rather than a
 * 500 the client would have to special-case.
 */
export async function GET() {
  try {
    const entries = await getRecentGlosses()
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('Failed to preload gloss cache', err)
    return NextResponse.json({ entries: [] })
  }
}
