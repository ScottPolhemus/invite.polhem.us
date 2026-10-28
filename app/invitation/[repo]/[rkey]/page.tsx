import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AtUri } from '@atproto/syntax'
import { Suspense } from 'react'

import InvitationPreviewBanner from '@/app/_components/invitation-preview-banner'
import PageHeader from '@/app/_components/page-header'
import RsvpButtons from '@/app/_components/rsvp-buttons'
import { resolveHandle } from '@/lib/atproto/identity'
import { getSessionDid } from '@/lib/atproto/session'
import {
  getDisplayName,
  getEvent,
  getInvitation,
  readRsvpResponse,
  resolveRepo,
  type InvitationValue,
} from '@/lib/data'

/**
 * What the visitor can do with the invitation: the recipient RSVPs; anyone else
 * is offered a sign-in as the recipient (if signed out) and the plain event page.
 */
async function InvitationActions({
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
        <Link href={`/events/${eventDid}/${eventRkey}`} className="underline">
          Click here to view the event details.
        </Link>
      </p>
    </div>
  )
}

async function Recipient({ did }: { did: string }) {
  return (
    <p className="mx-4 mt-4">
      Invitation for <strong>{await getDisplayName(did)}</strong>
    </p>
  )
}

async function InvitationContent({
  params,
}: {
  params: PageProps<'/invitation/[repo]/[rkey]'>['params']
}) {
  const { repo, rkey } = await params
  const did = await resolveRepo(repo)
  if (!did) notFound()
  const invitation = await getInvitation(did, rkey)
  if (!invitation) notFound()

  const eventRef = new AtUri(invitation.value.subject.uri)
  const event = await getEvent(eventRef.did, eventRef.rkey)
  if (!event) notFound()

  return (
    <>
      <Suspense>
        <InvitationPreviewBanner
          author={did}
          recipient={invitation.value.recipient}
        />
      </Suspense>
      <Suspense>
        <Recipient did={invitation.value.recipient} />
      </Suspense>
      <PageHeader
        heading={event.value.name}
        subHeading={event.value.startsAt}
        body={
          invitation.value.description?.text?.markdown ??
          event.value.description
        }
      />
      <Suspense>
        <InvitationActions
          invitation={invitation}
          event={event}
          returnTo={`/invitation/${did}/${rkey}`}
        />
      </Suspense>
    </>
  )
}

export default function InvitationPage(
  props: PageProps<'/invitation/[repo]/[rkey]'>
) {
  return (
    <Suspense>
      <InvitationContent params={props.params} />
    </Suspense>
  )
}
