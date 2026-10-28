import 'server-only'

import * as event from '@/app/__generated__/lexicons/community/lexicon/calendar/event'

import type { EventFields } from './event-input'

const ADDRESS = 'community.lexicon.location.address'
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
