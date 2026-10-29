import 'server-only'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'
import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'
import { getEvent } from '@/lib/data'

import { getPdsClient } from './identity'
import { EVENT } from './records'
import { rsvpStatus } from './rsvps'

const MODES = ['inperson', 'virtual', 'hybrid'] as const
export const STATUSES = [
  'scheduled',
  'planned',
  'rescheduled',
  'postponed',
  'cancelled',
] as const

export type EventFields = {
  name: string
  startsAt: l.DatetimeString
  endsAt?: l.DatetimeString
  mode: string
  status: string
  description?: string
  link?: l.UriString
  address?: {
    name?: string
    street?: string
    locality?: string
    region?: string
    postalCode?: string
    country: string
  }
}

export type EventInput =
  { error: 'name' | 'starts' | 'dates' | 'link' | 'location' } | EventFields

const text = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim()

function timestamp(value: string) {
  const date = new Date(value)
  return value && !Number.isNaN(+date) ? date : null
}

/** Validates the create-event form; the dates arrive as ISO UTC strings from DateTimeInput */
export function readEventInput(formData: FormData): EventInput {
  const name = text(formData, 'name')
  if (!name) return { error: 'name' }

  const starts = timestamp(text(formData, 'startsAt'))
  if (!starts) return { error: 'starts' }
  const endsText = text(formData, 'endsAt')
  const ends = endsText ? timestamp(endsText) : null
  if (endsText && (!ends || ends < starts)) return { error: 'dates' }

  const modeValue = text(formData, 'mode')
  const mode = MODES.find((m) => m === modeValue) ?? 'inperson'

  const statusValue = text(formData, 'status')
  const status = STATUSES.find((v) => v === statusValue) ?? 'scheduled'

  const linkText = text(formData, 'link')
  let link: l.UriString | undefined
  if (linkText) {
    try {
      const url = new URL(linkText)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return { error: 'link' }
      if (!l.isUriString(url.href)) return { error: 'link' }
      link = url.href
    } catch {
      return { error: 'link' }
    }
  }

  const address = {
    name: text(formData, 'venue'),
    street: text(formData, 'street'),
    locality: text(formData, 'locality'),
    region: text(formData, 'region'),
    postalCode: text(formData, 'postalCode'),
  }
  const country = text(formData, 'country').toUpperCase()
  const hasAddress = Object.values(address).some(Boolean) || country
  // The address lexicon requires an ISO 3166 country code
  if (hasAddress && !/^[A-Z]{2,10}$/.test(country)) return { error: 'location' }

  return {
    name,
    startsAt: l.asDatetimeString(starts.toISOString()),
    ...(ends && { endsAt: l.asDatetimeString(ends.toISOString()) }),
    mode: `community.lexicon.calendar.event#${mode}`,
    status: `community.lexicon.calendar.event#${status}`,
    ...(text(formData, 'description') && {
      description: text(formData, 'description'),
    }),
    ...(link && { link }),
    ...(hasAddress && {
      address: {
        ...Object.fromEntries(Object.entries(address).filter(([, v]) => v)),
        country,
      },
    }),
  }
}

export type EventDefaults = {
  name?: string
  description?: string
  startsAt?: string
  endsAt?: string
  mode?: (typeof MODES)[number]
  status?: (typeof STATUSES)[number]
  link?: string
  venue?: string
  street?: string
  locality?: string
  region?: string
  postalCode?: string
  country?: string
}

const ADDRESS = 'community.lexicon.location.address'
const suffix = (token: unknown) =>
  typeof token === 'string' ? token.split('#')[1] : undefined

/**
 * What the event form shows for an existing event record (wire JSON). The form
 * models the first link and the first address; the rest of the record is carried
 * over untouched by mergeEvent.
 */
export function eventDefaults(value: Record<string, unknown>): EventDefaults {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const uris = Array.isArray(value.uris) ? value.uris : []
  const locations = Array.isArray(value.locations) ? value.locations : []
  const address = locations.find(
    (loc) => (loc as { $type?: string })?.$type === ADDRESS
  ) as Record<string, unknown> | undefined

  return {
    name: str(value.name),
    description: str(value.description),
    startsAt: str(value.startsAt),
    endsAt: str(value.endsAt),
    mode: MODES.find((m) => m === suffix(value.mode)),
    status: STATUSES.find((v) => v === suffix(value.status)),
    link: str((uris[0] as { uri?: unknown } | undefined)?.uri),
    venue: str(address?.name),
    street: str(address?.street),
    locality: str(address?.locality),
    region: str(address?.region),
    postalCode: str(address?.postalCode),
    country: str(address?.country),
  }
}

const isAddress = (loc: unknown) =>
  (loc as { $type?: string } | null)?.$type === ADDRESS

/**
 * Apply the event form to an existing record. Real events carry more than the
 * form models (extra links, geo and H3 locations, media, timezone, and fields
 * from other apps), so everything not edited here is carried over untouched:
 *
 * - the form's link replaces only the first link, and other links stay;
 * - the form's address replaces only the first address, and other locations
 *   (geo, H3, ...) stay;
 * - `facets` are byte offsets into the description, so they're dropped if the
 *   description text changes, rather than left pointing at the wrong text;
 * - an emptied end time or description is removed;
 * - a start or end time that hasn't changed keeps its original string.
 */
export function mergeEvent(
  existing: event.Main,
  input: EventFields
): Omit<event.Main, '$type'> {
  const {
    $type,
    name,
    description,
    startsAt,
    endsAt,
    mode,
    status,
    uris,
    locations,
    ...rest
  } = existing as event.Main & { facets?: unknown }
  void [$type, name, mode, status]

  // The form submits UTC timestamps; keep the original string (and its offset)
  // when the moment hasn't changed, so an untouched date is never rewritten
  const keepIfSame = <T extends string>(original: T | undefined, next: T) =>
    original && +new Date(original) === +new Date(next) ? original : next

  const otherUris = (uris ?? []).slice(1)
  const newUris = [
    ...(input.link ? [{ ...uris?.[0], uri: input.link }] : []),
    ...otherUris,
  ]

  const firstAddress = (locations ?? []).findIndex(isAddress)
  const otherLocations = (locations ?? []).filter((_, i) => i !== firstAddress)
  const newLocations = [
    ...(input.address ? [{ $type: ADDRESS, ...input.address } as const] : []),
    ...otherLocations,
  ]

  const descriptionChanged = (input.description ?? undefined) !== description
  if (descriptionChanged) delete (rest as { facets?: unknown }).facets

  return {
    ...rest,
    name: input.name,
    startsAt: keepIfSame(startsAt, input.startsAt),
    mode: input.mode,
    status: input.status,
    ...(input.endsAt && { endsAt: keepIfSame(endsAt, input.endsAt) }),
    ...(input.description && { description: input.description }),
    ...(newUris.length > 0 && { uris: newUris }),
    ...(newLocations.length > 0 && { locations: newLocations }),
  } as Omit<event.Main, '$type'>
}

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
      // A PDS lists newest first by default (reverse: true would give oldest first)
      const res = await client.list(rsvp, {
        repo: did as `did:${string}:${string}`,
        limit: 100,
        cursor,
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
