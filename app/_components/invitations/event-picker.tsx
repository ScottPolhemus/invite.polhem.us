'use client'

import { useState } from 'react'

import type { EventOption } from '@/lib/atproto/events'

import EventCombobox from './event-combobox'
import HandleTypeahead from '../ui/handle-typeahead'
import Link from 'next/link'

const field = 'border-foreground w-full rounded border p-2'

export default function EventPicker({
  ownEvents,
}: {
  /** The signed-in user's own events, shown until another account is chosen */
  ownEvents: EventOption[]
}) {
  const [events, setEvents] = useState(ownEvents)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [actor, setActor] = useState('')

  async function lookUp(value: string) {
    const next = value.trim().replace(/^@/, '')
    if (next === actor) return
    setActor(next)
    if (!next) {
      setEvents(ownEvents)
      setStatus('idle')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(`/api/events?actor=${encodeURIComponent(next)}`)
      if (!res.ok) throw new Error()
      setEvents(((await res.json()) as { events: EventOption[] }).events)
      setStatus('idle')
    } catch {
      setEvents([])
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="event-owner">Events from</label>
        <HandleTypeahead
          id="event-owner"
          name="eventOwner"
          required={false}
          placeholder={`you.bsky.social`}
          className={field}
          onCommit={lookUp}
        />
        <p className="text-sm">
          <span className="opacity-70">
            Leave blank for your events and ones you’ve RSVP’d to
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="event">Event</label>
        {status === 'loading' ? (
          <span>Loading events…</span>
        ) : status === 'error' ? (
          <span role="alert">Couldn’t load events for that account.</span>
        ) : events.length === 0 ? (
          <span>
            {actor
              ? 'No events found.'
              : 'No events yet. Search another account above to find one.'}
          </span>
        ) : (
          <EventCombobox
            // A new list is a new selection
            key={actor}
            id="event"
            name="eventUri"
            events={events}
            className={field}
          />
        )}
        <p className="text-sm">
          <span className="opacity-70">Starting from scratch?</span>{' '}
          <Link href="/event/new" className="underline">
            Create a new event
          </Link>
        </p>
      </div>
    </div>
  )
}
