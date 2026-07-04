// No 'use client' — this module runs server-side and is pure (safe to import in tests).

/**
 * Pure helper — single source of truth for detecting a SQLite UNIQUE-constraint
 * violation on a specific column, when Prisma's own P2002 classification
 * doesn't apply.
 *
 * WHY this exists: with Prisma 7 + `@prisma/adapter-libsql`, a SQLite
 * UNIQUE-constraint violation thrown INSIDE an interactive
 * `prisma.$transaction(async (tx) => {...})` callback surfaces as a raw,
 * unclassified `DriverAdapterError` (`cause.kind: 'sqlite'`), NOT a
 * `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'`. The array-form
 * `prisma.$transaction([...])` pattern does not have this problem — only the
 * interactive/callback form does. See the full diagnosis at
 * `.planning/debug/reviewlog-p2002-catch-never-fires.md`.
 *
 * WHAT it matches: walks the error's `.cause` chain (starting at `error`
 * itself, bounded to 5 levels to avoid unbounded recursion / cyclic causes)
 * collecting every string `.message` found along the way. Returns true iff
 * ANY collected message contains BOTH the substring "UNIQUE constraint
 * failed" AND the given `column` name.
 *
 * Guarantee: matching requires the literal column name to appear in the
 * message, so unrelated UNIQUE-constraint violations (a different column)
 * and unrelated errors entirely (busy/locked, generic) are never swallowed
 * as false idempotent-success — they still return false here and fall
 * through to the caller's generic error handling.
 *
 * Single call site: app/api/review/route.ts (the idempotent-200 catch
 * branch, OR-ed with the existing P2002 check for forward-compatibility).
 *
 * No imports, no Prisma, no Node builtins — pure and unit-testable in
 * isolation, matching the purity convention of lib/card-key.ts / lib/known-words.ts.
 */

const MAX_CAUSE_DEPTH = 5

export function isUniqueConstraintError(error: unknown, column: string): boolean {
  let node: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (node === null || typeof node !== 'object') {
      break
    }
    if ('message' in node && typeof (node as { message: unknown }).message === 'string') {
      const message = (node as { message: string }).message
      if (message.includes('UNIQUE constraint failed') && message.includes(column)) {
        return true
      }
    }
    node = 'cause' in node ? (node as { cause: unknown }).cause : undefined
  }
  return false
}
