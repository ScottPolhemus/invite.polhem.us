import { expect } from 'vitest'

import { setSessionCookie } from '@/lib/atproto/session'

import { world } from './world'

/** Sign in the way a completed OAuth login leaves things: a session cookie and a restorable OAuth session */
export async function signIn(did: string) {
  world.oauthSessions.add(did)
  await setSessionCookie(did)
}

/** A cookie with no restorable session behind it, as when the sign-in has expired or been revoked */
export async function signInWithExpiredSession(did: string) {
  await setSessionCookie(did)
}

export function form(fields: Record<string, string | undefined>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields))
    if (value !== undefined) data.set(key, value)
  return data
}

/** Run something that should redirect, and return where to */
export async function redirectOf(run: () => Promise<unknown> | unknown) {
  try {
    await run()
  } catch (err) {
    const digest = (err as { digest?: string }).digest
    const match = digest?.match(/^NEXT_REDIRECT;[^;]*;(.*);\d+;?$/)
    if (match) return match[1]
    throw err
  }
  throw new Error('expected a redirect, but none happened')
}

export async function expectNotFound(run: () => Promise<unknown> | unknown) {
  await expect(Promise.resolve().then(run)).rejects.toMatchObject({
    digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
  })
}
