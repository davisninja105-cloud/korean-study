/**
 * Single source of truth for card-type → badge styling.
 *
 * The taxonomy is recolored off the primary action color (blue) per the design
 * audit: vocabulary → indigo, grammar → violet, phrase → teal. Blue is reserved
 * strictly for actions. Text uses the 700 step on light and 300 on dark so the
 * small bold badge label stays AA-contrast in both themes (the raw --cat-* token
 * fails AA as small text on light surfaces).
 *
 * Used by: app/cards/page.tsx, components/StudySession.tsx.
 * Returns only color classes; call sites add layout (rounded-full, padding, etc.).
 */
export const TYPE_BADGE_CLASS: Record<string, string> = {
  vocabulary:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  grammar:            'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  phrase:             'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'example-sentence': 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'fill-blank':       'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  transformation:     'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
}

export const TYPE_BADGE_DEFAULT =
  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'

export function typeBadgeClass(type: string): string {
  return TYPE_BADGE_CLASS[type] ?? TYPE_BADGE_DEFAULT
}
