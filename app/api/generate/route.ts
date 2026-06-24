import { NextRequest, NextResponse } from 'next/server'
import { generatePractice } from '@/lib/generate-practice'

export async function POST(req: NextRequest) {
  try {
    const { cards } = await req.json()
    if (!cards || !Array.isArray(cards)) {
      return NextResponse.json({ error: 'cards array is required' }, { status: 400 })
    }
    if (cards.length > 100) {
      return NextResponse.json({ error: 'Too many cards (max 100)' }, { status: 400 })
    }

    const practice = await generatePractice(cards)
    return NextResponse.json({ practice })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Generate error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
