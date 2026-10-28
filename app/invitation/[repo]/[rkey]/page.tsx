import { notFound } from 'next/navigation'
import { AtUri } from '@atproto/syntax'
import { Suspense } from 'react'

import InvitationActions from '@/app/_components/invitation-actions'
import InvitationPreviewBanner from '@/app/_components/invitation-preview-banner'
import PageHeader from '@/app/_components/page-header'
import {
  getDisplayName,
  getEvent,
  getInvitation,
  resolveRepo,
} from '@/lib/data'

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
