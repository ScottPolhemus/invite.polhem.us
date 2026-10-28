import { AtUri } from '@atproto/syntax'
import Link from 'next/link'

import { deleteInvitation } from '@/app/_actions/delete-invitation'
import { listInvitationsInvolving } from '@/lib/atproto/records'
import { getSessionDid } from '@/lib/atproto/session'
import {
  getDisplayName,
  getEvent,
  getRsvpResponse,
  type InvitationValue,
} from '@/lib/data'

import ConfirmSubmit from './confirm-submit'

const RESPONSE_LABELS = {
  going: 'Going',
  interested: 'Interested',
  notgoing: 'Not going',
} as const

// A calendar date in UTC, so the server's timezone doesn't change what's shown
const createdOn = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

async function InvitationItem({
  did,
  rkey,
  value,
  viewer,
}: {
  /** The invitation's author */
  did: string
  rkey: string
  value: InvitationValue
  viewer: string
}) {
  // One the viewer authored can be edited and deleted; one sent to them can't
  const mine = did === viewer
  const eventRef = new AtUri(value.subject.uri)
  const [event, who, response] = await Promise.all([
    getEvent(eventRef.did, eventRef.rkey).catch(() => null),
    getDisplayName(mine ? value.recipient : did),
    getRsvpResponse(value.recipient, value.subject.uri),
  ])

  return (
    <li className="border-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/invitation/${did}/${rkey}`} className="underline">
          {event?.value.name ?? 'Event unavailable'}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">
            {mine ? 'For' : 'From'} {who}
          </span>
          <span className="opacity-70">
            Created{' '}
            <time dateTime={value.createdAt}>{createdOn(value.createdAt)}</time>
          </span>
          {response && (
            <span className="border-foreground rounded-full border px-2 py-0.5 text-xs">
              {RESPONSE_LABELS[response]}
            </span>
          )}
        </p>
      </div>
      {mine && (
        <>
          <Link href={`/invitation/${did}/${rkey}/edit`} className="underline">
            Edit
          </Link>
          <form action={deleteInvitation}>
            <input type="hidden" name="rkey" value={rkey} />
            <ConfirmSubmit
              message="Delete this invitation? The link will stop working."
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

/** The invitations the signed-in user has made or been sent, from the synced database */
export default async function YourInvitations() {
  const did = await getSessionDid()
  if (!did) return null
  const rows = await listInvitationsInvolving(did)

  return (
    <section className="mx-4 mb-4 max-w-xl">
      <h2 className="mb-1 text-2xl">Your invitations</h2>
      <Link href="/invitation/new" className="mb-2 block underline">
        Create an invitation
      </Link>
      {rows.length === 0 ? (
        <p>You haven&rsquo;t created or received any invitations yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <InvitationItem
              key={row.uri}
              did={row.did}
              viewer={did}
              rkey={row.rkey}
              value={row.value as InvitationValue}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
