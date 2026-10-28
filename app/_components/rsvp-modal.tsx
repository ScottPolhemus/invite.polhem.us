'use client'

import { useRef } from 'react'

import { createEventRsvp } from '@/app/_actions/create-event-rsvp'

const OPTIONS = [
  { value: 'going', label: 'Going' },
  { value: 'interested', label: 'Interested' },
  { value: 'notgoing', label: 'Not going' },
]

export default function RsvpModal({
  eventUri,
  eventCid,
  currentStatus,
}: {
  eventUri: string
  eventCid: string
  /** Set when the user already has an RSVP; the modal then updates it */
  currentStatus?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        onClick={() => dialog.current?.showModal()}
        className="bg-foreground text-background mx-4 rounded-full px-4 py-2"
      >
        {currentStatus ? 'Update your RSVP' : 'RSVP'}
      </button>
      <dialog
        ref={dialog}
        className="bg-background text-foreground m-auto rounded-lg p-6 backdrop:bg-black/50"
      >
        <form
          action={async (formData) => {
            await createEventRsvp(formData)
            dialog.current?.close()
          }}
          className="flex flex-col gap-4"
        >
          <h2 className="text-2xl">RSVP</h2>
          <input type="hidden" name="eventUri" value={eventUri} />
          <input type="hidden" name="eventCid" value={eventCid} />
          {OPTIONS.map((o, i) => (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="status"
                value={o.value}
                defaultChecked={
                  currentStatus ? o.value === currentStatus : i === 0
                }
              />
              {o.label}
            </label>
          ))}
          <div className="flex gap-2">
            <button className="bg-foreground text-background rounded-full px-4 py-2">
              Submit
            </button>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-full px-4 py-2 underline"
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
