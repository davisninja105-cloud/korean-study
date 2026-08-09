import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  // buildId namespaces the client's IndexedDB cache (lib/local-cache.ts,
  // Phase 34 LOCAL-02) — a deploy that changes DTO shapes gets a fresh,
  // empty database instead of a render crash (D-00 rule 4). Deliberately a
  // fallback chain, not a throw: VERCEL_GIT_COMMIT_SHA is the real per-deploy
  // identity on Vercel; VERCEL_DEPLOYMENT_ID is a secondary Vercel-provided
  // fallback; 'local-dev' is the terminal value so dev and e2e runs share one
  // stable cache namespace instead of a new one on every process restart.
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev'
  return NextResponse.json({ version, buildId })
}
