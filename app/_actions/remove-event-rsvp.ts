'use server'

import { AtUri } from '@atproto/syntax'
import { refresh, updateTag } from 'next/cache'

import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'
import { findMyRsvp } from '@/lib/atproto/rsvp'
import { deleteRecord } from '@/lib/atproto/records'
import { getClient } from '@/lib/atproto/session'

export async function removeEventRsvp(formData: FormData) {
  const eventUri = String(formData.get('eventUri'))
  const client = await getClient()
  if (!client?.did) return

  const existing = await findMyRsvp(client, eventUri)
  if (!existing) return
  await client.delete(rsvp, { rkey: new AtUri(existing.uri).rkey })
  await deleteRecord(existing.uri)
  updateTag(`rsvp-response:${client.did}:${eventUri}`)
  refresh()
}
