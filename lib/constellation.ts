import 'server-only'

import { RSVP } from '@/lib/atproto/collections'

const BASE =
  process.env.CONSTELLATION_URL ?? 'https://constellation.microcosm.blue'

type LinksPage = {
  linking_records: { did: string; collection: string; rkey: string }[]
  cursor: string | null
}

/** AT URIs of every RSVP record whose `subject.uri` is this event */
export async function listRsvpUris(eventUri: string) {
  const uris: string[] = []
  let cursor: string | null = null
  do {
    const params = new URLSearchParams({
      target: eventUri,
      collection: RSVP,
      path: '.subject.uri',
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${BASE}/links?${params}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Constellation /links failed: ${res.status}`)
    const page = (await res.json()) as LinksPage
    for (const r of page.linking_records)
      uris.push(`at://${r.did}/${r.collection}/${r.rkey}`)
    cursor = page.cursor
  } while (cursor)
  return uris
}
