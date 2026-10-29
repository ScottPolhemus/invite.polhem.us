import { Suspense } from 'react'

import AuthStatus from './_components/auth/auth-status'
import PageHeader from './_components/ui/page-header'
import YourEvents from './_components/events/your-events'
import YourInvitations from './_components/invitations/your-invitations'

export default function Home() {
  return (
    <>
      <PageHeader
        heading={'Polhem.us Invite'}
        subHeading={'You can just invite people to things!'}
      />
      <div className="page-section">
        <div className="page-content">
          <Suspense>
            <YourInvitations />
          </Suspense>
          <Suspense>
            <YourEvents />
          </Suspense>
          <Suspense>
            <AuthStatus heading="Sign in to invite a friend to an existing event or create your own events to invite people to." />
          </Suspense>
        </div>
      </div>
    </>
  )
}
