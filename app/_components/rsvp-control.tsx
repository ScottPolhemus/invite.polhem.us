import { getClient, getSessionDid } from '@/lib/atproto/session'
import { readRsvpResponse } from '@/lib/data'

import AuthStatus from './auth-status'
import RsvpButtons from './rsvp-buttons'

/**
 * An event page's RSVP buttons. They need a working login session, not just a
 * signed-in cookie: choosing a response writes to the account's PDS, and with a
 * session that can't be restored (expired or revoked) the buttons would look
 * live but do nothing. With no session the visitor gets the sign-in form (with
 * a note if their sign-in expired), returning to this page afterwards.
 */
export default async function RsvpControl({
  eventUri,
  eventCid,
  returnTo,
}: {
  eventUri: string
  eventCid: string
  /** This page's path, so signing in brings the visitor back here */
  returnTo: string
}) {
  const client = await getClient()
  if (!client?.did) {
    // A cookie with no restorable session is an expired sign-in, not a signed-out visitor
    return (
      <AuthStatus expired={!!(await getSessionDid())} returnTo={returnTo} />
    )
  }

  // Read fresh from their own repo, so it matches the record exactly
  const current = await readRsvpResponse(client.did, eventUri)
  return (
    <RsvpButtons event={{ uri: eventUri, cid: eventCid }} current={current} />
  )
}
