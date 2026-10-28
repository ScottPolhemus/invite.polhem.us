import Link from 'next/link'
import { Suspense } from 'react'

import { createInvitation } from '@/app/_actions/create-invitation'
import AuthStatus from '@/app/_components/auth-status'
import InvitationForm from '@/app/_components/invitation-form'
import PageHeader from '@/app/_components/page-header'
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
      <p className="mx-4 mt-4 max-w-xl text-sm">
        Not hosting yet?{' '}
        <Link href="/events/new" className="underline">
          Create an event
        </Link>{' '}
        first.
      </p>
    </>
  )
}

export default function NewInvitationPage(props: PageProps<'/invitation/new'>) {
  return (
    <>
      <PageHeader
        heading={'New invitation'}
        subHeading={'Invite someone to one of your events'}
      />
      <Suspense>
        <NewInvitation searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
