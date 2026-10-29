'use client'

import { useSyncExternalStore } from 'react'

import { formatLocal, formatUtc } from '@/lib/format-time'

const subscribe = () => () => {}

/**
 * A moment in time shown in the visitor's own timezone. The server doesn't know
 * it, so the server render (and the first client render, which has to match it)
 * is in UTC, and the browser swaps in local time right after.
 */
export default function LocalTime({ iso }: { iso: string }) {
  const shown = useSyncExternalStore(
    subscribe,
    () => formatLocal(iso),
    () => formatUtc(iso)
  )
  return <time dateTime={iso}>{shown}</time>
}
