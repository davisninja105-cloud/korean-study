import { FSRS, Rating, State, createEmptyCard, type Card as FSRSCard, type Grade } from 'ts-fsrs'

const fsrs = new FSRS({})

export { Rating, State, type Grade }

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
