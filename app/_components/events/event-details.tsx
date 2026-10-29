import type { EventValue } from '@/lib/data'

import Markdown from '../ui/markdown'
import LocalTime from './local-time'

const MODES: Record<string, string> = {
  inperson: 'In person',
  virtual: 'Online',
  hybrid: 'In person and online',
}

// Only a change to the plan is worth calling out
const STATUSES: Record<string, string> = {
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  rescheduled: 'Rescheduled',
}

// The part after the lexicon's `#`: "community.lexicon.calendar.event#inperson"
const token = (value?: string) => value?.split('#')[1] ?? ''

type Location = Record<string, unknown> & { $type?: string }

const str = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

// Records come from anyone's repo, so only plain web links become links
function webUrl(value: unknown) {
  const raw = str(value)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

function describeLocation(location: Location) {
  const type = location.$type?.split('#')[0]
  if (type === 'community.lexicon.location.address') {
    const place = [
      str(location.street),
      str(location.locality),
      [str(location.region), str(location.postalCode)]
        .filter(Boolean)
        .join(' '),
      str(location.country),
    ].filter(Boolean)
    return { name: str(location.name), detail: place.join(', ') }
  }
  if (type === 'community.lexicon.location.geo') {
    const lat = str(location.latitude)
    const lon = str(location.longitude)
    return {
      name: str(location.name),
      detail: lat && lon ? `${lat}, ${lon}` : '',
    }
  }
  if (type === 'community.lexicon.calendar.event') {
    // A web location, such as a video call
    const href = webUrl(location.uri)
    return href ? { name: str(location.name), href } : null
  }
  // Foursquare, H3 and anything newer: a name is all that can be said
  const name = str(location.name)
  return name ? { name } : null
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="w-24 shrink-0 font-bold">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** The basics of an event: when, where, how, any links, and what it is about */
export default function EventDetails({
  event,
  descriptionOpen = true,
}: {
  event: EventValue
  /** Whether the description starts expanded (it can always be collapsed) */
  descriptionOpen?: boolean
}) {
  const raw = event as EventValue & {
    mode?: string
    status?: string
    locations?: Location[]
    uris?: { uri?: string; name?: string }[]
  }
  const mode = MODES[token(raw.mode)]
  const status = STATUSES[token(raw.status)]
  const locations = (raw.locations ?? []).flatMap((l) => {
    const described = describeLocation(l)
    return described ? [described] : []
  })
  const links = (raw.uris ?? []).flatMap((u) => {
    const href = webUrl(u.uri)
    return href ? [{ href, name: str(u.name) ?? href }] : []
  })

  return (
    <section
      aria-label="Event details"
      className="border-foreground my-4 border p-4 font-sans"
    >
      <dl className="flex flex-col gap-2">
        {status && (
          <Row label="Status">
            <strong>{status}</strong>
          </Row>
        )}
        {event.startsAt && (
          <Row label="When">
            <LocalTime iso={event.startsAt} />
            {event.endsAt && (
              <>
                {' – '}
                <LocalTime iso={event.endsAt} />
              </>
            )}
          </Row>
        )}
        {mode && <Row label="Attendance">{mode}</Row>}
        {locations.length > 0 && (
          <Row label="Where">
            <ul>
              {locations.map((l, i) => (
                <li key={i}>
                  {'href' in l ? (
                    <a href={l.href} className="underline">
                      {l.name ?? l.href}
                    </a>
                  ) : (
                    <>
                      {l.name && <strong>{l.name}</strong>}
                      {l.name && l.detail && ', '}
                      {l.detail}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {links.length > 0 && (
          <Row label="Links">
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="underline">
                    {l.name}
                  </a>
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>
      {event.description && (
        <details open={descriptionOpen} className="mt-3">
          <summary className="cursor-pointer font-bold">Description</summary>
          <Markdown>{event.description}</Markdown>
        </details>
      )}
    </section>
  )
}
