import { revalidateTag } from 'next/cache'

import { runIngestCycle } from '@/lib/atproto/sync'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { events, changed } = await runIngestCycle()
  for (const uri of changed) revalidateTag(`record:${uri}`, 'max')
  return Response.json({ events, changed: changed.length })
}
