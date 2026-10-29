import { getSessionDid } from '@/lib/atproto/session'
import { getAccountLabel } from '@/lib/data'

import SignOutForm from './sign-out-form'

/** On every page while signed in: who you are, and how to sign out */
export default async function SessionFooter() {
  const did = await getSessionDid()
  if (!did) return null

  const { name, handle } = await getAccountLabel(did)

  return (
    <footer className="border-foreground mx-4 mt-auto border-t py-3">
      <div className="page-content flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="min-w-0 truncate">
          Signed in as <strong>{name}</strong>
          {handle && ` (@${handle})`}
        </span>
        <SignOutForm />
      </div>
    </footer>
  )
}
