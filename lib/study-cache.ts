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
// lib/settings.ts, called unconditionally from lib/sync.ts:runSync() and
// lib/relink-dependencies.ts:relinkAllDependencies(). This is deliberately
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

import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
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

/**
 * Refill the snapshot. Runs all four reads concurrently via Promise.allSettled
 * (never prisma.$transaction([...]) — 32-RESEARCH.md verified from the
 * installed @prisma/adapter-libsql/@libsql/client source that $transaction
 * increases physical round trips and serializes them on this stack, the
 * opposite of what a concurrent refill wants).
 *
 * Degrades per field exactly as lib/study-cards.ts does today: edges → [],
 * lemmas → empty Set, sessionSize → DEFAULT_SESSION_SIZE, lessons → []. The
 * lemmas-failure log message is byte-identical to lib/study-cards.ts's
 * existing RELIABILITY-01 log so that regression test keeps matching once
 * Plan 03 relocates the read here.
 *
 * Stamps `version` with the argument passed in — NEVER with a fresh read of
 * Setting — so a version bump that lands after the caller already read it is
 * reflected on the caller's NEXT request, not silently folded into this one.
 *
 * If EVERY read fulfilled, the object is assigned to the holder in exactly
 * one statement (atomic replacement — never field-by-field mutation) and
 * returned. If ANY read rejected, the degraded object is returned WITHOUT
 * being stored, so the next request retries instead of pinning the
 * degradation behind a version stamp that would otherwise look "current".
 */
export async function refreshStudyCache(version: string | null): Promise<StudyInvariants> {
  const [edgesResult, lemmasResult, sessionSizeResult, lessonsResult] = await Promise.allSettled([
    prisma.cardDependency.findMany({
      select: { cardId: true, prerequisiteId: true },
    }),
    prisma.card.findMany({
      where: { review: { state: { gte: 1 } } },
      select: { normalizedFront: true },
    }),
    getSessionSize(),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  if (lemmasResult.status === 'rejected') {
    console.error(
      '[study-cards] known-lemmas query failed; unknownCount ranking degrading to an empty known-lemma set',
      lemmasResult.reason
    )
  }
  if (edgesResult.status === 'rejected') {
    console.error('[study-cache] edges query failed; degrading to zero prerequisite edges', edgesResult.reason)
  }
  if (sessionSizeResult.status === 'rejected') {
    console.error(
      '[study-cache] sessionSize read failed; degrading to DEFAULT_SESSION_SIZE',
      sessionSizeResult.reason
    )
  }
  if (lessonsResult.status === 'rejected') {
    console.error('[study-cache] lessons query failed; degrading to an empty lessons list', lessonsResult.reason)
  }

  const snapshot: StudyInvariants = {
    version,
    edges: edgesResult.status === 'fulfilled' ? edgesResult.value : [],
    lemmas: new Set(
      lemmasResult.status === 'fulfilled' ? lemmasResult.value.map((r) => r.normalizedFront) : []
    ),
    sessionSize: sessionSizeResult.status === 'fulfilled' ? sessionSizeResult.value : DEFAULT_SESSION_SIZE,
    lessons: lessonsResult.status === 'fulfilled' ? lessonsResult.value : [],
  }

  const allFulfilled =
    edgesResult.status === 'fulfilled' &&
    lemmasResult.status === 'fulfilled' &&
    sessionSizeResult.status === 'fulfilled' &&
    lessonsResult.status === 'fulfilled'

  // Only a fully-fulfilled refill is ever stored. A partially-degraded result
  // is returned to this one caller but the holder is left untouched, so the
  // NEXT request retries the refill from scratch rather than getting pinned
  // behind a version stamp that would otherwise look fresh.
  if (allFulfilled) {
    globalForStudyCache.studyCache = snapshot
  }

  return snapshot
}

/** Test-only: clears the holder so cases cannot leak snapshot state into one another. */
export function resetStudyCacheForTests(): void {
  globalForStudyCache.studyCache = undefined
}
