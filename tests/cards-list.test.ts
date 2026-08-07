// Unit coverage for lib/cards-list.ts's getCardsPage() / getCardsGroupCounts()
// (31-01-PLAN.md Task 3). Follows tests/study-cards.test.ts's
// vi.mock('@/lib/prisma', ...) pattern — no real DB connection.
//
// Covers: (1) CARDS-01 — the returned page is sentence-free (both the
// underlying Prisma `select` and the resulting CardDTO carry no real
// sentence data); (2) the overfetch-by-one `hasMore`/`nextCursor` boundary
// detection (a page landing exactly on the last available row vs. one that
// overshoots by the extra probe row); (3) empty/single-element edges; (4)
// the shared `where`-builder composing type/search/lesson-range correctly
// (CARDS-03), including the D-05 sentence-search clause; (5)
// getCardsGroupCounts summing `_count` across groups into `total`.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

// Import AFTER the mock declaration (vitest hoists vi.mock above imports).
import { prisma } from '@/lib/prisma'
import { getCardsPage, getCardsGroupCounts } from '@/lib/cards-list'

// A minimal Prisma row shape matching cardSelect's post-select fields — no
// `sentences` key at all, since the select drops it entirely (CARDS-01).
function makeRow(id: string, overrides: Record<string, unknown> = {}) {
  const at = new Date('2026-01-01T00:00:00Z')
  return {
    id,
    createdAt: at,
    updatedAt: at,
    type: 'vocabulary',
    front: `front-${id}`,
    back: `back-${id}`,
    notes: null,
    normalizedFront: `front-${id}`,
    components: null,
    distractors: null,
    lessonId: null,
    lesson: null,
    review: null,
    ...overrides,
  }
}

describe('getCardsPage', () => {
  beforeEach(() => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockReset()
  })

  it('returns a capped page whose cards carry no real sentence data (CARDS-01)', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRow('1'),
      makeRow('2'),
    ])

    const result = await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    expect(result.cards).toHaveLength(2)
    // The underlying Prisma `select` never requests `sentences` at all.
    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.select).not.toHaveProperty('sentences')
    // Every returned card carries an empty sentences array — no real
    // sentence rows leak through the list query.
    for (const card of result.cards) {
      expect(card.sentences).toEqual([])
    }
  })

  it('detects hasMore via the overfetch-by-one probe row and sets nextCursor to the last KEPT row', async () => {
    // take=2, mock returns take+1=3 rows — the 3rd is the probe row and must
    // be sliced off, with nextCursor pointing at the last KEPT (2nd) row.
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRow('a'),
      makeRow('b'),
      makeRow('c'),
    ])

    const result = await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 2,
    })

    expect(result.cards).toHaveLength(2)
    expect(result.cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe('b')

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.take).toBe(3) // take + 1
    expect(callArgs.cursor).toBeUndefined()
    expect(callArgs.skip).toBeUndefined()
  })

  it('a page boundary landing exactly on the last row returns hasMore:false / nextCursor:null (no overshoot)', async () => {
    // take=2, mock returns exactly 2 rows — no probe row came back, meaning
    // this page boundary lands exactly on the deck's last row.
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRow('a'),
      makeRow('b'),
    ])

    const result = await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 2,
    })

    expect(result.cards).toHaveLength(2)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it('passes cursor/skip to Prisma only when a cursor is provided (subsequent page)', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow('c')])

    await getCardsPage({
      type: 'vocabulary',
      cursor: 'b',
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 2,
    })

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.cursor).toEqual({ id: 'b' })
    expect(callArgs.skip).toBe(1)
  })

  it('returns an empty page ({ cards: [], nextCursor: null, hasMore: false }) for zero matching cards', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await getCardsPage({
      type: 'grammar',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    expect(result).toEqual({ cards: [], nextCursor: null, hasMore: false })
  })

  it('behaves correctly for a group with exactly one matching card', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow('solo')])

    const result = await getCardsPage({
      type: 'phrase',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].id).toBe('solo')
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it('orders by createdAt desc with an id tiebreak for deterministic cursor pagination', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeRow('1')])

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  // ── where-builder composition (CARDS-03) ──────────────────────────────────

  it('omits a `type` filter when type is "all", and includes it otherwise', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({ type: 'all', cursor: null, search: null, lessonFrom: null, lessonTo: null, take: 30 })
    let callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.type).toBeUndefined()

    await getCardsPage({ type: 'grammar', cursor: null, search: null, lessonFrom: null, lessonTo: null, take: 30 })
    callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[1][0]
    expect(callArgs.where.type).toBe('grammar')
  })

  it('maps type "other" to a notIn filter excluding the three canonical types (31-02)', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({ type: 'other', cursor: null, search: null, lessonFrom: null, lessonTo: null, take: 30 })
    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.type).toEqual({ notIn: ['vocabulary', 'grammar', 'phrase'] })
  })

  it('composes a search where-clause including the D-05 sentence-search OR branch', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: 'hello',
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.OR).toContainEqual({ front: { contains: 'hello' } })
    expect(callArgs.where.OR).toContainEqual({ back: { contains: 'hello' } })
    expect(callArgs.where.OR).toContainEqual({ notes: { contains: 'hello' } })
    expect(callArgs.where.OR).toContainEqual({
      sentences: {
        some: {
          OR: [{ korean: { contains: 'hello' } }, { translation: { contains: 'hello' } }],
        },
      },
    })
  })

  it('omits the OR search clause entirely when search is null', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: 30,
    })

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.OR).toBeUndefined()
  })

  it('composes a lesson-range where-clause from lessonFrom/lessonTo', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: 3,
      lessonTo: 7,
      take: 30,
    })

    const callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.lesson).toEqual({ orderIndex: { gte: 3, lte: 7 } })
  })

  it('composes a one-sided lesson-range where-clause when only lessonFrom or lessonTo is set', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: 3,
      lessonTo: null,
      take: 30,
    })
    let callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.where.lesson).toEqual({ orderIndex: { gte: 3 } })

    await getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: 7,
      take: 30,
    })
    callArgs = (prisma.card.findMany as ReturnType<typeof vi.fn>).mock.calls[1][0]
    expect(callArgs.where.lesson).toEqual({ orderIndex: { lte: 7 } })
  })
})

describe('getCardsGroupCounts', () => {
  beforeEach(() => {
    ;(prisma.card.groupBy as ReturnType<typeof vi.fn>).mockReset()
  })

  it('sums _count across groups into total correctly', async () => {
    ;(prisma.card.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { type: 'vocabulary', _count: 5 },
      { type: 'grammar', _count: 3 },
      { type: 'phrase', _count: 1 },
    ])

    const result = await getCardsGroupCounts({ search: null, lessonFrom: null, lessonTo: null })

    expect(result.byType).toEqual([
      { type: 'vocabulary', _count: 5 },
      { type: 'grammar', _count: 3 },
      { type: 'phrase', _count: 1 },
    ])
    expect(result.total).toBe(9)
  })

  it('returns total 0 for an empty deck', async () => {
    ;(prisma.card.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const result = await getCardsGroupCounts({ search: null, lessonFrom: null, lessonTo: null })

    expect(result).toEqual({ byType: [], total: 0 })
  })

  it('groups by type with the same where-builder as getCardsPage, ignoring the type param itself', async () => {
    ;(prisma.card.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await getCardsGroupCounts({ search: 'test', lessonFrom: 1, lessonTo: 5 })

    const callArgs = (prisma.card.groupBy as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.by).toEqual(['type'])
    expect(callArgs._count).toBe(true)
    // Never filters by a single type — a per-type breakdown is the point.
    expect(callArgs.where.type).toBeUndefined()
    expect(callArgs.where.lesson).toEqual({ orderIndex: { gte: 1, lte: 5 } })
    expect(callArgs.where.OR).toContainEqual({ front: { contains: 'test' } })
  })
})
