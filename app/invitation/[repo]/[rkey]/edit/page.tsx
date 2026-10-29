import { AtUri } from '@atproto/syntax'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { deleteInvitation } from '@/app/_actions/delete-invitation'
import { updateInvitation } from '@/app/_actions/update-invitation'
import AuthStatus from '@/app/_components/auth/auth-status'
import ConfirmSubmit from '@/app/_components/ui/confirm-submit'
import PageHeader from '@/app/_components/ui/page-header'
import { resolveHandle } from '@/lib/atproto/identity'
import { getInvitationRecord } from '@/lib/atproto/invitations'
import { getSessionDid } from '@/lib/atproto/session'
import {
  getDisplayName,
  getEvent,
  resolveRepo,
  type InvitationValue,
} from '@/lib/data'

async function EditInvitation({
  params,
  searchParams,
}: {
  params: PageProps<'/invitation/[repo]/[rkey]/edit'>['params']
  searchParams: PageProps<'/invitation/[repo]/[rkey]/edit'>['searchParams']
}) {
  const { repo, rkey } = await params
  const did = await resolveRepo(repo)
  if (!did) notFound()

  const sessionDid = await getSessionDid()
  if (!sessionDid) return <AuthStatus />
  // Only an invitation's author can edit it
  if (sessionDid !== did) notFound()

  // Read fresh (not through the page cache) so the form never starts from a stale copy
  const existing = await getInvitationRecord(did, rkey)
  if (!existing) notFound()
  const value = existing.value as InvitationValue

  const eventRef = new AtUri(value.subject.uri)
  const [event, recipientName, recipientHandle] = await Promise.all([
    getEvent(eventRef.did, eventRef.rkey).catch(() => null),
    getDisplayName(value.recipient),
    resolveHandle(value.recipient).catch(() => undefined),
  ])

  const { error } = await searchParams
  const viewPath = `/invitation/${did}/${rkey}`

  return (
    <>
      <div className="flex flex-col gap-4">
        {error === 'missing' && (
          <p role="alert">That invitation no longer exists.</p>
        )}
        <div>
          <p className="text-sm opacity-70">Event</p>
          {event ? (
            <Link
              href={`/event/${eventRef.did}/${eventRef.rkey}`}
              className="underline"
            >
              {event.value.name}
            </Link>
          ) : (
            <p>Event unavailable</p>
          )}
        </div>
        <div>
          <p className="text-sm opacity-70">Recipient</p>
          <p>
            {recipientName}
            {recipientHandle && recipientName !== `@${recipientHandle}` && (
              <span className="opacity-70"> (@{recipientHandle})</span>
            )}
          </p>
        </div>
        <p className="text-sm opacity-70">
          The event and recipient can&rsquo;t be changed after an invitation is
          created. To change either, delete it and create a new one.
        </p>
      </div>

      <form action={updateInvitation} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="rkey" value={rkey} />
        <label className="flex flex-col gap-1">
          Message (Markdown, optional)
          <textarea
            name="description"
            rows={5}
            defaultValue={value.description?.text?.markdown}
            className="border-foreground w-full rounded border p-2"
          />
        </label>
        <button className="bg-foreground text-background self-start rounded-full px-4 py-2">
          Save changes
        </button>
      </form>

      <div className="mt-6 flex items-center gap-4">
        <Link href={viewPath} className="underline">
          Cancel
        </Link>
        <form action={deleteInvitation}>
          <input type="hidden" name="rkey" value={rkey} />
          <input type="hidden" name="next" value="/" />
          <ConfirmSubmit
            message="Delete this invitation? The link will stop working."
            className="text-red-700 underline"
          >
            Delete invitation
          </ConfirmSubmit>
        </form>
      </div>
    </>
  )
}

export default function EditInvitationPage(
  props: PageProps<'/invitation/[repo]/[rkey]/edit'>
) {
  return (
    <>
      <PageHeader heading={'Edit invitation'} />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <EditInvitation
              params={props.params}
              searchParams={props.searchParams}
            />
          </Suspense>
        </div>
      </div>
    </>
  )
}
