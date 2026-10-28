import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client, Pool } from 'pg'

const ADMIN_URL = 'postgres://invite:invite@localhost:5432/invite'
const TEST_URL = 'postgres://invite:invite@localhost:5432/invite_test'

/** Make sure a separate test database exists and has the current schema (the dev database is never touched) */
export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL })
  try {
    await admin.connect()
  } catch (err) {
    throw new Error(
      `Can't reach Postgres at localhost:5432 for the specs. Start it with \`yarn db:up\`. (${err})`
    )
  }
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'invite_test'"
  )
  if (exists.rowCount === 0) await admin.query('CREATE DATABASE invite_test')
  await admin.end()

  const pool = new Pool({ connectionString: TEST_URL })
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  await pool.end()
}
