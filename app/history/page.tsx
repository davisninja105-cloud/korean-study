// Server component — no client directive
import { getReviewHistory, isValidOpaqueId, PAGE_SIZE } from '@/lib/review-history'
import { prisma } from '@/lib/prisma'
import HistoryClient from '@/components/HistoryClient'

// Renders live ReviewLog data via Prisma. Without force-dynamic this page is
// statically prerendered at build and shows a frozen snapshot in production.
// Force dynamic so the query runs per request (mirrors app/habits/page.tsx).
export const dynamic = 'force-dynamic'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cardId?: string }>
}) {
  const { cardId: rawCardId } = await searchParams
  // Same length bound as GET /api/reviews — an invalid id is ignored (treated
  // as "no filter") rather than passed through to the query.
  const cardId = rawCardId && isValidOpaqueId(rawCardId) ? rawCardId : null

  const initialLogs = await getReviewHistory({ cardId, cursor: null })

  // First row's card front is free (already joined); only fall back to an
  // indexed PK lookup when the filtered card has zero history rows yet.
  const filterCardFront = cardId ? (
    initialLogs[0]?.cardFront ??
    (await prisma.card.findUnique({ where: { id: cardId }, select: { front: true } }))?.front ??
    null
  ) : null

  return (
    <HistoryClient
      // Re-keyed on cardId so switching or clearing the filter remounts the
      // client component instead of reusing stale `rows`/`hasMore` state
      // seeded from the previous initialLogs prop (18-REVIEW.md CR-1).
      key={cardId ?? 'all'}
      initialLogs={initialLogs}
      cardId={cardId}
      cardFront={filterCardFront}
      pageSize={PAGE_SIZE}
    />
  )
}
