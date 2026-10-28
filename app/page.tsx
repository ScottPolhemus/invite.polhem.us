import { Suspense } from 'react'

import AuthStatus from './_components/auth-status'
import PageHeader from './_components/page-header'
import YourEvents from './_components/your-events'
import YourInvitations from './_components/your-invitations'

export default function Home() {
  return (
    <>
      <PageHeader
        heading={'Polhem.us Invite'}
        subHeading={'Custom invitations for Atmosphere events'}
      />
      <Suspense>
        <YourInvitations />
      </Suspense>
      <Suspense>
        <YourEvents />
      </Suspense>
      <Suspense>
        <AuthStatus />
      </Suspense>
    </>
  )
}
