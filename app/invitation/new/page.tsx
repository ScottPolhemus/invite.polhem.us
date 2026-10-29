import Link from 'next/link'
import { Suspense } from 'react'

import { createInvitation } from '@/app/_actions/create-invitation'
import AuthStatus from '@/app/_components/auth/auth-status'
import InvitationForm from '@/app/_components/invitations/invitation-form'
import PageHeader from '@/app/_components/ui/page-header'
import { listEvents, listUpcomingRsvpedEvents } from '@/lib/atproto/events'
import { getClient, getSessionDid } from '@/lib/atproto/session'

async function NewInvitation({
  searchParams,
}: {
  searchParams: PageProps<'/invitation/new'>['searchParams']
}) {
  const client = await getClient()
  if (!client?.did)
    return (
      <AuthStatus
        expired={!!(await getSessionDid())}
        returnTo="/invitation/new"
      />
    )

  const { error } = await searchParams
  // The default list: events you made, then upcoming ones you've RSVP'd to
  const [own, rsvped] = await Promise.all([
    listEvents(client.did),
    listUpcomingRsvpedEvents(client.did),
  ])
  const ownUris = new Set(own.map((e) => e.uri))
  const events = [...own, ...rsvped.filter((e) => !ownUris.has(e.uri))]

  return (
    <>
      <InvitationForm
        action={createInvitation}
        ownEvents={events}
        error={typeof error === 'string' ? error : undefined}
        submitLabel="Create invitation"
      />
    </>
  )
}

export default function NewInvitationPage(props: PageProps<'/invitation/new'>) {
  return (
    <>
      <PageHeader
        heading={'New invitation'}
        subHeading={'Invite someone to an event'}
      />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <NewInvitation searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </>
  )
}
