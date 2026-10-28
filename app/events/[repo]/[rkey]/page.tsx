import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import PageHeader from '@/app/_components/page-header'
import RsvpControl from '@/app/_components/rsvp-control'
import { getEvent, resolveRepo } from '@/lib/data'

async function EventContent({
  params,
}: {
  params: PageProps<'/events/[repo]/[rkey]'>['params']
}) {
  const { repo, rkey } = await params
  const did = await resolveRepo(repo)
  if (!did) notFound()
  const event = await getEvent(did, rkey)
  if (!event) notFound()

  return (
    <>
      <PageHeader
        heading={event.value.name}
        subHeading={event.value.startsAt}
        body={event.value.description}
      />
      <Suspense>
        <RsvpControl eventUri={event.uri} eventCid={event.cid} />
      </Suspense>
    </>
  )
}

export default function EventPage(props: PageProps<'/events/[repo]/[rkey]'>) {
  return (
    <Suspense>
      <EventContent params={props.params} />
    </Suspense>
  )
}
