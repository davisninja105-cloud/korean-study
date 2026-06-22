/**
 * Manual theme toggle helper (client-only). The actual paint is driven by the
 * `data-theme` attribute on <html> (see the pre-paint script in app/layout.tsx
 * and the [data-theme] selectors + `dark` custom variant in app/globals.css).
 *
 * Preference is stored in localStorage (client-only, instant, survives reloads).
 * 'system' is represented by the absence of the key so it tracks the OS.
 */
export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

/** Resolve a choice to the concrete value to paint. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return theme
}

/** Persist the choice and apply it to <html data-theme>. */
export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  if (theme === 'system') window.localStorage.removeItem(STORAGE_KEY)
  else window.localStorage.setItem(STORAGE_KEY, theme)
  document.documentElement.setAttribute('data-theme', resolveTheme(theme))
}
