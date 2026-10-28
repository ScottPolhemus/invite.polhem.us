import { notFound } from 'next/navigation'
import { AtUri } from '@atproto/syntax'
import { Suspense } from 'react'

import { createEventRsvp } from '@/app/_actions/create-event-rsvp'
import AuthStatus from '@/app/_components/auth-status'
import PageHeader from '@/app/_components/page-header'
import { getSessionDid } from '@/lib/atproto/session'
import { getEvent, getInvitation, resolveRepo } from '@/lib/data'

async function RsvpForm({
  invitation,
  event,
}: {
  invitation: { uri: string; cid: string }
  event: { uri: string; cid: string }
}) {
  const did = await getSessionDid()
  if (!did) return <AuthStatus />
  return (
    <form action={createEventRsvp} className="mx-4 flex gap-2">
      <input type="hidden" name="invitationUri" value={invitation.uri} />
      <input type="hidden" name="invitationCid" value={invitation.cid} />
      <input type="hidden" name="eventUri" value={event.uri} />
      <input type="hidden" name="eventCid" value={event.cid} />
      {['going', 'interested', 'notgoing'].map((s) => (
        <button
          key={s}
          name="status"
          value={s}
          className="bg-foreground text-background rounded-full px-4 py-2"
        >
          {s}
        </button>
      ))}
    </form>
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
      <PageHeader
        heading={event.value.name}
        subHeading={event.value.startsAt}
        body={
          invitation.value.description?.text?.markdown ??
          event.value.description
        }
      />
      <Suspense>
        <RsvpForm invitation={invitation} event={event} />
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
