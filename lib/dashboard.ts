// lib/dashboard.ts — server-only dashboard data layer
// No 'use client' — this module runs server-side only.
// Extracts the stats + activity queries from /api/stats + /api/activity so
// the RSC pages (app/page.tsx, app/habits/page.tsx) and the GET API routes
// call one shared, DRY function per D-05.

import { prisma } from '@/lib/prisma'
import { getDailyGoalSeconds, getDayStartHour } from '@/lib/settings'
import type { StatsDTO, ActivityDTO } from '@/lib/dto'

/**
 * Fetches all stats needed by the Home page, /wrapped, and GET /api/stats.
 * Runs 5 Prisma queries in parallel via Promise.all.
 * Throws on DB error — callers wrap in try/catch (API routes return 500;
 * RSC pages surface to the nearest error boundary).
 */
export async function getStats(): Promise<StatsDTO> {
  const now = new Date()
  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    // Cards in Review state (state=2) scheduled >= 21 days ≈ well-retained.
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])
  return { totalCards, dueCards, totalLessons, cardsByType, masteredCount }
}

/**
 * Fetches all day records + current settings needed by the Habits page
 * and GET /api/activity. Runs 3 Prisma queries in parallel via Promise.all.
 * StudyDay.date is a String column (YYYY-MM-DD) — no .toISOString() needed.
 * No `take` cap: the "All-time totals" section (HabitsClient) sums over the
 * full history, and the heatmap self-caps rendering at 26 weeks regardless of
 * input size. StudyDay rows are small (date + seconds + reviews), so payload
 * stays modest even for long-time users. Throws on DB error — callers wrap in
 * try/catch.
 */
export async function getActivityData(): Promise<ActivityDTO> {
  const [days, dailyGoalSeconds, dayStartHour] = await Promise.all([
    prisma.studyDay.findMany({
      orderBy: { date: 'desc' },
      select: { date: true, seconds: true, reviews: true },
    }),
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return { days, dailyGoalSeconds, dayStartHour }
}
