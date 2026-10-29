import { createInvitation } from '@/app/_actions/create-invitation'
import { getSessionDid } from '@/lib/atproto/session'

import HandleTypeahead from '../ui/handle-typeahead'
import { INVITATION_ERRORS } from '../invitations/invitation-form'

const field = 'border-foreground w-full rounded border p-2'

/**
 * Invite someone to the event whose page this is. Shown to signed-in visitors
 * (anyone can invite someone to an event, as on the new-invitation form), and
 * posts to the same action, which sends them to the new invitation's link.
 */
export default async function InviteToEvent({
  eventUri,
  returnTo,
  error,
}: {
  eventUri: string
  /** This page's path, so a mistake comes back here with its message */
  returnTo: string
  error?: string
}) {
  if (!(await getSessionDid())) return null

  return (
    <section id="invite">
      <h2 className="mb-2 text-2xl">Invite someone to this event</h2>
      <form action={createInvitation} className="flex flex-col gap-4">
        <input type="hidden" name="eventUri" value={eventUri} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {error && INVITATION_ERRORS[error] && (
          <p role="alert">{INVITATION_ERRORS[error]}</p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="invite-recipient">Username</label>
          <HandleTypeahead
            id="invite-recipient"
            name="recipient"
            placeholder="alice.bsky.social"
            className={field}
          />
          <span className="text-sm opacity-70">
            Search by username or enter a DID
          </span>
        </div>

        <label className="flex flex-col gap-1">
          Message (Markdown, optional)
          <textarea name="description" rows={4} className={field} />
        </label>

        <button className="bg-foreground text-background self-start rounded-full px-4 py-2">
          Create invitation
        </button>
      </form>
    </section>
  )
}
