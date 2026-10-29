// An unreadable timestamp is shown as written rather than breaking the page
const valid = (iso: string) => !Number.isNaN(+new Date(iso))

// The server's and the browser's ICU data can differ in how a date and time are
// joined ("Apr 29, 2027 at 7:00 AM" or "Apr 29, 2027, 7:00 AM") and in which
// kind of space precedes AM/PM. The server render and the browser's first render
// must match exactly, so the pieces are formatted separately and joined here.
const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, ' ')

function format(iso: string, timeZone?: string) {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const time = date.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return plain(`${day}, ${time}`)
}

/** "Nov 5, 2026, 6:30 PM UTC": the same wherever the server runs */
export function formatUtc(iso: string) {
  return valid(iso) ? format(iso, 'UTC') : iso
}

/** The same moment in the browser's timezone, such as "Nov 5, 2026, 11:30 AM PST" */
export function formatLocal(iso: string) {
  return valid(iso) ? format(iso) : iso
}

function formatDate(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "Oct 27, 2026": the calendar date in UTC, so the server's timezone doesn't change what's shown */
export function formatUtcDate(iso: string) {
  return valid(iso) ? formatDate(iso, 'UTC') : iso
}

/** The calendar date in the browser's timezone, which can be the day before or after the UTC one */
export function formatLocalDate(iso: string) {
  return valid(iso) ? formatDate(iso) : iso
}
