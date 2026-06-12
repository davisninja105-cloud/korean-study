import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { fetchGoogleDoc } from '@/lib/google-docs'
import { extractCardsFromNotes } from '@/lib/extract-cards'
import { prisma } from '@/lib/prisma'

// Each new lesson triggers a Claude call (10-30s). Allow the function the
// maximum duration the Vercel Hobby tier permits.
export const maxDuration = 60

// Cap how many new lessons we process in a single request so a large backlog
// can't blow past the function timeout. Remaining lessons are drained on the
// next sync tap.
const MAX_LESSONS_PER_SYNC = 4

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const lessonTexts = await fetchGoogleDoc(documentId)

    // 1. Filter to only new lessons by content hash
    const newLessonData: { text: string; contentHash: string }[] = []
    for (const text of lessonTexts) {
      const contentHash = createHash('sha256').update(text).digest('hex')
      const existing = await prisma.lesson.findUnique({ where: { contentHash } })
      if (!existing) {
        newLessonData.push({ text, contentHash })
      }
    }

    if (newLessonData.length === 0) {
      return NextResponse.json({ synced: true, newLessons: 0, newCards: 0, remaining: 0, message: 'No new content since last sync' })
    }

    // Only process a bounded batch this request; report the rest as remaining.
    const batch = newLessonData.slice(0, MAX_LESSONS_PER_SYNC)
    const remaining = newLessonData.length - batch.length

    // Load existing card fronts so Claude can dedupe across the whole deck.
    const existingFronts = (
      await prisma.card.findMany({ select: { front: true } })
    ).map((c) => c.front)

    // 2. Create Lesson rows for this batch.
    // Assign stable orderIndex values sequentially after the current max so
    // lessons from the same batch preserve document order.
    const { _max } = await prisma.lesson.aggregate({ _max: { orderIndex: true } })
    const orderBase = _max.orderIndex ?? 0

    const lessons = await Promise.all(
      batch.map((data, i) =>
        prisma.lesson.create({
          data: {
            orderIndex: orderBase + i + 1,
            title: `Lesson synced ${new Date().toLocaleDateString()}`,
            rawContent: data.text,
            contentHash: data.contentHash,
          },
        })
      )
    )

    // 3. Extract cards from all lessons in the batch in parallel
    const results = await Promise.allSettled(
      lessons.map((lesson, i) =>
        extractCardsFromNotes(batch[i].text, existingFronts).then((cards) => ({ lesson, cards }))
      )
    )

    // 4. Create cards for successful extractions
    let newCards = 0
    let newLessons = 0
    const errors: string[] = []

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { lesson, cards } = result.value
        await Promise.all(
          cards.map((card) =>
            prisma.card.create({
              data: {
                type: card.type,
                front: card.front,
                back: card.back,
                notes: card.notes ?? null,
                distractors: card.distractors.length ? JSON.stringify(card.distractors) : null,
                // Legacy cloze columns are no longer written — Sentence rows used instead.
                lessonId: lesson.id,
                sentences: {
                  create: card.sentences.map((s, i) => ({
                    korean: s.korean,
                    targetForm: s.targetForm,
                    translation: s.translation,
                    orderIndex: i,
                  })),
                },
                review: { create: {} },
              },
            })
          )
        )
        newLessons++
        newCards += cards.length
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        console.error('Failed to extract cards:', msg)
        errors.push(msg)
      }
    }

    return NextResponse.json({
      synced: true,
      newLessons,
      newCards,
      remaining,
      ...(remaining > 0 && { message: `${remaining} more lesson(s) remaining — sync again to continue.` }),
      ...(errors.length > 0 && { warnings: `${errors.length} lesson(s) failed to extract cards` }),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
