import { notFound } from 'next/navigation'
import { AtUri } from '@atproto/syntax'
import { Suspense } from 'react'

import EventDetails from '@/app/_components/events/event-details'
import InvitationActions from '@/app/_components/invitations/invitation-actions'
import InvitationPreviewBanner from '@/app/_components/invitations/invitation-preview-banner'
import LocalDate from '@/app/_components/ui/local-date'
import Markdown from '@/app/_components/ui/markdown'
import PageHeader from '@/app/_components/ui/page-header'
import {
  getAccountLabel,
  getEvent,
  getInvitation,
  resolveRepo,
} from '@/lib/data'
import Link from 'next/link'

async function Author({ did }: { did: string }) {
  const author = await getAccountLabel(did)

  return (
    <p className="mb-4">
      <strong>@{author.handle}</strong> wrote:
    </p>
  )
}

async function Recipient({
  authorDid,
  did,
  createdAt,
}: {
  authorDid: string
  did: string
  createdAt: string
}) {
  const author = await getAccountLabel(authorDid)
  const recipient = await getAccountLabel(did)

  return (
    <p className="mb-4 text-center text-lg">
      <strong>{author.name}</strong> (@{author.handle}) created this invitation
      for <strong>{recipient.name}</strong>{' '}
      {!!recipient.handle && `(@${recipient.handle})`} on{' '}
      <LocalDate iso={createdAt} />.
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
          rkey={rkey}
          recipient={invitation.value.recipient}
        />
      </Suspense>
      <PageHeader heading={`Invitation to ${event.value.name}`} />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <Recipient
              authorDid={did}
              did={invitation.value.recipient}
              createdAt={invitation.value.createdAt}
            />
          </Suspense>
          {invitation.value.description?.text?.markdown && (
            <>
              <Author did={did} />
              <div className="bg-foreground/10 mb-4 p-4">
                <Markdown>
                  {invitation.value.description.text.markdown}
                </Markdown>
              </div>
            </>
          )}
          <Suspense>
            <InvitationActions
              author={did}
              invitation={invitation}
              event={event}
              returnTo={`/invitation/${did}/${rkey}`}
            />
          </Suspense>
          <EventDetails event={event.value} descriptionOpen={false} />
          <Link
            href={`/event/${eventRef.did}/${eventRef.rkey}`}
            className="underline"
          >
            Visit the event page to invite someone else to this event
          </Link>
        </div>
      </div>
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
