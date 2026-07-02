/**
 * Pure helper — produce a short, searchable excerpt of a lesson body so sync
 * failures can name the specific lesson the user can find in their Google Doc.
 * Returns the first non-empty line, whitespace-collapsed, truncated to ~48
 * chars with a trailing `…`; falls back to `(untitled lesson)` when there's
 * no usable text. The excerpt is the user's OWN doc content (intentionally
 * surfaced back to them — see threat T-14-02; raw error text never leaks).
 */
export function lessonExcerpt(text: string): string {
  const firstLine = text
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .find((l) => l.length > 0)
  if (!firstLine) return '(untitled lesson)'
  const MAX = 48
  return firstLine.length > MAX ? `${firstLine.slice(0, MAX)}…` : firstLine
}
