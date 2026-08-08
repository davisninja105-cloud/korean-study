import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import {
  QUERY_COUNTER_ENV,
  countingLibsqlClient,
  notePrismaQueryEvent,
} from '@/lib/query-counter'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
  // authToken is required for hosted Turso (libsql://…); omitted for local file DBs.
  const authToken = process.env.DATABASE_AUTH_TOKEN

  // STUDY_QUERY_COUNTER instrumentation branch (see lib/query-counter.ts's
  // header for the counting definition). Taken ONLY when the env var is
  // exactly '1' — the default path below is byte-equivalent to before this
  // branch was added, so production construction is unaffected.
  if (process.env[QUERY_COUNTER_ENV] === '1') {
    // PrismaLibSql's constructor only accepts a config object (url/authToken)
    // — it does NOT accept a pre-built @libsql/client instance (verified:
    // node_modules/@prisma/adapter-libsql/dist/index-node.d.ts's
    // `constructor(config: Config, options?: PrismaLibSqlOptions)`). The
    // earliest interceptable point is therefore the `createClient(config)`
    // instance method that `connect()` calls internally — overriding it in a
    // thin subclass lets the counting Proxy wrap the client BEFORE
    // PrismaLibSqlAdapter ever receives it. This is the plan's documented
    // fallback mechanism (Task 1: "if PrismaLibSql does not accept a
    // pre-built client instance... wrap at the earliest interceptable
    // point... record which mechanism was used") — also recorded in
    // 32-BASELINE.md.
    class CountingPrismaLibSql extends PrismaLibSql {
      override createClient(config: Parameters<PrismaLibSql['createClient']>[0]) {
        return countingLibsqlClient(super.createClient(config))
      }
    }
    const adapter = new CountingPrismaLibSql({ url, authToken })
    const client = new PrismaClient({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    })
    client.$on('query', () => notePrismaQueryEvent())
    return client
  }

  const adapter = new PrismaLibSql({ url, authToken })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
