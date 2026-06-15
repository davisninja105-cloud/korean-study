import { FSRS, Rating, State, createEmptyCard, type Card as FSRSCard, type Grade } from 'ts-fsrs'

const fsrs = new FSRS({})

export { Rating, State, type Grade }

// Partial review shape as returned by the JSON API (dates are strings).
type PartialReview = {
  state?: number | null
  stability?: number | null
  difficulty?: number | null
  elapsedDays?: number | null
  scheduledDays?: number | null
  reps?: number | null
  lapses?: number | null
  nextReview?: Date | string | null
  lastReview?: Date | string | null
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  return v instanceof Date ? v : new Date(v)
}

function formatInterval(due: Date, now: Date): string {
  const diffMin = Math.round((due.getTime() - now.getTime()) / 60000)
  if (diffMin < 2) return '<1m'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDays = Math.round(diffHr / 24)
  return `${diffDays}d`
}

// Returns human-readable next-interval labels for grades 1–4 (Again/Hard/Good/Easy).
// Must be called from event handlers, not during render (calls new Date()).
export function previewIntervals(review: PartialReview | null | undefined): [string, string, string, string] {
  const now = new Date()
  const lastReview = review ? toDate(review.lastReview) : null

  let card: FSRSCard
  if (lastReview) {
    const template = createEmptyCard(now)
    card = {
      ...template,
      state: ((review!.state ?? 0) as State),
      stability: review!.stability ?? 0,
      difficulty: review!.difficulty ?? 0,
      elapsed_days: review!.elapsedDays ?? 0,
      scheduled_days: review!.scheduledDays ?? 0,
      reps: review!.reps ?? 0,
      lapses: review!.lapses ?? 0,
      due: toDate(review!.nextReview) ?? now,
      last_review: lastReview,
    }
  } else {
    card = createEmptyCard(now)
  }

  const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]
  return grades.map((grade) => {
    const result = fsrs.next(card, now, grade)
    return formatInterval(result.card.due, now)
  }) as [string, string, string, string]
}

interface CardReviewFields {
  state: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  nextReview: Date
  lastReview: Date | null
}

export function reviewCard(review: CardReviewFields, rating: Grade) {
  const now = new Date()

  let card: FSRSCard

  if (review.lastReview) {
    // Reconstruct ts-fsrs Card from our DB fields
    const template = createEmptyCard(now)
    card = {
      ...template,
      state: review.state as State,
      stability: review.stability,
      difficulty: review.difficulty,
      elapsed_days: review.elapsedDays,
      scheduled_days: review.scheduledDays,
      reps: review.reps,
      lapses: review.lapses,
      due: review.nextReview,
      last_review: review.lastReview,
    }
  } else {
    card = createEmptyCard(now)
  }

  const result = fsrs.next(card, now, rating)

  return {
    state: result.card.state as number,
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
    reps: result.card.reps,
    lapses: result.card.lapses,
    nextReview: result.card.due,
    lastReview: now,
  }
}
