import 'server-only'

import { eq, lt } from 'drizzle-orm'
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
  RuntimeLock,
} from '@atproto/oauth-client-node'

import { db, pool } from '@/lib/db/client'
import { oauthSession, oauthState } from '@/lib/db/schema'

const STATE_TTL_MS = 10 * 60 * 1000

export const stateStore: NodeSavedStateStore = {
  async get(key) {
    const [row] = await db
      .select()
      .from(oauthState)
      .where(eq(oauthState.key, key))
    return row ? (row.value as NodeSavedState) : undefined
  },
  async set(key, value) {
    const expiresAt = new Date(Date.now() + STATE_TTL_MS)
    await db
      .insert(oauthState)
      .values({ key, value, expiresAt })
      .onConflictDoUpdate({ target: oauthState.key, set: { value, expiresAt } })
    await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()))
  },
  async del(key) {
    await db.delete(oauthState).where(eq(oauthState.key, key))
  },
}

export const sessionStore: NodeSavedSessionStore = {
  async get(sub) {
    const [row] = await db
      .select()
      .from(oauthSession)
      .where(eq(oauthSession.sub, sub))
    return row ? (row.value as NodeSavedSession) : undefined
  },
  async set(sub, value) {
    await db
      .insert(oauthSession)
      .values({ sub, value })
      .onConflictDoUpdate({
        target: oauthSession.sub,
        set: { value, updatedAt: new Date() },
      })
  },
  async del(sub) {
    await db.delete(oauthSession).where(eq(oauthSession.sub, sub))
  },
}

// Cross-instance lock so concurrent invocations don't refresh the same token twice
export const requestLock: RuntimeLock = async (name, fn) => {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [name])
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [name])
    }
  } finally {
    client.release()
  }
}
