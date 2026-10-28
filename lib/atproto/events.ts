import 'server-only'

import { AtUri } from '@atproto/syntax'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'
import { getEvent } from '@/lib/data'

import { EVENT } from './collections'
import { getPdsClient } from './identity'
import { rsvpStatus } from './rsvp'

export type EventOption = {
  uri: string
  name: string
  startsAt?: string
  endsAt?: string
}

/** Whether an event hasn't ended yet; an event with no start date can't be called upcoming */
export function isUpcoming(e: EventOption, now: Date) {
  if (!e.startsAt) return false
  return new Date(e.endsAt ?? e.startsAt) >= now // also false for unparseable dates
}

// Backstop against an account with an unbounded number of records
const MAX_PAGES = 100

/** All events published in a user's repo, read from their PDS */
export async function listEvents(did: string): Promise<EventOption[]> {
  const client = await getPdsClient(did)
  const events: EventOption[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.list(event, {
      repo: did as `did:${string}:${string}`,
      limit: 100,
      cursor,
    })
    for (const r of res.records) {
      const e = r.value as event.Main
      events.push({
        uri: r.uri,
        name: e.name,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
      })
    }
    cursor = res.cursor
    if (!cursor) break
  }
  return events
}

// Newest RSVPs first, so a long history is cut off at the old end
const MAX_RSVPS = 300
const FETCH_CONCURRENCY = 8

export type RsvpedEvent = EventOption & { response: 'going' | 'interested' }

/**
 * Upcoming events the user has RSVP'd to (see listRsvpedEvents), soonest first.
 * An event with no start date can't be called upcoming, so it's left out.
 */
export async function listUpcomingRsvpedEvents(
  did: string,
  now = new Date()
): Promise<RsvpedEvent[]> {
  return (await listRsvpedEvents(did))
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => +new Date(a.startsAt!) - +new Date(b.startsAt!))
}

/**
 * Every event the user has RSVP'd to as going or interested (one they've
 * declined isn't one they'd invite people to), past or upcoming, read from their
 * own RSVP records and the events' authors' PDSes. Never throws: failing to find
 * these shouldn't break the page.
 */
export async function listRsvpedEvents(did: string): Promise<RsvpedEvent[]> {
  // The newest RSVP wins if an account somehow has more than one for an event
  const responses = new Map<string, 'going' | 'interested'>()
  try {
    const client = await getPdsClient(did)
    let scanned = 0
    let cursor: string | undefined
    while (scanned < MAX_RSVPS) {
      const res = await client.list(rsvp, {
        repo: did as `did:${string}:${string}`,
        limit: 100,
        cursor,
        reverse: true,
      })
      for (const r of res.records) {
        const v = r.value as rsvp.Main
        const status = rsvpStatus(v.status)
        if (
          (status === 'going' || status === 'interested') &&
          !responses.has(v.subject.uri)
        )
          responses.set(v.subject.uri, status)
      }
      scanned += res.records.length
      cursor = res.cursor
      if (!cursor) break
    }
  } catch {
    return []
  }

  const uris = [...responses.keys()].filter((uri) => {
    try {
      return new AtUri(uri).collection === EVENT
    } catch {
      return false
    }
  })

  const found: RsvpedEvent[] = []
  for (let i = 0; i < uris.length; i += FETCH_CONCURRENCY) {
    const batch = await Promise.all(
      uris.slice(i, i + FETCH_CONCURRENCY).map((uri) => {
        const at = new AtUri(uri)
        // Cached per event, so repeat visits don't refetch from each author's PDS
        return getEvent(at.did, at.rkey).catch(() => null)
      })
    )
    for (const e of batch) {
      if (!e) continue
      const option = {
        uri: e.uri,
        name: e.value.name,
        startsAt: e.value.startsAt,
        endsAt: e.value.endsAt,
      }
      found.push({ ...option, response: responses.get(e.uri)! })
    }
  }
  return found
}
