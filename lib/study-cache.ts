// lib/study-cache.ts — server-only in-memory invariant snapshot for /study.
// No 'use client' — this module runs server-side only.
//
// Phase 32 (STUDY-03). Holds the four DB reads that are constant across every
// /study load regardless of which user/session is loading — CardDependency
// edges, the normalizedFront "known lemma" set, sessionSize, and the lessons
// list — so the common-path request can skip them entirely and read this
// snapshot instead.
//
// Invalidation: the ONLY trigger is a change to the `studyCacheVersion`
// Setting row, written exclusively by bumpStudyCacheVersion() in
// lib/settings.ts, called from lib/sync.ts:runSync(),
// lib/relink-dependencies.ts:relinkAllDependencies(), and
// lib/settings.ts:setSessionSize() (CR-01 fix, 32-REVIEW.md — sessionSize is
// folded into this same snapshot, so a Settings change to it must invalidate
// the snapshot the same way a sync/relink does). This is deliberately
// narrower than a general freshness mechanism (D-02, locked): a card graded
// via POST /api/review does NOT bump the token and does NOT invalidate this
// cache — that trigger is explicitly out of scope for this phase and belongs
// to Phase 33's VERS-01 if it's ever wanted.
//
// The version itself is supplied by the CALLER (refreshStudyCache(version))
// and is never read from Setting inside this module — the caller (Phase 33's
// lib/study-cards.ts integration) is the one place that knows the version it
// observed when it detected a cache miss, and stamping with anything else
// (e.g. a fresh re-read at the end of the refill) would let a version bump
// that lands mid-refill be silently absorbed instead of self-correcting on
// the NEXT request.
//
// Cross-process caveat: this module's snapshot lives on a `globalThis` holder
// — visible only within the Next.js server process that populated it. It is
// NOT visible to scripts/local-resync.mts or scripts/relink-dependencies.mts,
// which run as separate `tsx` processes with their own Node runtime and their
// own (empty) globalThis. That is exactly why the invalidation SIGNAL lives in
// the `Setting` table (a channel both the server process and the standalone
// scripts share) rather than also being globalThis-only — the next /study
// request made against the already-running server reads the DB-persisted
// version, sees it changed, and refills for itself.
//
// REFILL SHAPE (Phase 32-04, Task 1 revision): originally implemented as four
// independent Prisma calls (cardDependency.findMany + card.findMany +
// getSessionSize() + lesson.findMany) run concurrently via Promise.allSettled.
// 32-04-PLAN.md Task 1's round-trip instrumentation test measured that shape
// against a real DB at 4 physical libSQL round trips on a cache miss — pushing
// a cold `getStudyCards()` call to 6 total (Phase A 1 + refill 4 + Phase B 1),
// double STUDY-01's "at most 3" cold-miss budget. 32-CONTEXT.md's own "Claude's
// Discretion" note anticipated exactly this: "whether the cache-miss refill is
// one combined json_group_array-based query or several... the planner/executor
// should follow whichever shape passes the round-trip-count instrumentation."
// It doesn't pass at four; it does at one. All four reads are now folded into
// ONE prisma.$queryRaw via correlated json_group_array/json_object subqueries
// — the same technique lib/study-cards.ts's Phase B already uses for the
// one-to-many Sentence relation — bringing the refill down to 1 physical round
// trip (cold-miss total: 3; warm total: 2, refill skipped entirely).
//
// DEGRADATION TRADEOFF (deliberate, not an oversight): the four-separate-call
// shape could degrade PER FIELD independently (e.g. only the lessons read
// failing while edges/lemmas/sessionSize still succeed), because each was a
// separate physical request. One combined query is atomic — it succeeds as a
// whole or throws as a whole, so a failure now degrades ALL FOUR fields
// together rather than only the one that actually failed. This is the
// unavoidable cost of collapsing 4 round trips into 1: per-field fault
// isolation and physical-round-trip count are in direct tension, and
// STUDY-01's round-trip budget is this phase's headline, named requirement —
// the tradeoff is taken deliberately in its favor, not by accident.

import { prisma } from '@/lib/prisma'
import { parseSessionSize } from '@/lib/settings'
import { DEFAULT_SESSION_SIZE } from '@/lib/habit'
import type { LessonDTO } from '@/lib/dto'

export interface StudyInvariants {
  version: string | null
  // Treat as frozen — never mutated in place by consumers. Only ever replaced
  // wholesale via a fresh refreshStudyCache() call.
  edges: { cardId: string; prerequisiteId: string }[]
  // Treat as frozen — never mutated in place by consumers.
  lemmas: Set<string>
  sessionSize: number
  lessons: LessonDTO[]
}

const globalForStudyCache = globalThis as unknown as {
  studyCache: StudyInvariants | undefined
}

/** Returns the current snapshot, or undefined if never populated. No I/O. */
export function getStudyCache(): StudyInvariants | undefined {
  return globalForStudyCache.studyCache
}

// One row, four correlated-subquery columns — edges/lessons are JSON arrays
// (json_group_array over an empty result genuinely returns the TEXT "[]", not
// NULL or a zero-row result set; verified empirically against this project's
// local SQLite build during Task 1, same behavior lib/study-cards.ts's Phase B
// already relies on for its sentencesJson column). sessionSizeValue is the raw
// Setting.value TEXT, or SQL NULL (surfaced as JS null) when the key has never
// been written — parseSessionSize() below applies the exact same default this
// module used to get from getSessionSize().
interface InvariantsRow {
  edgesJson: string
  lemmasJson: string
  sessionSizeValue: string | null
  lessonsJson: string
}

interface RawEdge {
  cardId: string
  prerequisiteId: string
}

/**
 * Refill the snapshot. ONE prisma.$queryRaw call (never
 * prisma.$transaction([...]) — 32-RESEARCH.md verified from the installed
 * @prisma/adapter-libsql/@libsql/client source that $transaction increases
 * physical round trips and serializes them on this stack; never four separate
 * concurrent calls either — see this file's REFILL SHAPE header comment for
 * why that shape was measured out by Task 1's round-trip instrumentation)
 * folding all four invariant reads into correlated json_group_array/
 * json_object subqueries, the same technique lib/study-cards.ts's Phase B
 * uses for the Sentence relation.
 *
 * Stamps `version` with the argument passed in — NEVER with a fresh read of
 * Setting — so a version bump that lands after the caller already read it is
 * reflected on the caller's NEXT request, not silently folded into this one.
 *
 * On success, the object is assigned to the holder in exactly one statement
 * (atomic replacement — never field-by-field mutation) and returned. On
 * failure, ALL FOUR fields degrade together (edges → [], lemmas → empty Set,
 * sessionSize → DEFAULT_SESSION_SIZE, lessons → []) — the query is one
 * physical round trip, so a rejection is necessarily whole-query, not
 * per-field (see this file's DEGRADATION TRADEOFF header comment). The
 * degraded object is returned to this one caller WITHOUT being stored, so the
 * next request retries instead of pinning the degradation behind a version
 * stamp that would otherwise look "current". The log keeps the legacy
 * `[study-cards]`-prefixed RELIABILITY-01 message (rather than this file's
 * own `[study-cache]` prefix) because tests/study-cards.test.ts's and
 * tests/study-cache.test.ts's regression guards for that reliability contract
 * key off that exact prefix.
 */
export async function refreshStudyCache(version: string | null): Promise<StudyInvariants> {
  let rows: InvariantsRow[]
  try {
    rows = await prisma.$queryRaw<InvariantsRow[]>`
      SELECT
        (
          SELECT json_group_array(json_object('cardId', cd.cardId, 'prerequisiteId', cd.prerequisiteId))
          FROM CardDependency cd
        ) AS edgesJson,
        (
          SELECT json_group_array(c.normalizedFront)
          FROM Card c
          INNER JOIN CardReview r ON r.cardId = c.id
          WHERE r.state >= 1
        ) AS lemmasJson,
        (SELECT value FROM Setting WHERE key = 'sessionSize') AS sessionSizeValue,
        (
          SELECT json_group_array(json_object('id', l.id, 'orderIndex', l.orderIndex, 'title', l.title))
          FROM (SELECT * FROM Lesson ORDER BY orderIndex ASC) l
        ) AS lessonsJson
    `
  } catch (err) {
    console.error(
      '[study-cards] invariants refill query failed; degrading to zero prerequisite edges, an empty known-lemma set (unknownCount ranking treats every word as unknown), DEFAULT_SESSION_SIZE, and an empty lessons list',
      err
    )
    return {
      version,
      edges: [],
      lemmas: new Set(),
      sessionSize: DEFAULT_SESSION_SIZE,
      lessons: [],
    }
  }

  const row = rows[0]
  const edges: RawEdge[] = JSON.parse(row.edgesJson)
  const lemmas = new Set<string>(JSON.parse(row.lemmasJson))
  const sessionSize = parseSessionSize(row.sessionSizeValue ?? undefined)
  const lessons: LessonDTO[] = JSON.parse(row.lessonsJson)

  const snapshot: StudyInvariants = { version, edges, lemmas, sessionSize, lessons }
  globalForStudyCache.studyCache = snapshot
  return snapshot
}

/** Test-only: clears the holder so cases cannot leak snapshot state into one another. */
export function resetStudyCacheForTests(): void {
  globalForStudyCache.studyCache = undefined
}
