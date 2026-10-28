import Link from 'next/link'
import { Suspense } from 'react'

import { getSessionDid } from '@/lib/atproto/session'

import EventList from './event-list'

/** Events the signed-in user hosts, plus the ones they've RSVP'd to */
export default async function YourEvents() {
  const did = await getSessionDid()
  if (!did) return null

  return (
    <section className="mx-4 mb-4 max-w-xl">
      <h2 className="mb-1 text-2xl">Your events</h2>
      <Link href="/event/new" className="mb-2 block underline">
        Create an event
      </Link>
      <Suspense>
        <EventList
          did={did}
          manage
          emptyMessage="You haven’t created or RSVP’d to any events yet."
        />
      </Suspense>
    </section>
  )
}
