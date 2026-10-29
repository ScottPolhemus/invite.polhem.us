import { Suspense } from 'react'

import { createEvent } from '@/app/_actions/create-event'
import AuthStatus from '@/app/_components/auth/auth-status'
import EventForm from '@/app/_components/events/event-form'
import PageHeader from '@/app/_components/ui/page-header'
import { getSessionDid } from '@/lib/atproto/session'

async function NewEvent({
  searchParams,
}: {
  searchParams: PageProps<'/event/new'>['searchParams']
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

export default function NewEventPage(props: PageProps<'/event/new'>) {
  return (
    <>
      <PageHeader
        heading={'New event'}
        subHeading={'Publish a new event record to your account'}
      />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <NewEvent searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </>
  )
}
