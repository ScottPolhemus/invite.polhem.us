import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import EventDetails from '@/app/_components/events/event-details'
import InviteToEvent from '@/app/_components/events/invite-to-event'
import NoticeBanner from '@/app/_components/ui/notice-banner'
import PageHeader from '@/app/_components/ui/page-header'
import RsvpControl from '@/app/_components/rsvps/rsvp-control'
import { getSessionDid } from '@/lib/atproto/session'
import { getEvent, resolveRepo } from '@/lib/data'

async function OwnerActions({ did, rkey }: { did: string; rkey: string }) {
  if ((await getSessionDid()) !== did) return null
  return (
    <NoticeBanner>
      You are the owner of this event.{' '}
      <Link href={`/event/${did}/${rkey}/edit`} className="underline">
        Edit event
      </Link>
    </NoticeBanner>
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
    <div>
      <Suspense>
        <OwnerActions did={did} rkey={rkey} />
      </Suspense>
      <PageHeader heading={event.value.name} />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <RsvpControl
              eventUri={event.uri}
              eventCid={event.cid}
              returnTo={`/event/${did}/${rkey}`}
            />
          </Suspense>
          <EventDetails event={event.value} />
          <Suspense>
            <InviteToEvent
              eventUri={event.uri}
              returnTo={`/event/${did}/${rkey}`}
              error={typeof error === 'string' ? error : undefined}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default function EventPage(props: PageProps<'/event/[repo]/[rkey]'>) {
  return (
    <Suspense>
      <EventContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  )
}
