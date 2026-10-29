'use client'

import { useSyncExternalStore } from 'react'

import { formatLocalDate, formatUtcDate } from '@/lib/format-time'

const subscribe = () => () => {}

/**
 * The calendar date of a moment, in the visitor's own timezone: an invitation
 * made on a Tuesday evening shouldn't say Wednesday just because UTC has rolled
 * over. The server doesn't know the timezone, so the server render (and the
 * first client render, which has to match it) is the UTC date, and the browser
 * swaps in the local one right after.
 */
export default function LocalDate({ iso }: { iso: string }) {
  const shown = useSyncExternalStore(
    subscribe,
    () => formatLocalDate(iso),
    () => formatUtcDate(iso)
  )
  return <time dateTime={iso}>{shown}</time>
}
