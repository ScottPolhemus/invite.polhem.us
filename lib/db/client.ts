import 'server-only'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

// Reuse the pool across dev HMR reloads and warm serverless invocations
const globalForDb = globalThis as unknown as { pgPool?: Pool }

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      'postgres://invite:invite@localhost:5432/invite',
    max: 5,
  })

globalForDb.pgPool = pool

export const db = drizzle(pool, { schema })
export { pool }
