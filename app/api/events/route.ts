import { listEvents } from '@/lib/atproto/events'
import { resolveDid } from '@/lib/atproto/identity'

/** GET /api/events?actor=<handle or DID>: events published by that account */
export async function GET(request: Request) {
  const actor = new URL(request.url).searchParams
    .get('actor')
    ?.trim()
    .replace(/^@/, '')
  if (!actor)
    return Response.json({ error: 'actor is required' }, { status: 400 })

  try {
    const did = await resolveDid(actor)
    const events = await listEvents(did)
    return Response.json(
      { did, events },
      { headers: { 'Cache-Control': 'public, s-maxage=60' } }
    )
  } catch {
    return Response.json({ error: 'Could not load events' }, { status: 404 })
  }
}
