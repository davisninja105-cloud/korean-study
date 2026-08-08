// Server component — no client directive
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

// This page renders the live due-card pool via Prisma. Without force-dynamic,
// Next.js statically prerenders it at build time, so every fresh navigation
// serves the same build-time card set (the "same cards just reviewed" bug).
// Force dynamic so getStudyCards() re-queries the DB on every request.
export const dynamic = 'force-dynamic'

export default async function StudyPage() {
  // Sequenced, never Promise.all'd: getStudyCards() is what populates (or
  // reads) lib/study-cache.ts's invariants snapshot, and `lessons` below
  // comes from that same snapshot. Running the lessons read concurrently
  // would let it observe the snapshot before Phase A ever populates it
  // (32-RESEARCH.md Pitfall 4) — a real race, not just a style preference.
  // This is also a deliberate concurrency reduction that costs nothing: on
  // a warm cache, `lessons` is an already-fetched in-memory array, not a
  // separate database round trip.
  const { cards: cardDTOs, lessons } = await getStudyCards({
    scope: 'due',
    lessonFrom: null,
    lessonTo: null,
  })
  return <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
}
