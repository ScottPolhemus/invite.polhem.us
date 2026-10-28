import { getSessionDid } from '@/lib/atproto/session'
import { getAccountLabel } from '@/lib/data'

import SignOutForm from './sign-out-form'

/** On every page while signed in: who you are, and how to sign out */
export default async function SessionFooter() {
  const did = await getSessionDid()
  if (!did) return null

  const { name, handle } = await getAccountLabel(did)

  return (
    <footer className="mt-auto px-4 pt-8 pb-4">
      <div className="border-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm">
        <span className="min-w-0 truncate">
          Logged in as <strong>{name}</strong>
          {handle && ` (@${handle})`}
        </span>
        <SignOutForm />
      </div>
    </footer>
  )
}
