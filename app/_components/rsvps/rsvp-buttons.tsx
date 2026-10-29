import { createEventRsvp } from '@/app/_actions/create-event-rsvp'
import { removeEventRsvp } from '@/app/_actions/remove-event-rsvp'
import type { RsvpStatus } from '@/lib/atproto/rsvps'

import ConfirmSubmit from '../ui/confirm-submit'

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
 * invitation it answers; an event page leaves it out. `readOnly` shows the
 * same buttons, disabled, for someone looking at another account's response.
 */
export default function RsvpButtons({
  event,
  invitation,
  current,
  readOnly = false,
}: {
  event: { uri: string; cid: string }
  invitation?: { uri: string; cid: string }
  current: RsvpStatus | null
  /** Show the response without letting this viewer change it (no buttons to press, nothing to delete) */
  readOnly?: boolean
}) {
  if (readOnly) {
    return (
      <div className="text-center">
        <div className="inline-flex flex-wrap gap-2">
          {RESPONSES.map(([value, label]) => {
            const selected = value === current
            return (
              <button
                key={value}
                type="button"
                disabled
                aria-pressed={selected}
                className={`border-foreground cursor-not-allowed rounded-full border px-4 py-2 ${
                  selected ? 'bg-foreground text-background' : ''
                }`}
              >
                {selected && '✓ '}
                {label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="inline-flex flex-col gap-2">
        <form action={createEventRsvp} className="flex flex-wrap gap-2">
          {invitation && (
            <>
              <input
                type="hidden"
                name="invitationUri"
                value={invitation.uri}
              />
              <input
                type="hidden"
                name="invitationCid"
                value={invitation.cid}
              />
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
            <ConfirmSubmit
              message="Delete your RSVP? The host will no longer see your response."
              className="text-sm underline"
            >
              Delete your RSVP
            </ConfirmSubmit>
          </form>
        )}
      </div>
    </div>
  )
}
