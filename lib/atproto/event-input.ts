import 'server-only'

import { l } from '@atproto/lex'

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
