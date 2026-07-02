import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { fetchGoogleDoc } from '@/lib/google-docs'
import { extractCardsFromNotes } from '@/lib/extract-cards'
import { normalizeFront } from '@/lib/card-key'
import { prisma } from '@/lib/prisma'

// Each new lesson triggers a Claude call (30-90s with opus + exhaustive output).
// Vercel's current default max is 300s; set it explicitly so it's clear and
// so the comment stays accurate if the platform default changes.
export const maxDuration = 300

// Cap how many new lessons we process in a single request so a large backlog
// can't blow past the function timeout. Remaining lessons are drained on the
// next sync tap.
// Opus + exhaustive extraction is slower than the old prompt (~60-120s/lesson),
// so process 1 lesson per request to stay safely under the function timeout.
const MAX_LESSONS_PER_SYNC = 1

/**
 * Pure helper — produce a short, searchable excerpt of a lesson body so sync
 * failures can name the specific lesson the user can find in their Google Doc.
 * Returns the first non-empty line, whitespace-collapsed, truncated to ~48
 * chars with a trailing `…`; falls back to `(untitled lesson)` when there's
 * no usable text. The excerpt is the user's OWN doc content (intentionally
 * surfaced back to them — see threat T-14-02; raw error text never leaks).
 */
function lessonExcerpt(text: string): string {
  const firstLine = text
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .find((l) => l.length > 0)
  if (!firstLine) return '(untitled lesson)'
  const MAX = 48
  return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine
}

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    // fetchGoogleDoc now returns { text, emphasized }[] — plain body text plus
    // any spans the tutor bolded/underlined/highlighted per lesson.
    const lessonDataList = await fetchGoogleDoc(documentId)

    // 1. Filter to only new lessons by content hash (hash the plain text, same as before)
    const newLessonData: { text: string; emphasized: string[]; contentHash: string }[] = []
    for (const lesson of lessonDataList) {
      const contentHash = createHash('sha256').update(lesson.text).digest('hex')
      const existing = await prisma.lesson.findUnique({ where: { contentHash } })
      if (!existing) {
        newLessonData.push({ text: lesson.text, emphasized: lesson.emphasized, contentHash })
      }
    }

    if (newLessonData.length === 0) {
      return NextResponse.json({ synced: true, newLessons: 0, newCards: 0, remaining: 0, message: 'No new content since last sync' })
    }

    // Only process a bounded batch this request; report the rest as remaining.
    const batch = newLessonData.slice(0, MAX_LESSONS_PER_SYNC)
    const remaining = newLessonData.length - batch.length

    // Load existing normalized fronts so Claude can avoid obvious duplicates.
    // (Real dedup is now DB-enforced via normalizedFront @unique + upsert below.)
    const existingNormalizedFronts = (
      await prisma.card.findMany({ select: { normalizedFront: true } })
    ).map((c) => c.normalizedFront)

    // 2. Extract cards from all lessons in the batch FIRST (before touching the DB).
    //    A lesson is only persisted when extraction succeeds AND yields ≥1 card.
    //    This prevents orphan Lesson rows with 0 cards from being silently created.
    const extractResults = await Promise.allSettled(
      batch.map((data) =>
        extractCardsFromNotes(data.text, existingNormalizedFronts, data.emphasized)
      )
    )

    // 3. Read orderBase after extraction (another sync could have run concurrently).
    const { _max } = await prisma.lesson.aggregate({ _max: { orderIndex: true } })
    const orderBase = _max.orderIndex ?? 0

    // 4. Persist each lesson only when its extraction succeeded with ≥1 card.
    let newCards = 0
    let newLessons = 0
    let created = 0 // tracks how many lessons were actually persisted (for orderIndex)
    const failures: string[] = []

    // Build the normalizedFront → cardId map ONCE per request so the per-lesson
    // dependency-linking step doesn't re-query the full deck each iteration.
    // Kept scoped to `components: { not: null }` to preserve existing edge
    // semantics (only cards that have components are resolvable as prerequisites).
    // `select` drops `components` — component strings now come from the in-memory
    // extraction result, not a DB re-read. Augmented incrementally during upserts.
    const keyToId = new Map<string, string>()
    const seedCards = await prisma.card.findMany({
      select: { id: true, normalizedFront: true },
      where: { components: { not: null } },
    })
    for (const c of seedCards) keyToId.set(c.normalizedFront, c.id)

    for (let i = 0; i < extractResults.length; i++) {
      const result = extractResults[i]
      // Identify this lesson by its own content so failures[] names something
      // the user can search for in their Google Doc (SYNC-01).
      const excerpt = lessonExcerpt(batch[i].text)

      if (result.status === 'rejected') {
        const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        console.error(`Failed to extract cards for batch item ${i}:`, msg)
        failures.push(`"${excerpt}" — extraction failed (will retry on next sync)`)
        // No Lesson row created → contentHash not stored → auto-retried on next sync.
        continue
      }

      const cards = result.value

      if (cards.length === 0) {
        console.warn(`Batch item ${i}: Claude returned 0 cards — skipping persist.`)
        failures.push(`"${excerpt}" — no cards extracted (will retry on next sync)`)
        continue
      }

      // Extraction succeeded with cards — now create the Lesson and upsert its cards.
      let lesson: { id: string } | null = null
      try {
        lesson = await prisma.lesson.create({
          data: {
            orderIndex: orderBase + (++created),
            title: `Lesson synced ${new Date().toLocaleDateString()}`,
            rawContent: batch[i].text,
            contentHash: batch[i].contentHash,
          },
        })

        // Upsert each card by normalizedFront (real dedup — DB-enforced unique).
        //   CREATE: first time this item is seen → attach to this lesson.
        //   UPDATE: already known → preserve lessonId (first-introduced) and FSRS review.
        //           Refresh components/sentences only if they were empty (backfill safety).
        let createdThisLesson = 0
        // Per-lesson collector of cards that carry components — feeds the
        // dependency-linking step after Promise.all resolves. Resets each lesson.
        const linkTargets: { id: string; components: string[] }[] = []

        await Promise.all(
          cards.map(async (card) => {
            const nf = normalizeFront(card.front)
            const distractorsJson = card.distractors.length
              ? JSON.stringify(card.distractors)
              : null
            const componentsJson = card.components.length
              ? JSON.stringify(card.components)
              : null

            // Check if this card exists so we can decide whether to refresh sentences.
            const existing = await prisma.card.findUnique({
              where: { normalizedFront: nf },
              select: { id: true, sentences: { select: { id: true } } },
            })

            if (!existing) {
              // CREATE: new card — attach to this lesson.
              const created = await prisma.card.create({
                data: {
                  type: card.type,
                  front: card.front,
                  back: card.back,
                  notes: card.notes ?? null,
                  normalizedFront: nf,
                  components: componentsJson,
                  distractors: distractorsJson,
                  lessonId: lesson!.id,
                  sentences: {
                    create: card.sentences.map((s, j) => ({
                      korean:      s.korean,
                      targetForm:  s.targetForm,
                      translation: s.translation,
                      orderIndex:  j,
                    })),
                  },
                  review: { create: {} },
                },
              })
              if (card.components.length > 0) {
                keyToId.set(nf, created.id)
                linkTargets.push({ id: created.id, components: card.components })
              }
              createdThisLesson++
            } else {
              // UPDATE: card exists — preserve lessonId + review; refresh components +
              // sentences if they were previously missing.
              const updateData: Record<string, unknown> = {
                // Refresh extraction artifacts if they've changed or were missing.
                back:       card.back,
                notes:      card.notes ?? null,
                distractors: distractorsJson,
                // Always refresh components — new prompt produces better dependency info.
                components: componentsJson,
              }

              // Refresh sentences only when the card currently has none.
              if (existing.sentences.length === 0 && card.sentences.length > 0) {
                await prisma.sentence.createMany({
                  data: card.sentences.map((s, j) => ({
                    cardId:      existing.id,
                    korean:      s.korean,
                    targetForm:  s.targetForm,
                    translation: s.translation,
                    orderIndex:  j,
                  })),
                })
              }

              await prisma.card.update({
                where: { id: existing.id },
                data:  updateData,
              })
              if (card.components.length > 0) {
                keyToId.set(nf, existing.id)
                linkTargets.push({ id: existing.id, components: card.components })
              }
            }
          })
        )

        // 5. Two-phase dependency linking.
        //    After all cards in the batch are upserted, resolve component strings →
        //    card IDs and create CardDependency edges. Running after the upserts means
        //    forward references within the same sync batch can be resolved.
        //    `keyToId` was built once before the per-lesson loop and augmented above
        //    as each card was upserted — no per-lesson full-deck findMany here.
        for (const { id, components } of linkTargets) {
          for (const comp of components) {
            if (!comp) continue
            const prereqId = keyToId.get(normalizeFront(comp))
            if (!prereqId || prereqId === id) continue
            try {
              await prisma.cardDependency.upsert({
                where: {
                  cardId_prerequisiteId: {
                    cardId:         id,
                    prerequisiteId: prereqId,
                  },
                },
                create: {
                  cardId:         id,
                  prerequisiteId: prereqId,
                },
                update: {}, // no-op — just ensure it exists
              })
            } catch (linkErr) {
              // Link failures are non-fatal — card still usable, just unlinked.
              console.warn(`CardDependency link failed (${id} → ${prereqId}):`, linkErr)
            }
          }
        }

        newLessons++
        newCards += createdThisLesson
      } catch (dbErr: unknown) {
        // DB write failed after the Lesson row may have been created.
        // Compensate by deleting the orphan lesson so it retries cleanly next sync.
        const dbMsg = dbErr instanceof Error ? dbErr.message : 'Unknown DB error'
        console.error(`DB write failed for batch item ${i}:`, dbMsg)
        failures.push(`"${excerpt}" — failed to save (will retry on next sync)`)
        if (lesson) {
          try {
            await prisma.lesson.delete({ where: { id: lesson.id } })
          } catch (delErr) {
            console.error('Failed to clean up orphan lesson:', delErr)
          }
        }
      }
    }

    return NextResponse.json({
      synced: true,
      newLessons,
      newCards,
      remaining,
      failed: failures.length,
      ...(failures.length > 0 && { failures }),
      ...(remaining > 0 && { message: `${remaining} more lesson(s) remaining — sync again to continue.` }),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Sync error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
