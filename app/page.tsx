import Link from 'next/link'
import { Suspense } from 'react'

import AuthStatus from './_components/auth-status'
import PageHeader from './_components/page-header'

export default function Home() {
  return (
    <>
      <PageHeader
        heading={'Polhem.us Invite'}
        subHeading={'Description'}
        body={'Custom invitations for Atmosphere events'}
      />
      <Link href="/invitation/new" className="mx-4 mb-4 block underline">
        Create an invitation
      </Link>
      <Suspense>
        <AuthStatus />
      </Suspense>
    </>
  )
}
