// Habit-tracking helpers shared by the dashboard. Pure functions so the client
// can compute streaks/heatmap from raw day records using its own local "today".

export const DEFAULT_GOAL_SECONDS = 300 // 5 minutes
export const DEFAULT_DAY_START_HOUR = 2  // new habit-day begins at 2:00 AM
export const DEFAULT_SESSION_SIZE = 20   // cards per study session

export interface DayRecord {
  date: string // "YYYY-MM-DD" (user-local calendar day)
  seconds: number
  reviews?: number
}

// Local calendar day as "YYYY-MM-DD" (NOT UTC — the habit follows the user's day).
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Start of the NEXT habit day as an absolute Date.
// A card is "still due today" iff card.nextReview < nextHabitDayStart(...).
// `now` is passed in rather than called internally so callers stay pure-safe.
export function nextHabitDayStart(dayStartHour: number, now: Date): Date {
  // Today's habit-day boundary: today at dayStartHour:00:00 local time.
  const todayBoundary = new Date(now)
  todayBoundary.setHours(dayStartHour, 0, 0, 0)
  if (now < todayBoundary) {
    // We haven't crossed today's boundary yet — that IS the next habit-day start.
    return todayBoundary
  }
  // Past today's boundary — next is tomorrow at the same hour.
  const tomorrowBoundary = new Date(todayBoundary)
  tomorrowBoundary.setDate(tomorrowBoundary.getDate() + 1)
  return tomorrowBoundary
}

// Habit "day" string, where a day starts at `dayStartHour` local time.
// e.g. dayStartHour=2 means a 1am session counts toward the previous day.
// Call this from effects/handlers only (never bare in render) to stay pure.
export function habitDateStr(dayStartHour: number, d: Date = new Date()): string {
  return localDateStr(new Date(d.getTime() - dayStartHour * 3_600_000))
}

// Calendar-day arithmetic on a "YYYY-MM-DD" string (UTC math avoids DST drift).
export function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86_400_000)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export interface StreakInfo {
  current: number
  longest: number
  todaySeconds: number
  metSet: Set<string>
}

// Compute current/longest streak (in days meeting `goalSeconds`) plus today's
// seconds and the set of met days (for heatmap shading).
export function computeStreaks(days: DayRecord[], todayStr: string, goalSeconds: number): StreakInfo {
  const secByDate = new Map(days.map((d) => [d.date, d.seconds]))
  const metSet = new Set<string>()
  for (const d of days) if (d.seconds >= goalSeconds) metSet.add(d.date)

  // Current streak: count back from today (or yesterday, if today isn't met yet
  // so an in-progress day doesn't read as a broken streak).
  let current = 0
  let cursor = metSet.has(todayStr) ? todayStr : shiftDate(todayStr, -1)
  while (metSet.has(cursor)) {
    current++
    cursor = shiftDate(cursor, -1)
  }

  // Longest streak: from each run-start (a met day whose previous day isn't met),
  // count forward.
  let longest = 0
  for (const date of metSet) {
    if (!metSet.has(shiftDate(date, -1))) {
      let len = 1
      let next = shiftDate(date, 1)
      while (metSet.has(next)) { len++; next = shiftDate(next, 1) }
      if (len > longest) longest = len
    }
  }

  return { current, longest, todaySeconds: secByDate.get(todayStr) ?? 0, metSet }
}

export interface HabitStats {
  totalSeconds: number
  totalReviews: number
  daysStudied: number       // days with seconds > 0
  goalMetDays: number       // days with seconds >= goal
  avgSecondsPerActiveDay: number
  goalCompletionRate: number // goalMetDays / daysStudied, 0-1
  bestDaySeconds: number
  bestDayDate: string        // "YYYY-MM-DD" of highest-seconds day
}

// Aggregate all-time stats from the full day record array.
export function computeHabitStats(days: DayRecord[], goalSeconds: number): HabitStats {
  let totalSeconds = 0
  let totalReviews = 0
  let daysStudied = 0
  let goalMetDays = 0
  let bestDaySeconds = 0
  let bestDayDate = ''

  for (const d of days) {
    totalSeconds += d.seconds
    totalReviews += d.reviews ?? 0
    if (d.seconds > 0) daysStudied++
    if (d.seconds >= goalSeconds) goalMetDays++
    if (d.seconds > bestDaySeconds) {
      bestDaySeconds = d.seconds
      bestDayDate = d.date
    }
  }

  return {
    totalSeconds,
    totalReviews,
    daysStudied,
    goalMetDays,
    avgSecondsPerActiveDay: daysStudied > 0 ? Math.round(totalSeconds / daysStudied) : 0,
    goalCompletionRate: daysStudied > 0 ? goalMetDays / daysStudied : 0,
    bestDaySeconds,
    bestDayDate,
  }
}
