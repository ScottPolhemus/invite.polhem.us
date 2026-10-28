import { createEventRsvp } from '@/app/_actions/create-event-rsvp'
import { removeEventRsvp } from '@/app/_actions/remove-event-rsvp'
import type { RsvpStatus } from '@/lib/atproto/rsvp'

const RESPONSES = [
  ['going', 'Going'],
  ['interested', 'Interested'],
  ['notgoing', 'Not going'],
] as const

/**
 * The response buttons for an event, shared by event pages and invitation
 * pages. The current response is filled and checked (and marked `aria-pressed`)
 * so it stands apart from the others, and once there is one it can be removed.
 * `invitation` is set on an invitation page, so the RSVP records which
 * invitation it answers; an event page leaves it out.
 */
export default function RsvpButtons({
  event,
  invitation,
  current,
}: {
  event: { uri: string; cid: string }
  invitation?: { uri: string; cid: string }
  current: RsvpStatus | null
}) {
  return (
    <div className="mx-4 flex flex-col gap-2">
      <form action={createEventRsvp} className="flex flex-wrap gap-2">
        {invitation && (
          <>
            <input type="hidden" name="invitationUri" value={invitation.uri} />
            <input type="hidden" name="invitationCid" value={invitation.cid} />
          </>
        )}
        <input type="hidden" name="eventUri" value={event.uri} />
        <input type="hidden" name="eventCid" value={event.cid} />
        {RESPONSES.map(([value, label]) => {
          const selected = value === current
          return (
            <button
              key={value}
              name="status"
              value={value}
              aria-pressed={selected}
              className={`border-foreground rounded-full border px-4 py-2 ${
                selected ? 'bg-foreground text-background' : ''
              }`}
            >
              {selected && '✓ '}
              {label}
            </button>
          )
        })}
      </form>
      {current && (
        <form action={removeEventRsvp}>
          <input type="hidden" name="eventUri" value={event.uri} />
          <button className="text-sm underline">Remove your RSVP</button>
        </form>
      )}
    </div>
  )
}
