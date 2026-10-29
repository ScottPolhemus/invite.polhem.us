'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import { mergeEvent, readEventInput } from '@/lib/atproto/events'
import { getClient } from '@/lib/atproto/session'

/**
 * Edit one of the signed-in user's own events in place (same record key, so
 * every link, invitation and RSVP that points at it keeps working). Any field
 * can change; fields the form doesn't model are carried over by mergeEvent.
 */
export async function updateEvent(formData: FormData) {
  const rkey = String(formData.get('rkey') ?? '')
  const client = await getClient()
  if (!client?.did) redirect('/')

  const did = client.did
  const editPath = `/event/${did}/${rkey}/edit`

  const input = readEventInput(formData)
  if ('error' in input) redirect(`${editPath}?error=${input.error}`)

  // Read through the typed client so the whole record round-trips. It only
  // reads the user's own repo, so this can't touch anyone else's event.
  const existing = await client.get(event, { rkey }).catch(() => null)
  if (!existing) redirect(`${editPath}?error=missing`)

  const res = await client.put(event, mergeEvent(existing.value, input), {
    rkey,
  })
  // Expire the cached event page (events aren't stored in the database)
  updateTag(`record:${res.uri}`)

  redirect(`/event/${did}/${rkey}`)
}
