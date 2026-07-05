// No 'use client' — this module runs server-side and is pure (safe to import in tests).

/**
 * Pure helper — single source of truth for detecting a SQLite UNIQUE-constraint
 * violation on a specific column, when Prisma's own P2002 classification
 * doesn't apply or doesn't carry enough detail to check.
 *
 * WHY this exists (TWO real shapes, same underlying SQLite UNIQUE violation):
 *
 * 1. With Prisma 7 + `@prisma/adapter-libsql`, a SQLite UNIQUE-constraint
 *    violation thrown INSIDE an interactive `prisma.$transaction(async (tx)
 *    => {...})` callback surfaces as a raw, unclassified `DriverAdapterError`
 *    (`cause.kind: 'sqlite'`), NOT a `Prisma.PrismaClientKnownRequestError`
 *    with `code: 'P2002'`. The array-form `prisma.$transaction([...])`
 *    pattern does not have this problem — only the interactive/callback form
 *    does. See the full diagnosis at
 *    `.planning/debug/reviewlog-p2002-catch-never-fires.md`.
 * 2. The SAME violation can ALSO surface as a classified
 *    `PrismaClientKnownRequestError`/P2002 whose `meta.target` is undefined
 *    (only `meta.modelName` and `meta.driverAdapterError` are populated) —
 *    so the caller's own `e.meta?.target?.includes(column)` check never
 *    fires either. The informative constraint text instead lives at
 *    `e.meta.driverAdapterError.cause.originalMessage` (or, in a related
 *    variant, `e.meta.driverAdapterError.message`). See
 *    `.planning/phases/17-reviewlog-schema-idempotent-write-path/17-VERIFICATION.md`.
 *
 * WHAT it matches: a BOUNDED breadth-first traversal starting at `error`
 * itself (capped at MAX_NODES visited nodes total, to stay cyclic-safe
 * without unbounded recursion). At each visited node it collects candidate
 * strings from BOTH a `message` field AND an `originalMessage` field, and
 * advances to further nodes via BOTH `node.cause` AND
 * `node.meta.driverAdapterError` (whichever are non-null objects). Returns
 * true iff ANY collected string contains BOTH the substring "UNIQUE
 * constraint failed" AND the given `column` name.
 *
 * Guarantee: matching requires the literal column name to appear in a
 * collected string, so unrelated UNIQUE-constraint violations (a different
 * column — including one surfaced under the same meta.driverAdapterError
 * path) and unrelated errors entirely (busy/locked, generic) are never
 * swallowed as false idempotent-success — they still return false here and
 * fall through to the caller's generic error handling.
 *
 * Single call site: app/api/review/route.ts (the idempotent-200 catch
 * branch, OR-ed with the existing P2002 check for forward-compatibility).
 *
 * No imports, no Prisma, no Node builtins — pure and unit-testable in
 * isolation, matching the purity convention of lib/card-key.ts / lib/known-words.ts.
 */

const MAX_NODES = 10

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function collectStrings(node: Record<string, unknown>): string[] {
  const strings: string[] = []
  if (typeof node.message === 'string') strings.push(node.message)
  if (typeof node.originalMessage === 'string') strings.push(node.originalMessage)
  return strings
}

function nextNodes(node: Record<string, unknown>): unknown[] {
  const next: unknown[] = []
  if ('cause' in node) next.push(node.cause)
  if (isPlainObject(node.meta) && 'driverAdapterError' in node.meta) {
    next.push((node.meta as Record<string, unknown>).driverAdapterError)
  }
  return next
}

export function isUniqueConstraintError(error: unknown, column: string): boolean {
  const queue: unknown[] = [error]
  let visited = 0

  while (queue.length > 0 && visited < MAX_NODES) {
    const node = queue.shift()
    visited++
    if (!isPlainObject(node)) continue

    for (const message of collectStrings(node)) {
      if (message.includes('UNIQUE constraint failed') && message.includes(column)) {
        return true
      }
    }

    for (const next of nextNodes(node)) {
      if (isPlainObject(next)) queue.push(next)
    }
  }

  return false
}
