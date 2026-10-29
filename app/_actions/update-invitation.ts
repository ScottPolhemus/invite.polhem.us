'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import * as invitation from '@/app/__generated__/lexicons/us/polhem/invite/invitation'
import { INVITATION, upsertRecord } from '@/lib/atproto/records'
import { getClient } from '@/lib/atproto/session'

/**
 * Edit the message on one of the signed-in user's own invitations, in place
 * (same record key, so the link survives). The event and recipient are fixed
 * once an invitation is created: this reads only `description` from the form
 * and ignores any other field, so a hand-built request can't change them.
 */
export async function updateInvitation(formData: FormData) {
  const rkey = String(formData.get('rkey') ?? '')
  const markdown = String(formData.get('description') ?? '').trim()
  const client = await getClient()
  if (!client?.did) redirect('/')

  const did = client.did

  // Read through the typed client so every other field (event, recipient,
  // banner, theme, createdAt) round-trips untouched. It only reads the user's
  // own repo.
  const existing = await client.get(invitation, { rkey }).catch(() => null)
  if (!existing) redirect(`/invitation/${did}/${rkey}/edit?error=missing`)

  const { $type, description, ...rest } = existing.value
  void $type
  const value = {
    ...rest,
    // An empty message removes the description. Otherwise keep any extra
    // markdown fields (flavor, extensions) when the text changes.
    ...(markdown && {
      description: {
        ...description,
        text: { ...description?.text, markdown },
      },
    }),
  }
  const res = await client.put(invitation, value, { rkey })
  await upsertRecord(res.uri, res.cid, { $type: INVITATION, ...value })
  updateTag(`record:${res.uri}`)

  redirect(`/invitation/${did}/${rkey}`)
}
