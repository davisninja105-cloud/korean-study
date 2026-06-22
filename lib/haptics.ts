export type HapticStyle = 'selection' | 'success' | 'impact-light' | 'impact-heavy'

const PATTERNS: Record<HapticStyle, number | number[]> = {
  'selection':    10,
  'success':      [10, 50, 20],
  'impact-light': 15,
  'impact-heavy': 30,
}

export function haptic(style: HapticStyle): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  navigator.vibrate(PATTERNS[style])
}
