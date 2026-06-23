/**
 * Curated complementary color pairings for the app's two accent colors:
 *   action  — primary buttons, links, nav active state (cool hue)
 *   reward  — streaks, goal ring, due count, celebrations (warm hue)
 *
 * Each pairing is designed so the action (cool) and reward (warm) are
 * complementary, preventing accidental clashes when both are user-chosen.
 */

export const DEFAULT_ACTION_COLOR = '#3b82f6'  // blue-500
export const DEFAULT_REWARD_COLOR = '#f97316'  // orange-500

export interface Palette {
  id: string
  name: string
  action: string  // hex, action/button accent (cool)
  reward: string  // hex, reward/streak accent (warm)
}

export const PALETTES: Palette[] = [
  { id: 'classic',  name: 'Classic',  action: '#3b82f6', reward: '#f97316' },  // blue  / orange
  { id: 'lagoon',   name: 'Lagoon',   action: '#14b8a6', reward: '#fb7185' },  // teal  / rose
  { id: 'orchid',   name: 'Orchid',   action: '#8b5cf6', reward: '#ec4899' },  // violet/ pink
  { id: 'forest',   name: 'Forest',   action: '#10b981', reward: '#f59e0b' },  // emerald/amber
  { id: 'midnight', name: 'Midnight', action: '#6366f1', reward: '#eab308' },  // indigo/ gold
  { id: 'tide',     name: 'Tide',     action: '#0ea5e9', reward: '#f43f5e' },  // sky   / rose-red
]

/**
 * Returns the palette id whose action + reward both match the given hex values
 * (case-insensitive). Returns null when no preset matches (= "Custom").
 */
export function findActivePaletteId(action: string, reward: string): string | null {
  const a = action.toLowerCase()
  const r = reward.toLowerCase()
  return PALETTES.find((p) => p.action === a && p.reward === r)?.id ?? null
}
