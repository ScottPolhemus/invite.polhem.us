'use server'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { redirect } from 'next/navigation'

import * as invitation from '@/app/__generated__/lexicons/us/polhem/invite/invitation'
import { INVITATION } from '@/lib/atproto/collections'
import { readInvitationInput } from '@/lib/atproto/invitation-input'
import { safeRedirectPath } from '@/lib/atproto/redirect'
import { upsertRecord } from '@/lib/atproto/records'
import { getClient } from '@/lib/atproto/session'

/**
 * Create an invitation. A form that isn't the new-invitation page (such as the
 * invite section on an event page) passes `returnTo`, so a mistake sends the
 * user back there with the message, not to /invitation/new.
 */
export async function createInvitation(formData: FormData) {
  const returnTo = safeRedirectPath(formData.get('returnTo'))
  const back = (error: string) =>
    redirect(
      returnTo
        ? `${returnTo}?error=${error}#invite`
        : `/invitation/new?error=${error}`
    )

  const client = await getClient()
  if (!client?.did) return back('auth')

  const input = await readInvitationInput(formData)
  if ('error' in input) return back(input.error)

  const value = {
    subject: input.subject,
    recipient: input.recipient,
    ...(input.markdown && {
      description: { text: { markdown: input.markdown } },
    }),
    createdAt: l.currentDatetimeString(),
  }
  const res = await client.create(invitation, value)
  // Write-through so the link works before ingest catches up
  await upsertRecord(res.uri, res.cid, { $type: INVITATION, ...value })

  const { did, rkey } = new AtUri(res.uri)
  redirect(`/invitation/${did}/${rkey}`)
}
