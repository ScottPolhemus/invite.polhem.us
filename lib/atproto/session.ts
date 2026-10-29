import 'server-only'

import { Client } from '@atproto/lex'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

import { getOAuthClient, PUBLIC_URL } from './oauth-client'

const COOKIE = 'session'
const MAX_AGE = 60 * 60 * 24 * 30

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return Buffer.from(secret, 'base64').subarray(0, 32)
}

export async function setSessionCookie(did: string) {
  const token = await new EncryptJWT({ did })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(key())
  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(COOKIE)
}

export async function getSessionDid(): Promise<string | null> {
  // Token expiry compares against the current time, so this is request-time work
  await connection()
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtDecrypt(token, key())
    return typeof payload.did === 'string' ? payload.did : null
  } catch {
    return null
  }
}

/** Authenticated client that writes to the signed-in user's PDS */
export async function getClient(): Promise<Client | null> {
  const did = await getSessionDid()
  if (!did) return null
  try {
    const client = await getOAuthClient()
    return new Client(await client.restore(did))
  } catch {
    return null
  }
}

/**
 * A same-origin path (with query) that's safe to send a user back to after
 * signing in or out; anything else, including other origins and
 * protocol-relative or backslash tricks, is rejected.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  try {
    const base = new URL(PUBLIC_URL)
    const url = new URL(value, base)
    return url.origin === base.origin ? url.pathname + url.search : undefined
  } catch {
    return undefined
  }
}
