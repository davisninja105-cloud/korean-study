import { NextRequest, NextResponse } from 'next/server'
import { runSync } from '@/lib/sync'

// Each new lesson triggers a Claude call (30-90s with opus + exhaustive output).
// Vercel's current default max is 300s; set it explicitly so it's clear and
// so the comment stays accurate if the platform default changes.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const result = await runSync(documentId)
    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('Sync error:', err)
    return NextResponse.json(
      { error: 'Sync failed — see server logs for details' },
      { status: 500 }
    )
  }
}
