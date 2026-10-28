import { AtUri } from '@atproto/syntax'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { deleteEvent } from '@/app/_actions/delete-event'
import { updateEvent } from '@/app/_actions/update-event'
import AuthStatus from '@/app/_components/auth-status'
import ConfirmSubmit from '@/app/_components/confirm-submit'
import { deleteEventMessage } from '@/app/_components/delete-event-message'
import EventForm from '@/app/_components/event-form'
import PageHeader from '@/app/_components/page-header'
import { EVENT } from '@/lib/atproto/collections'
import { eventDefaults } from '@/lib/atproto/event-input'
import { fetchRecord, listInvitationsBy } from '@/lib/atproto/records'
import { getSessionDid } from '@/lib/atproto/session'
import { resolveRepo, type InvitationValue } from '@/lib/data'

async function EditEvent({
  params,
  searchParams,
}: {
  params: PageProps<'/event/[repo]/[rkey]/edit'>['params']
  searchParams: PageProps<'/event/[repo]/[rkey]/edit'>['searchParams']
}) {
  const { repo, rkey } = await params
  const did = await resolveRepo(repo)
  if (!did) notFound()

  const sessionDid = await getSessionDid()
  if (!sessionDid) return <AuthStatus />
  // Only an event's author can edit it
  if (sessionDid !== did) notFound()

  // Read straight from the PDS, not through the page cache, so the form never
  // starts from a stale copy
  const uri = AtUri.make(did, EVENT, rkey).toString()
  const [existing, invitations] = await Promise.all([
    fetchRecord(uri).catch(() => null),
    listInvitationsBy(did),
  ])
  if (!existing) notFound()

  const pointingHere = invitations.filter(
    (row) => (row.value as InvitationValue).subject.uri === uri
  ).length
  const { error } = await searchParams

  return (
    <>
      <EventForm
        action={updateEvent}
        defaults={eventDefaults(existing.value)}
        hidden={{ rkey }}
        error={typeof error === 'string' ? error : undefined}
        submitLabel="Save changes"
      />
      <div className="mx-4 mt-6 flex max-w-xl items-center gap-4">
        <Link href={`/event/${did}/${rkey}`} className="underline">
          Cancel
        </Link>
        <form action={deleteEvent}>
          <input type="hidden" name="rkey" value={rkey} />
          <input type="hidden" name="next" value="/" />
          <ConfirmSubmit
            message={deleteEventMessage(null, pointingHere)}
            className="text-red-700 underline"
          >
            Delete event
          </ConfirmSubmit>
        </form>
      </div>
    </>
  )
}

export default function EditEventPage(
  props: PageProps<'/event/[repo]/[rkey]/edit'>
) {
  return (
    <>
      <PageHeader heading={'Edit event'} />
      <Suspense>
        <EditEvent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
