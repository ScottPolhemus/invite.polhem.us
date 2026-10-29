import { NextResponse } from 'next/server'

import {
  OAUTH_SCOPE,
  PUBLIC_URL,
  getOAuthClient,
} from '@/lib/atproto/oauth-client'
import { safeRedirectPath } from '@/lib/atproto/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const handle = String(form.get('handle') ?? '')
    .trim()
    .replace(/^@/, '')
  // Where to land after signing in; carried through OAuth as the state value
  const next = safeRedirectPath(form.get('next'))
  if (!handle)
    return NextResponse.redirect(new URL(next ?? '/', PUBLIC_URL), 303)

  try {
    const client = await getOAuthClient()
    const url = await client.authorize(handle, {
      scope: OAUTH_SCOPE,
      state: next,
    })
    return NextResponse.redirect(url, 303)
  } catch (err) {
    console.error('oauth authorize failed', err)
    return NextResponse.redirect(new URL('/?error=login', PUBLIC_URL), 303)
  }
}
