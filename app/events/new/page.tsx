import { Suspense } from 'react'

import { createEvent } from '@/app/_actions/create-event'
import AuthStatus from '@/app/_components/auth-status'
import EventForm from '@/app/_components/event-form'
import PageHeader from '@/app/_components/page-header'
import { getSessionDid } from '@/lib/atproto/session'

async function NewEvent({
  searchParams,
}: {
  searchParams: PageProps<'/events/new'>['searchParams']
}) {
  if (!(await getSessionDid())) return <AuthStatus />
  const { error } = await searchParams
  return (
    <EventForm
      action={createEvent}
      error={typeof error === 'string' ? error : undefined}
      submitLabel="Create event"
    />
  )
}

export default function NewEventPage(props: PageProps<'/events/new'>) {
  return (
    <>
      <PageHeader
        heading={'New event'}
        subHeading={'Publish an event to your account'}
      />
      <Suspense>
        <NewEvent searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
