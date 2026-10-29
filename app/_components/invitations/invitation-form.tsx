import type { EventOption } from '@/lib/atproto/events'

import EventPicker from './event-picker'
import HandleTypeahead from '../ui/handle-typeahead'

export const INVITATION_ERRORS: Record<string, string> = {
  auth: 'Sign in to create an invitation.',
  recipient: 'Enter the recipient’s handle or DID, and check that it exists.',
  event: 'Choose an event published as a calendar event record.',
}

const field = 'border-foreground w-full rounded border p-2'

/** The create-invitation form */
export default function InvitationForm({
  action,
  ownEvents,
  error,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>
  ownEvents: EventOption[]
  error?: string
  submitLabel: string
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {error && INVITATION_ERRORS[error] && (
        <p role="alert">{INVITATION_ERRORS[error]}</p>
      )}

      <EventPicker ownEvents={ownEvents} />

      <div className="flex flex-col gap-1">
        <label htmlFor="recipient">Recipient</label>
        <HandleTypeahead
          id="recipient"
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
        <textarea name="description" rows={5} className={field} />
      </label>

      <button className="bg-foreground text-background self-start rounded-full px-4 py-2">
        {submitLabel}
      </button>
    </form>
  )
}
