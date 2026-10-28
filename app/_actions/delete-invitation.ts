'use server'

import { AtUri } from '@atproto/syntax'
import { refresh, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import * as invitation from '@/app/__generated__/lexicons/us/polhem/invite/invitation'
import { INVITATION } from '@/lib/atproto/collections'
import { safeRedirectPath } from '@/lib/atproto/redirect'
import { deleteInvitationRecord } from '@/lib/atproto/records'
import { getClient } from '@/lib/atproto/session'

/** Delete one of the signed-in user's own invitations; the client only ever writes to their own repo */
export async function deleteInvitation(formData: FormData) {
  const rkey = String(formData.get('rkey') ?? '')
  const client = await getClient()
  if (!client?.did) return

  const uri = AtUri.make(client.did, INVITATION, rkey).toString()
  await client.delete(invitation, { rkey })
  await deleteInvitationRecord(uri)
  updateTag(`record:${uri}`)

  const next = safeRedirectPath(formData.get('next'))
  if (next) redirect(next)
  refresh()
}
