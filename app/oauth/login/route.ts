import { NextResponse } from 'next/server'

import {
  OAUTH_SCOPE,
  PUBLIC_URL,
  getOAuthClient,
} from '@/lib/atproto/oauth-client'

export async function POST(request: Request) {
  const form = await request.formData()
  const handle = String(form.get('handle') ?? '')
    .trim()
    .replace(/^@/, '')
  if (!handle) return NextResponse.redirect(new URL('/', PUBLIC_URL), 303)

  try {
    const client = await getOAuthClient()
    const url = await client.authorize(handle, { scope: OAUTH_SCOPE })
    return NextResponse.redirect(url, 303)
  } catch (err) {
    console.error('oauth authorize failed', err)
    return NextResponse.redirect(new URL('/?error=login', PUBLIC_URL), 303)
  }
}
