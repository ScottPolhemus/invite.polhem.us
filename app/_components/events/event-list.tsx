import { AtUri } from '@atproto/syntax'
import Link from 'next/link'

import { deleteEvent } from '@/app/_actions/delete-event'
import {
  isUpcoming,
  listEvents,
  listRsvpedEvents,
  type EventOption,
} from '@/lib/atproto/events'
import { listInvitationsBy } from '@/lib/atproto/invitations'
import type { InvitationValue } from '@/lib/data'

import ConfirmSubmit from '../ui/confirm-submit'
import { deleteEventMessage } from './delete-event-message'

type Role = 'host' | 'going' | 'interested'
type Item = EventOption & { role: Role }

const ROLE_LABELS: Record<Role, string> = {
  host: 'Hosting',
  going: 'Going',
  interested: 'Interested',
}

// An account that hosts thousands of events shouldn't render them all at once
const MAX_LISTED = 200

/** The event's calendar date as authored (its own UTC offset), not shifted into the server's timezone */
function eventDate(startsAt?: string) {
  const date = startsAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
  if (!date) return null
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const time = (e: Item) => (e.startsAt ? +new Date(e.startsAt) : NaN)

function EventRow({
  item,
  manage,
  invitations,
}: {
  item: Item
  /** Show Edit and Delete on events this account hosts */
  manage: boolean
  /** How many of the user's invitations point at this event */
  invitations: number
}) {
  const { did, rkey } = new AtUri(item.uri)
  const date = eventDate(item.startsAt)
  return (
    <li className="border-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/event/${did}/${rkey}`}
          prefetch={false}
          className="underline"
        >
          {item.name}
        </Link>
        {date && <p className="text-sm opacity-70">{date}</p>}
      </div>
      <span className="border-foreground rounded-full border px-2 py-0.5 text-xs">
        {ROLE_LABELS[item.role]}
      </span>
      {manage && item.role === 'host' && (
        <>
          <Link
            href={`/event/${did}/${rkey}/edit`}
            prefetch={false}
            className="underline"
          >
            Edit
          </Link>
          <form action={deleteEvent}>
            <input type="hidden" name="rkey" value={rkey} />
            <ConfirmSubmit
              message={deleteEventMessage(item.name, invitations)}
              className="text-red-700 underline"
            >
              Delete
            </ConfirmSubmit>
          </form>
        </>
      )}
    </li>
  )
}

/**
 * The events an account hosts plus the ones it has RSVP'd to: upcoming first,
 * past ones in a collapsed block. Everything is read from the account's own
 * repo (and the events' authors' PDSes), so it works for any account. `manage`
 * is for the signed-in user's own list and adds Edit and Delete.
 */
export default async function EventList({
  did,
  manage = false,
  emptyMessage,
}: {
  did: string
  manage?: boolean
  emptyMessage: string
}) {
  const [own, rsvped, invitationRows] = await Promise.all([
    listEvents(did).catch(() => []),
    listRsvpedEvents(did),
    manage ? listInvitationsBy(did) : [],
  ])
  const invitationCounts = new Map<string, number>()
  for (const row of invitationRows) {
    const uri = (row.value as InvitationValue).subject.uri
    invitationCounts.set(uri, (invitationCounts.get(uri) ?? 0) + 1)
  }
  const ownUris = new Set(own.map((e) => e.uri))
  const items: Item[] = [
    ...own.map((e) => ({ ...e, role: 'host' as const })),
    ...rsvped
      .filter((e) => !ownUris.has(e.uri))
      .map((e) => ({ ...e, role: e.response })),
  ]

  if (items.length === 0) return <p>{emptyMessage}</p>

  const now = new Date()
  const upcoming = items
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => time(a) - time(b))
  // Newest first; events with no date sort last
  const past = items
    .filter((e) => !isUpcoming(e, now))
    .sort((a, b) => (time(b) || -Infinity) - (time(a) || -Infinity))

  const row = (e: Item) => (
    <EventRow
      key={e.uri}
      item={e}
      manage={manage}
      invitations={invitationCounts.get(e.uri) ?? 0}
    />
  )

  return (
    <>
      {upcoming.length > 0 ? (
        <ul>{upcoming.slice(0, MAX_LISTED).map(row)}</ul>
      ) : (
        <p>No upcoming events.</p>
      )}
      {upcoming.length > MAX_LISTED && (
        <p className="py-2 text-sm opacity-70">
          {upcoming.length - MAX_LISTED} more upcoming events not shown.
        </p>
      )}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-bold">
            Past events ({past.length})
          </summary>
          <ul>{past.slice(0, MAX_LISTED).map(row)}</ul>
          {past.length > MAX_LISTED && (
            <p className="py-2 text-sm opacity-70">
              {past.length - MAX_LISTED} older events not shown.
            </p>
          )}
        </details>
      )}
    </>
  )
}
