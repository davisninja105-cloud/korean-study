import { NextResponse } from 'next/server'
import { runSync } from '@/lib/sync'
import { setLastAutoSyncedAt } from '@/lib/settings'

// Each new lesson triggers a Claude call (30-90s with opus + exhaustive output).
// Vercel's current default max is 300s; set it explicitly so it's clear and
// so the comment stays accurate if the platform default changes.
// NB: Vercel Hobby hard-caps functions at 60s regardless of maxDuration — this
// only matters if the plan is upgraded (see CLAUDE.md Gotchas).
export const maxDuration = 300

// GET /api/cron/sync — triggered daily by Vercel Cron (see vercel.json).
// Auth is enforced by middleware.ts (isValidCronAuth bearer check); this
// route accepts no request body/params — documentId comes from trusted env,
// not the caller.
export async function GET() {
  try {
    const documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID
    if (!documentId) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_GOOGLE_DOC_ID is not set' }, { status: 500 })
    }

    const result = await runSync(documentId)
    // runSync() catches per-lesson extraction/DB failures internally and still
    // resolves (result.failed > 0) rather than throwing — so "didn't throw" is
    // not the same as "succeeded". Only stamp the timestamp when nothing failed,
    // otherwise a failed sync would mask itself as fresh.
    if (result.failed === 0) {
      await setLastAutoSyncedAt(new Date().toISOString())
    } else {
      console.warn('Cron sync completed with failures — not updating lastAutoSyncedAt:', result.failures)
    }
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('Cron sync error:', err)
    return NextResponse.json(
      { error: 'Cron sync failed — see server logs' },
      { status: 500 }
    )
  }
}
