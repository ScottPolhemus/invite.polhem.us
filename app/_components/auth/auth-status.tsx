import { getSessionDid } from '@/lib/atproto/session'

import HandleTypeahead from '../ui/handle-typeahead'

/**
 * The sign-in form, for a visitor who isn't signed in (nothing when they are:
 * see SessionFooter).
 *
 * `expired` is for a page that needs a working login session and found the
 * cookie's session can't be restored: it shows a short note and the sign-in
 * form even though a cookie exists, so there's a way forward other than
 * signing out first. `returnTo` is the path to come back to after signing in.
 */
export default async function AuthStatus({
  expired = false,
  returnTo,
  heading,
}: {
  expired?: boolean
  returnTo?: string
  heading?: string
} = {}) {
  const did = await getSessionDid()
  // Signed in: the footer on every page already shows who you are and signs you out
  if (did && !expired) return null
  return (
    <>
      {heading && <p className="mb-2 text-center">{heading}</p>}
      <form action="/oauth/login" method="post" className="mb-4 flex gap-2">
        {returnTo && <input type="hidden" name="next" value={returnTo} />}
        <HandleTypeahead
          id="handle"
          name="handle"
          placeholder="you.bsky.social"
          ariaLabel="Your handle"
          containerClassName="min-w-0 flex-1"
          className="border-foreground w-full rounded-full border px-3 py-2"
        />
        <button className="bg-foreground text-background rounded-full px-4 py-2">
          Sign in
        </button>
      </form>
      {expired && (
        <p role="status" className="mx-4 mt-2 text-sm">
          Your sign-in has expired. Sign in again to continue.
        </p>
      )}
    </>
  )
}
