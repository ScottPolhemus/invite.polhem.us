import { removeEventRsvp } from '@/app/_actions/remove-event-rsvp'
import { getClient } from '@/lib/atproto/session'
import { findMyRsvp } from '@/lib/atproto/rsvp'

import AuthStatus from './auth-status'
import RsvpModal from './rsvp-modal'

export default async function RsvpControl({
  eventUri,
  eventCid,
}: {
  eventUri: string
  eventCid: string
}) {
  const client = await getClient()
  if (!client?.did) return <AuthStatus />

  const existing = await findMyRsvp(client, eventUri)
  if (!existing) return <RsvpModal eventUri={eventUri} eventCid={eventCid} />

  return (
    <div className="flex">
      <RsvpModal
        eventUri={eventUri}
        eventCid={eventCid}
        currentStatus={existing.value.status.split('#')[1]}
      />
      <form action={removeEventRsvp}>
        <input type="hidden" name="eventUri" value={eventUri} />
        <button className="rounded-full border px-4 py-2">
          Remove your RSVP
        </button>
      </form>
    </div>
  )
}
