/**
 * Warm copy strings — the voice of the app at emotional moments.
 * Pure functions; no side-effects; safe in both server and client contexts.
 */

// ── Comeback after a missed day (streak bridged by a freeze) ─────────────

/**
 * Returns a warm message acknowledging the user's return after a missed day.
 * Show when the current streak was preserved by a freeze token.
 */
export function comebackMessage(currentStreak: number): string {
  if (currentStreak >= 30) return `Welcome back — your ${currentStreak}-day streak is safe. That's remarkable consistency.`
  if (currentStreak >= 7)  return `Welcome back — your ${currentStreak}-day streak is safe. Keep it going!`
  return `Welcome back — your streak is safe. Today's session counts.`
}

// ── Band-up moment (CEFR level increase) ─────────────────────────────────

/**
 * Returns a congratulations message when the learner advances to a new CEFR band.
 * `newBand`: the band they just reached (e.g. 'B1').
 * `masteredCount`: total mastered cards at the moment of the upgrade.
 */
export function bandUpMessage(newBand: string, masteredCount: number): string {
  const messages: Record<string, string> = {
    A2: `You've reached A2 — Elementary Korean. The words are sticking.`,
    B1: `You've reached B1 — Intermediate Korean. Real conversations are getting closer.`,
    B2: `You've reached B2 — Upper Intermediate. You can handle most everyday topics now.`,
    C1: `You've reached C1 — Advanced Korean. That's years of commitment paying off.`,
    'C1+': `C1+ — Proficient. You've built something extraordinary.`,
  }
  return messages[newBand] ?? `You've reached ${newBand}! ${masteredCount} mastered cards — remarkable progress.`
}

// ── Session complete ──────────────────────────────────────────────────────

/** Message shown at the end of a study session. Varies by cards reviewed. */
export function sessionCompleteMessage(reviewed: number, correct: number): string {
  const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0
  if (pct >= 90 && reviewed >= 10) return `Excellent session — ${reviewed} cards, ${pct}% correct. Your memory is sharp today.`
  if (pct >= 75) return `Good session — ${reviewed} cards reviewed. Steady progress.`
  if (reviewed >= 20) return `Big session — ${reviewed} cards. Every review builds the foundation.`
  return `${reviewed} card${reviewed !== 1 ? 's' : ''} reviewed. Small sessions add up.`
}

// ── Milestone & long-game messages ───────────────────────────────────────

/** Message shown at the 100-day milestone. */
export function hundredDayMessage(totalReviews: number): string {
  return `100 days of Korean. You've done ${totalReviews.toLocaleString()} reviews. That's not a hobby anymore — it's a practice.`
}

/** At-risk nudge (streak in danger but not yet broken). */
export function atRiskMessage(streak: number): string {
  if (streak >= 30) return `Keep your ${streak}-day streak — study today`
  if (streak >= 7)  return `Keep your ${streak}-day streak — just a few minutes counts`
  return `Study today to keep your streak`
}
