import { NextResponse } from 'next/server'

import { PUBLIC_URL, getOAuthClient } from '@/lib/atproto/oauth-client'
import {
  clearSessionCookie,
  getSessionDid,
  safeRedirectPath,
} from '@/lib/atproto/session'

export async function POST(request: Request) {
  const next = safeRedirectPath((await request.formData()).get('next'))
  const did = await getSessionDid()
  if (did) {
    try {
      const client = await getOAuthClient()
      await client.revoke(did)
    } catch (err) {
      console.error('oauth revoke failed', err)
    }
  }
  await clearSessionCookie()
  return NextResponse.redirect(new URL(next ?? '/', PUBLIC_URL), 303)
}
