import { describe, it, expect } from 'vitest'
import {
  shiftDate,
  formatDuration,
  habitDateStr,
  computeStreaks,
  checkMilestone,
  computeHabitStats,
  type DayRecord,
} from '../lib/habit'

describe('shiftDate', () => {
  it('shifts forward by 1 day', () => {
    expect(shiftDate('2026-01-01', 1)).toBe('2026-01-02')
  })

  it('shifts backward by 1 day', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('handles month boundaries', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles year boundaries', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatDuration', () => {
  it('formats whole minutes', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(300)).toBe('5:00')
  })

  it('pads seconds with leading zero', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(9)).toBe('0:09')
  })

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
})

describe('habitDateStr', () => {
  it('shifts date back by dayStartHour hours', () => {
    // 1:00 AM local should still count as previous habit day when dayStartHour=2
    const date = new Date('2026-06-23T01:00:00')
    expect(habitDateStr(2, date)).toBe('2026-06-22')
  })

  it('returns same day after dayStartHour', () => {
    const date = new Date('2026-06-23T03:00:00')
    expect(habitDateStr(2, date)).toBe('2026-06-23')
  })
})

describe('computeStreaks', () => {
  const GOAL = 300

  it('returns 0 streak when no days', () => {
    const r = computeStreaks([], '2026-06-23', GOAL)
    expect(r.current).toBe(0)
    expect(r.longest).toBe(0)
  })

  it('counts consecutive met days', () => {
    const days: DayRecord[] = [
      { date: '2026-06-21', seconds: 300 },
      { date: '2026-06-22', seconds: 300 },
      { date: '2026-06-23', seconds: 300 },
    ]
    const r = computeStreaks(days, '2026-06-23', GOAL)
    expect(r.current).toBe(3)
    expect(r.longest).toBe(3)
  })

  it('stops streak at unmet day without freeze budget', () => {
    const days: DayRecord[] = [
      { date: '2026-06-21', seconds: 300 },
      // 2026-06-22 missing (not met)
      { date: '2026-06-23', seconds: 300 },
    ]
    const r = computeStreaks(days, '2026-06-23', GOAL)
    expect(r.current).toBe(1)
  })

  it('tracks todaySeconds correctly', () => {
    const days: DayRecord[] = [{ date: '2026-06-23', seconds: 150 }]
    const r = computeStreaks(days, '2026-06-23', GOAL)
    expect(r.todaySeconds).toBe(150)
  })
})

describe('checkMilestone', () => {
  it('detects milestone crossing', () => {
    expect(checkMilestone(7, 6)).toBe(7)
    expect(checkMilestone(30, 29)).toBe(30)
    expect(checkMilestone(100, 99)).toBe(100)
    expect(checkMilestone(365, 364)).toBe(365)
  })

  it('returns null when no milestone crossed', () => {
    expect(checkMilestone(8, 7)).toBeNull()
    expect(checkMilestone(6, 5)).toBeNull()
  })
})

describe('computeHabitStats', () => {
  const GOAL = 300

  it('sums totals correctly', () => {
    const days: DayRecord[] = [
      { date: '2026-06-21', seconds: 400, reviews: 10 },
      { date: '2026-06-22', seconds: 200, reviews: 5 },
    ]
    const s = computeHabitStats(days, GOAL)
    expect(s.totalSeconds).toBe(600)
    expect(s.totalReviews).toBe(15)
    expect(s.daysStudied).toBe(2)
    expect(s.goalMetDays).toBe(1)
    expect(s.bestDaySeconds).toBe(400)
    expect(s.bestDayDate).toBe('2026-06-21')
  })

  it('returns zero averages for empty input', () => {
    const s = computeHabitStats([], GOAL)
    expect(s.avgSecondsPerActiveDay).toBe(0)
    expect(s.goalCompletionRate).toBe(0)
  })
})
