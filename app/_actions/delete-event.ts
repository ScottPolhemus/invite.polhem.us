'use server'

import { AtUri } from '@atproto/syntax'
import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import { EVENT } from '@/lib/atproto/collections'
import { safeRedirectPath } from '@/lib/atproto/redirect'
import { getClient } from '@/lib/atproto/session'

/** Delete one of the signed-in user's own events; the client only ever writes to their own repo */
export async function deleteEvent(formData: FormData) {
  const rkey = String(formData.get('rkey') ?? '')
  const client = await getClient()
  if (!client?.did) return

  const uri = AtUri.make(client.did, EVENT, rkey).toString()
  await client.delete(event, { rkey })
  updateTag(`record:${uri}`)

  const next = safeRedirectPath(formData.get('next'))
  if (next) redirect(next)
  refresh()
}
