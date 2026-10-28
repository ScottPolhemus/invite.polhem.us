'use server'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { redirect } from 'next/navigation'

import * as invitation from '@/app/__generated__/lexicons/us/polhem/invite/invitation'
import { resolveDid } from '@/lib/atproto/identity'
import { fetchRecord, upsertRecord } from '@/lib/atproto/records'
import { INVITATION } from '@/lib/atproto/collections'
import { getClient } from '@/lib/atproto/session'

const back = (error: string) => redirect(`/invitation/new?error=${error}`)

export async function createInvitation(formData: FormData) {
  const client = await getClient()
  if (!client?.did) return back('auth')

  const eventUri = String(formData.get('eventUri') ?? '')
  const markdown = String(formData.get('description') ?? '').trim()
  const handle = String(formData.get('recipient') ?? '')
    .trim()
    .replace(/^@/, '')
  if (!handle) return back('recipient')

  // Resolve the event's current cid from its author's PDS rather than trusting the form
  let event
  try {
    event = await fetchRecord(eventUri)
  } catch {
    event = null
  }
  if (!event) return back('event')

  let recipient
  try {
    recipient = await resolveDid(handle)
  } catch {
    return back('recipient')
  }
  if (!l.isDidString(recipient)) return back('recipient')

  const value = {
    subject: { uri: l.asAtUriString(event.uri), cid: event.cid },
    recipient,
    ...(markdown && { description: { text: { markdown } } }),
    createdAt: l.currentDatetimeString(),
  }
  const res = await client.create(invitation, value)
  // Write-through; this also starts tracking the event
  await upsertRecord(res.uri, res.cid, { $type: INVITATION, ...value })

  const { did, rkey } = new AtUri(res.uri)
  redirect(`/invitation/${did}/${rkey}`)
}
