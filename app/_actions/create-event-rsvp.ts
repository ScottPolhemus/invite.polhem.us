'use server'

import { AtUri } from '@atproto/syntax'
import { refresh, updateTag } from 'next/cache'

import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'
import { CREATED_WITH, RSVP } from '@/lib/atproto/records'
import {
  findMyRsvp,
  RSVP_STATUSES,
  strongRef,
  syncRsvp,
} from '@/lib/atproto/rsvps'
import { getClient } from '@/lib/atproto/session'

/**
 * RSVP to an event, optionally in response to an invitation. Updates the
 * user's existing RSVP for the event instead of creating a duplicate.
 */
export async function createEventRsvp(formData: FormData) {
  const status = String(formData.get('status'))
  const subject = strongRef(
    String(formData.get('eventUri')),
    String(formData.get('eventCid'))
  )
  const invitationUri = formData.get('invitationUri')
  const invitationCid = formData.get('invitationCid')
  const invitation =
    invitationUri && invitationCid
      ? strongRef(String(invitationUri), String(invitationCid))
      : undefined
  if (!RSVP_STATUSES.includes(status as (typeof RSVP_STATUSES)[number])) return

  const client = await getClient()
  if (!client?.did) return
  const existing = await findMyRsvp(client, subject.uri)
  const rsvpStatus = `${RSVP}#${status}`

  if (existing) {
    // Update in place; keep a previously linked invitation unless a new one is given
    const { $type, ...rest } = existing.value
    void $type
    const updated = {
      ...rest,
      subject,
      invitation: invitation ?? rest.invitation,
      status: rsvpStatus,
    }
    const res = await client.put(rsvp, updated, {
      rkey: new AtUri(existing.uri).rkey,
    })
    // Write-through, so it's stored before ingest catches up (only if it answers an invitation)
    await syncRsvp(res.uri, res.cid, { $type: RSVP, ...updated })
    updateTag(`rsvp-response:${client.did}:${subject.uri}`)
    refresh()
    return
  }

  // A variable, not an inline literal: createdWith isn't in the RSVP lexicon.
  // Only a new RSVP gets it; the update path above keeps what the record has.
  const value = {
    subject,
    invitation,
    status: rsvpStatus,
    createdWith: CREATED_WITH,
  }
  const res = await client.create(rsvp, value)
  await syncRsvp(res.uri, res.cid, { $type: RSVP, ...value })
  updateTag(`rsvp-response:${client.did}:${subject.uri}`)
  refresh()
}
