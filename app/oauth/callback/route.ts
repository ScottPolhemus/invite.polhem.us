import { NextResponse } from 'next/server'

import { PUBLIC_URL, getOAuthClient } from '@/lib/atproto/oauth-client'
import { backfill } from '@/lib/atproto/backfill'
import { setSessionCookie } from '@/lib/atproto/session'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  try {
    const client = await getOAuthClient()
    const { session } = await client.callback(params)
    await setSessionCookie(session.did)
    await backfill(session.did).catch((err) =>
      console.error('backfill failed', err)
    )
  } catch (err) {
    console.error('oauth callback failed', err)
    return NextResponse.redirect(new URL('/?error=login', PUBLIC_URL), 303)
  }
  return NextResponse.redirect(new URL('/', PUBLIC_URL), 303)
}
