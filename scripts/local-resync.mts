/**
 * Local resync: runs extraction on the developer machine so there is no
 * 60-second Vercel function timeout.
 *
 * Usage:
 *   npx tsx scripts/local-resync.mts
 *
 * Reads DATABASE_URL, DATABASE_AUTH_TOKEN, ANTHROPIC_API_KEY,
 * GOOGLE_SERVICE_ACCOUNT_KEY, and NEXT_PUBLIC_GOOGLE_DOC_ID from .env / .env.local.
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we use
// dynamic imports below to ensure Prisma / Anthropic SDK see the right env vars).
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at module init.
const { fetchGoogleDoc }         = await import('../lib/google-docs.js')
const { extractCardsFromNotes }  = await import('../lib/extract-cards.js')
const { normalizeFront }         = await import('../lib/card-key.js')
const { resolveDependencyEdges } = await import('../lib/link-dependencies.js')
const { prisma }                 = await import('../lib/prisma.js')

const documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID
if (!documentId) { console.error('NEXT_PUBLIC_GOOGLE_DOC_ID not set'); process.exit(1) }

console.log('Fetching Google Doc…')
const lessonDataList = await fetchGoogleDoc(documentId)
console.log(`Fetched ${lessonDataList.length} lessons from doc.`)
console.log()

// Filter to only new lessons by content hash
const newLessons: { text: string; emphasized: string[]; contentHash: string }[] = []
for (const lesson of lessonDataList) {
  const contentHash = createHash('sha256').update(lesson.text).digest('hex')
  const existing = await prisma.lesson.findUnique({ where: { contentHash } })
  if (!existing) {
    newLessons.push({ text: lesson.text, emphasized: lesson.emphasized, contentHash })
  }
}

if (newLessons.length === 0) {
  console.log('No new lessons — all up to date.')
  process.exit(0)
}

console.log(`${newLessons.length} new lessons to process (${lessonDataList.length - newLessons.length} already synced).`)
console.log()

// Load existing normalized fronts for the dedup hint to Claude.
const existingNormalizedFronts = (
  await prisma.card.findMany({ select: { normalizedFront: true } })
).map((c: { normalizedFront: string }) => c.normalizedFront)

const { _max } = await prisma.lesson.aggregate({ _max: { orderIndex: true } })
let orderBase = (_max as { orderIndex: number | null }).orderIndex ?? 0

let totalLessons = 0
let totalNewCards = 0
let totalFailed = 0

// Process one lesson at a time so progress is clear and the run can be resumed.
for (let i = 0; i < newLessons.length; i++) {
  const data = newLessons[i]
  const lessonNum = i + 1
  const emphasizedLabel = data.emphasized.length > 0
    ? ` (${data.emphasized.length} emphasized: ${data.emphasized.slice(0, 5).join(', ')}${data.emphasized.length > 5 ? '…' : ''})`
    : ''
  console.log(`[${lessonNum}/${newLessons.length}] Extracting…${emphasizedLabel}`)

  let cards
  try {
    cards = await extractCardsFromNotes(data.text, existingNormalizedFronts, data.emphasized)
    console.log(`  → Claude returned ${cards.length} cards`)
  } catch (e) {
    console.error(`  ✗ Extraction failed:`, (e as Error).message)
    totalFailed++
    continue
  }

  if (cards.length === 0) {
    console.warn(`  ✗ No cards extracted — skipping lesson`)
    totalFailed++
    continue
  }

  orderBase++
  let lesson: { id: string } | null = null
  try {
    lesson = await prisma.lesson.create({
      data: {
        orderIndex:  orderBase,
        title:       `Lesson synced ${new Date().toLocaleDateString()}`,
        rawContent:  data.text,
        contentHash: data.contentHash,
      },
    })
  } catch (e) {
    console.error(`  ✗ Failed to create Lesson row:`, (e as Error).message)
    totalFailed++
    continue
  }

  let newCardCount = 0
  const upsertedIds: string[] = []
  for (const card of cards) {
    const nf = normalizeFront(card.front)
    const distractorsJson = card.distractors.length ? JSON.stringify(card.distractors) : null
    const componentsJson  = card.components.length  ? JSON.stringify(card.components)  : null

    const existingCard = await prisma.card.findUnique({
      where:  { normalizedFront: nf },
      select: { id: true, sentences: { select: { id: true } } },
    })

    if (!existingCard) {
      const created = await prisma.card.create({
        data: {
          type:            card.type,
          front:           card.front,
          back:            card.back,
          notes:           card.notes ?? null,
          normalizedFront: nf,
          components:      componentsJson,
          distractors:     distractorsJson,
          lessonId:        lesson.id,
          sentences: {
            create: card.sentences.map((s, j: number) => ({
              korean:      s.korean,
              targetForm:  s.targetForm,
              translation: s.translation,
              orderIndex:  j,
            })),
          },
          review: { create: {} },
        },
      })
      upsertedIds.push(created.id)
      existingNormalizedFronts.push(nf)
      newCardCount++
    } else {
      const updateData: Record<string, unknown> = {
        back:        card.back,
        notes:       card.notes ?? null,
        distractors: distractorsJson,
        components:  componentsJson,
      }
      if ((existingCard.sentences as unknown[]).length === 0 && card.sentences.length > 0) {
        await prisma.sentence.createMany({
          data: card.sentences.map((s, j: number) => ({
            cardId:      existingCard.id,
            korean:      s.korean,
            targetForm:  s.targetForm,
            translation: s.translation,
            orderIndex:  j,
          })),
        })
      }
      await prisma.card.update({ where: { id: existingCard.id }, data: updateData })
      upsertedIds.push(existingCard.id)
    }
  }

  console.log(`  ✓ ${newCardCount} new cards (${cards.length - newCardCount} already existed).`)
  totalLessons++
  totalNewCards += newCardCount

  // Two-phase dependency linking for this lesson's upserted cards.
  // Load ALL cards (no where clause) so a leaf-node card (no components of its
  // own) is still resolvable as another card's prerequisite; the loop below
  // already skips cards with no components as edge SOURCES via the
  // `!dbCard.components` guard, so broadening this only affects which
  // prerequisites resolve.
  if (upsertedIds.length > 0) {
    const allCardsForLink = await prisma.card.findMany({
      select: { id: true, normalizedFront: true, components: true },
    }) as { id: string; normalizedFront: string; components: string | null }[]
    const keyToId = new Map(allCardsForLink.map((c) => [c.normalizedFront, c.id]))
    const upsertedSet = new Set(upsertedIds)
    // IN-02: resolution itself is shared via lib/link-dependencies.ts.
    const linkTargets = allCardsForLink
      .filter((c) => upsertedSet.has(c.id) && c.components)
      .map((c) => {
        let comps: string[] = []
        try { comps = JSON.parse(c.components as string) } catch { comps = [] }
        return { id: c.id, components: comps }
      })
    const resolvedEdges = resolveDependencyEdges(keyToId, linkTargets)
    let edgeCount = 0
    for (const { cardId, prerequisiteId } of resolvedEdges) {
      try {
        await prisma.cardDependency.upsert({
          where:  { cardId_prerequisiteId: { cardId, prerequisiteId } },
          create: { cardId, prerequisiteId },
          update: {},
        })
        edgeCount++
      } catch { /* non-fatal */ }
    }
    if (edgeCount > 0) console.log(`  ↳ ${edgeCount} dependency edges linked.`)
  }
  console.log()
}

// Final relink pass to catch cross-lesson forward references.
// Delegates to the shared lib/relink-dependencies.ts helper (IN-02
// consolidation — the last duplicated full-deck relink persistence loop is
// gone; resolution lives in lib/link-dependencies.ts, orchestration here).
console.log('Running final dependency relink pass…')
const { relinkAllDependencies } = await import('../lib/relink-dependencies.js')
const relinkResult = await relinkAllDependencies()
console.log(`  ↳ ${relinkResult.edgesCreated} edges created (${relinkResult.totalEdges} total across ${relinkResult.cardsScanned} cards).`)
console.log()

const totalCards = await prisma.card.count()
const totalEdges = await prisma.cardDependency.count()

console.log('='.repeat(50))
console.log('Resync complete.')
console.log(`  Lessons processed : ${totalLessons}`)
console.log(`  New cards created : ${totalNewCards}`)
console.log(`  Failures          : ${totalFailed}`)
console.log(`  Total cards in DB : ${totalCards}`)
console.log(`  Total edges in DB : ${totalEdges}`)
console.log('='.repeat(50))

process.exit(0)
