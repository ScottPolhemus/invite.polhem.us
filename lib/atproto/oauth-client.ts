import 'server-only'

import {
  JoseKey,
  NodeOAuthClient,
  OAuthClientMetadataInput,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
  type NodeSavedStateStore,
  type RuntimeLock,
} from '@atproto/oauth-client-node'
import { eq, lt } from 'drizzle-orm'

import { db, pool } from '@/lib/db/client'
import { oauthSession, oauthState } from '@/lib/db/schema'

import { COLLECTIONS } from './records'

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

// Cross-instance lock so concurrent invocations don't refresh the same token
// twice. Transaction-scoped, so it also works through a transaction-mode
// connection pooler (such as Neon's): the lock and its release can't land on
// different server connections, and it's released however the work ends.
export const requestLock: RuntimeLock = async (name, fn) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [name])
    try {
      return await fn()
    } finally {
      await client.query('COMMIT')
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export const PUBLIC_URL = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'

export const OAUTH_SCOPE = [
  'atproto',
  ...COLLECTIONS.map((c) => `repo:${c}`),
].join(' ')

const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(
  PUBLIC_URL
)

const globalForOAuth = globalThis as unknown as {
  oauthClient?: Promise<NodeOAuthClient>
}

async function createClient() {
  const redirectUri = `${PUBLIC_URL}/oauth/callback`
  const baseMetadata: Pick<
    OAuthClientMetadataInput,
    | 'client_name'
    | 'redirect_uris'
    | 'scope'
    | 'grant_types'
    | 'response_types'
    | 'application_type'
    | 'dpop_bound_access_tokens'
  > = {
    client_name: 'Polhem.us Invite',
    redirect_uris: [redirectUri],
    scope: OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    dpop_bound_access_tokens: true,
  }

  if (isLoopback) {
    // Public loopback client: client metadata is encoded in the client_id
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      scope: OAUTH_SCOPE,
    })
    return new NodeOAuthClient({
      clientMetadata: {
        ...baseMetadata,
        client_id: `http://localhost?${params}`,
        token_endpoint_auth_method: 'none',
      },
      stateStore,
      sessionStore,
      requestLock,
    })
  }

  const privateJwk = process.env.OAUTH_PRIVATE_JWK
  if (!privateJwk)
    throw new Error('OAUTH_PRIVATE_JWK is required in production')

  return new NodeOAuthClient({
    clientMetadata: {
      ...baseMetadata,
      client_id: `${PUBLIC_URL}/oauth/client-metadata.json`,
      client_uri: PUBLIC_URL,
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      jwks_uri: `${PUBLIC_URL}/oauth/jwks.json`,
    },
    keyset: [await JoseKey.fromImportable(privateJwk, 'key-1')],
    stateStore,
    sessionStore,
    requestLock,
  })
}

export function getOAuthClient() {
  return (globalForOAuth.oauthClient ??= createClient())
}
