import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'
import { splitParticle } from '@/lib/sentence-match'
import { getCachedGloss, setCachedGloss, lookupViaLLM } from '@/lib/gloss'

/**
 * POST /api/gloss
 * Body: { word: string }
 *
 * Resolves a tapped Korean word to a dictionary form + gloss:
 *   1. Exact/normalized corpus lookup (instant; returns the matching card).
 *   2. Stem-only lookup (strip trailing particle via splitParticle, retry corpus).
 *   3. Setting-table cache (previously resolved unknowns).
 *   4. Claude Haiku fallback (LLM dictionary), then cache the result.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { word?: string }
  const word = (body?.word ?? '').trim()
  if (!word) return NextResponse.json({ error: 'Missing word' }, { status: 400 })

  const normalized = normalizeFront(word)

  // ── 1. Exact corpus match ──────────────────────────────────────────────
  let card = await prisma.card.findUnique({ where: { normalizedFront: normalized } })
  if (card) {
    return NextResponse.json({
      dictionaryForm: card.front,
      gloss: card.back,
      partOfSpeech: card.type,
      source: 'corpus',
      cardId: card.id,
    })
  }

  // ── 2. Stem fallback — strip trailing particle and retry corpus ────────
  const { stem } = splitParticle(word)
  if (stem && stem !== word) {
    const stemKey = normalizeFront(stem)
    card = await prisma.card.findUnique({ where: { normalizedFront: stemKey } })
    if (card) {
      return NextResponse.json({
        dictionaryForm: card.front,
        gloss: card.back,
        partOfSpeech: card.type,
        source: 'corpus',
        cardId: card.id,
      })
    }
  }

  // ── 3. Cache check ────────────────────────────────────────────────────
  const cached = await getCachedGloss(normalized)
  if (cached) {
    return NextResponse.json({ ...cached, source: 'cache' })
  }

  // ── 4. LLM fallback ──────────────────────────────────────────────────
  try {
    const result = await lookupViaLLM(word)
    const entry = { ...result, source: 'llm' as const }
    // Cache asynchronously (don't await — result is already ready for the client)
    setCachedGloss(normalized, entry).catch(() => {/* non-fatal */})
    return NextResponse.json(entry)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gloss lookup failed' },
      { status: 500 }
    )
  }
}
