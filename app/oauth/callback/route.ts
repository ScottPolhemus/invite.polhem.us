import { NextResponse } from 'next/server'

import { PUBLIC_URL, getOAuthClient } from '@/lib/atproto/oauth-client'
import { backfill } from '@/lib/atproto/backfill'
import { safeRedirectPath } from '@/lib/atproto/redirect'
import { setSessionCookie } from '@/lib/atproto/session'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  let next: string | undefined
  try {
    const client = await getOAuthClient()
    const { session, state } = await client.callback(params)
    next = safeRedirectPath(state)
    await setSessionCookie(session.did)
    await backfill(session.did).catch((err) =>
      console.error('backfill failed', err)
    )
  } catch (err) {
    console.error('oauth callback failed', err)
    return NextResponse.redirect(new URL('/?error=login', PUBLIC_URL), 303)
  }
  return NextResponse.redirect(new URL(next ?? '/', PUBLIC_URL), 303)
}
