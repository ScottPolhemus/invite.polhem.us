import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import EventList from '@/app/_components/events/event-list'
import PageHeader from '@/app/_components/ui/page-header'
import { resolveHandle, resolvePds } from '@/lib/atproto/identity'
import { getDisplayName, resolveRepo } from '@/lib/data'

async function Profile({
  params,
}: {
  params: PageProps<'/profile/[actor]'>['params']
}) {
  const { actor } = await params
  // Accepts a DID or a handle; a handle that doesn't resolve is a 404
  const did = await resolveRepo(actor)
  if (!did) notFound()
  // A DID has to belong to a real account too (its DID document must resolve)
  if (!(await resolvePds(did).catch(() => null))) notFound()

  const [name, handle] = await Promise.all([
    getDisplayName(did),
    resolveHandle(did).catch(() => undefined),
  ])

  return (
    <>
      <PageHeader
        heading={name}
        // getDisplayName falls back to the handle or DID, so don't repeat it
        subHeading={handle && name !== `@${handle}` ? `@${handle}` : undefined}
        body={did !== name ? did : undefined}
      />
      <section className="mx-4 mb-4 max-w-xl">
        <h2 className="mb-2 text-2xl">Events</h2>
        <Suspense>
          <EventList
            did={did}
            emptyMessage="No events or RSVPs to show for this account."
          />
        </Suspense>
      </section>
    </>
  )
}

export default function ProfilePage(props: PageProps<'/profile/[actor]'>) {
  return (
    <Suspense>
      <Profile params={props.params} />
    </Suspense>
  )
}
