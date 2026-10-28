const base: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

// An unreadable timestamp is shown as written rather than breaking the page
const valid = (iso: string) => !Number.isNaN(+new Date(iso))

/** "Nov 5, 2026, 6:30 PM UTC": the same wherever the server runs */
export function formatUtc(iso: string) {
  if (!valid(iso)) return iso
  return new Date(iso).toLocaleString('en-US', {
    ...base,
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/** The same moment in the browser's timezone, such as "Nov 5, 2026, 11:30 AM PST" */
export function formatLocal(iso: string) {
  if (!valid(iso)) return iso
  return new Date(iso).toLocaleString('en-US', {
    ...base,
    timeZoneName: 'short',
  })
}
