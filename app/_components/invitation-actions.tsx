import { AtUri } from '@atproto/syntax'
import Link from 'next/link'

import { resolveHandle } from '@/lib/atproto/identity'
import { getSessionDid } from '@/lib/atproto/session'
import {
  getDisplayName,
  readRsvpResponse,
  type InvitationValue,
} from '@/lib/data'

import RsvpButtons from './rsvp-buttons'

/**
 * What the visitor can do with the invitation: the recipient RSVPs; anyone else
 * is offered a sign-in as the recipient (if signed out) and the plain event page.
 */
export default async function InvitationActions({
  invitation,
  event,
  returnTo,
}: {
  invitation: { uri: string; cid: string; value: InvitationValue }
  event: { uri: string; cid: string }
  returnTo: string
}) {
  const sessionDid = await getSessionDid()
  const recipient = invitation.value.recipient
  if (sessionDid === recipient) {
    // Read from their own repo, fresh, so the highlighted response is always the real one
    const current = await readRsvpResponse(recipient, event.uri)
    return (
      <RsvpButtons invitation={invitation} event={event} current={current} />
    )
  }

  const [name, handle] = await Promise.all([
    getDisplayName(recipient),
    resolveHandle(recipient).catch(() => undefined),
  ])
  const { did: eventDid, rkey: eventRkey } = new AtUri(event.uri)

  return (
    <div className="mx-4 flex flex-col gap-3">
      {sessionDid ? (
        <form
          action="/oauth/logout"
          method="post"
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="next" value={returnTo} />
          <p>
            You&rsquo;re signed in as{' '}
            <strong>{await getDisplayName(sessionDid)}</strong>, but this
            invitation is for <strong>{name}</strong>.
          </p>
          <button className="self-start underline">Sign out</button>
        </form>
      ) : (
        <form action="/oauth/login" method="post">
          <input type="hidden" name="handle" value={handle ?? recipient} />
          <input type="hidden" name="next" value={returnTo} />
          <button className="bg-foreground text-background rounded-full px-4 py-2">
            Sign in as {handle ? `@${handle}` : recipient}
          </button>
        </form>
      )}
      <p>
        Not {name}?{' '}
        <Link href={`/event/${eventDid}/${eventRkey}`} className="underline">
          Click here to view the event details.
        </Link>
      </p>
    </div>
  )
}
