import { getOAuthClient } from '@/lib/atproto/oauth-client'

export async function GET() {
  const client = await getOAuthClient()
  return Response.json(client.jwks)
}
