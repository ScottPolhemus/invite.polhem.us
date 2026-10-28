import { Suspense } from 'react'

import { createInvitation } from '@/app/_actions/create-invitation'
import AuthStatus from '@/app/_components/auth-status'
import PageHeader from '@/app/_components/page-header'
import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import { getClient } from '@/lib/atproto/session'

const ERRORS: Record<string, string> = {
  auth: 'Sign in to create an invitation.',
  recipient: 'Enter the recipient’s handle or DID, and check that it exists.',
  event: 'Choose an event from your list.',
}

async function InvitationForm({
  searchParams,
}: {
  searchParams: PageProps<'/invitation/new'>['searchParams']
}) {
  const client = await getClient()
  if (!client?.did) return <AuthStatus />

  const { error } = await searchParams
  const { records } = await client.list(event, { limit: 100 })
  const field = 'border-foreground w-full rounded border p-2'

  return (
    <form
      action={createInvitation}
      className="mx-4 flex max-w-xl flex-col gap-4"
    >
      {typeof error === 'string' && ERRORS[error] && (
        <p role="alert">{ERRORS[error]}</p>
      )}

      <label className="flex flex-col gap-1">
        Event
        {records.length === 0 ? (
          <span>You have no events yet.</span>
        ) : (
          <select name="eventUri" required className={field}>
            {records.map((r) => {
              const e = r.value as event.Main
              return (
                <option key={r.uri} value={r.uri}>
                  {e.name}
                  {e.startsAt
                    ? ` (${new Date(e.startsAt).toDateString()})`
                    : ''}
                </option>
              )
            })}
          </select>
        )}
      </label>

      <label className="flex flex-col gap-1">
        Recipient
        <input
          name="recipient"
          required
          placeholder="alice.bsky.social"
          className={field}
        />
        <span className="text-sm opacity-70">A handle or DID.</span>
      </label>

      <label className="flex flex-col gap-1">
        Message (Markdown, optional)
        <textarea name="description" rows={5} className={field} />
      </label>

      <button
        disabled={records.length === 0}
        className="bg-foreground text-background self-start rounded-full px-4 py-2 disabled:opacity-50"
      >
        Create invitation
      </button>
    </form>
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
        <InvitationForm searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
