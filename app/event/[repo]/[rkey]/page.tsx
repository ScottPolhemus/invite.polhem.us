import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import EventDetails from '@/app/_components/event-details'
import InviteToEvent from '@/app/_components/invite-to-event'
import PageHeader from '@/app/_components/page-header'
import RsvpControl from '@/app/_components/rsvp-control'
import { getSessionDid } from '@/lib/atproto/session'
import { getEvent, resolveRepo } from '@/lib/data'

async function OwnerActions({ did, rkey }: { did: string; rkey: string }) {
  if ((await getSessionDid()) !== did) return null
  return (
    <p className="mx-4">
      <Link href={`/event/${did}/${rkey}/edit`} className="underline">
        Edit event
      </Link>
    </p>
  )
}

async function EventContent({
  params,
  searchParams,
}: {
  params: PageProps<'/event/[repo]/[rkey]'>['params']
  searchParams: PageProps<'/event/[repo]/[rkey]'>['searchParams']
}) {
  const { repo, rkey } = await params
  const { error } = await searchParams
  const did = await resolveRepo(repo)
  if (!did) notFound()
  const event = await getEvent(did, rkey)
  if (!event) notFound()

  return (
    <>
      <PageHeader heading={event.value.name} />
      <EventDetails event={event.value} />
      <Suspense>
        <OwnerActions did={did} rkey={rkey} />
      </Suspense>
      <Suspense>
        <RsvpControl
          eventUri={event.uri}
          eventCid={event.cid}
          returnTo={`/event/${did}/${rkey}`}
        />
      </Suspense>
      <Suspense>
        <InviteToEvent
          eventUri={event.uri}
          returnTo={`/event/${did}/${rkey}`}
          error={typeof error === 'string' ? error : undefined}
        />
      </Suspense>
    </>
  )
}

export default function EventPage(props: PageProps<'/event/[repo]/[rkey]'>) {
  return (
    <Suspense>
      <EventContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}
