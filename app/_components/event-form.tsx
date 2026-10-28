import type { EventDefaults } from '@/lib/atproto/event-input'

import DateTimeInput from './datetime-input'

export const EVENT_ERRORS: Record<string, string> = {
  auth: 'Sign in to create an event.',
  name: 'Give the event a name.',
  starts: 'Choose when the event starts.',
  dates: 'The event can’t end before it starts.',
  link: 'Enter a full web address for the link, starting with http:// or https://.',
  location:
    'To add a location, include a country code (such as US) along with the address.',
  missing: 'That event no longer exists.',
}

const field = 'border-foreground w-full rounded border p-2'

const STATUS_OPTIONS = [
  ['scheduled', 'Scheduled'],
  ['planned', 'Planned'],
  ['rescheduled', 'Rescheduled'],
  ['postponed', 'Postponed'],
  ['cancelled', 'Cancelled'],
] as const

/** The create-event and edit-event form */
export default function EventForm({
  action,
  error,
  defaults,
  hidden,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>
  error?: string
  /** Starting values, when editing an existing event */
  defaults?: EventDefaults
  /** Extra hidden inputs, e.g. the record key when editing */
  hidden?: Record<string, string>
  submitLabel: string
}) {
  return (
    <form action={action} className="mx-4 flex max-w-xl flex-col gap-4">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {error && EVENT_ERRORS[error] && (
        <p role="alert">{EVENT_ERRORS[error]}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name}
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="startsAt-input">Starts</label>
          <DateTimeInput
            id="startsAt-input"
            name="startsAt"
            required
            defaultValue={defaults?.startsAt}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="endsAt-input">Ends (optional)</label>
          <DateTimeInput
            id="endsAt-input"
            name="endsAt"
            defaultValue={defaults?.endsAt}
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="mode">Attendance</label>
          <select
            id="mode"
            name="mode"
            defaultValue={defaults?.mode ?? 'inperson'}
            className={field}
          >
            <option value="inperson">In person</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={defaults?.status ?? 'scheduled'}
            className={field}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={defaults?.description}
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="link">Link (optional)</label>
        <input
          id="link"
          name="link"
          type="url"
          placeholder="https://"
          defaultValue={defaults?.link}
          className={field}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1">Location (optional)</legend>
        <input
          name="venue"
          placeholder="Venue name"
          aria-label="Venue name"
          defaultValue={defaults?.venue}
          className={field}
        />
        <input
          name="street"
          placeholder="Street address"
          aria-label="Street address"
          defaultValue={defaults?.street}
          className={field}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="locality"
            placeholder="City"
            aria-label="City"
            defaultValue={defaults?.locality}
            className={field}
          />
          <input
            name="region"
            placeholder="State or region"
            aria-label="State or region"
            defaultValue={defaults?.region}
            className={field}
          />
          <input
            name="postalCode"
            placeholder="Postal code"
            aria-label="Postal code"
            defaultValue={defaults?.postalCode}
            className={field}
          />
          <input
            name="country"
            placeholder="Country code (e.g. US)"
            aria-label="Country code"
            maxLength={10}
            defaultValue={defaults?.country}
            className={field}
          />
        </div>
      </fieldset>

      <button className="bg-foreground text-background self-start rounded-full px-4 py-2">
        {submitLabel}
      </button>
    </form>
  )
}
