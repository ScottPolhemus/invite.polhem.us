import 'server-only'

import { AtUri } from '@atproto/syntax'
import { cacheLife, cacheTag } from 'next/cache'

import { EVENT, INVITATION } from '@/lib/atproto/collections'
import { resolveDid } from '@/lib/atproto/identity'
import { getRecord } from '@/lib/atproto/records'

export type StrongRef = { uri: string; cid: string }

export type EventValue = {
  name: string
  description?: string
  startsAt?: string
  endsAt?: string
}

export type InvitationValue = {
  subject: StrongRef
  recipient: string
  description?: { text?: { markdown?: string } }
  createdAt: string
}

// Cached bodies are tagged per record so the ingest cycle and write-through
// can expire exactly the records that changed.
export async function getEvent(did: string, rkey: string) {
  'use cache'
  cacheLife('days')
  cacheTag(`record:${AtUri.make(did, EVENT, rkey).toString()}`)
  const row = await getRecord(did, EVENT, rkey, { trackEvents: true })
  return row
    ? { uri: row.uri, cid: row.cid, value: row.value as EventValue }
    : null
}

export async function getInvitation(did: string, rkey: string) {
  'use cache'
  cacheLife('days')
  cacheTag(`record:${AtUri.make(did, INVITATION, rkey).toString()}`)
  const row = await getRecord(did, INVITATION, rkey)
  return row
    ? { uri: row.uri, cid: row.cid, value: row.value as InvitationValue }
    : null
}

/** Accepts a DID or a handle from the URL's repo segment; null if unresolvable */
export async function resolveRepo(repo: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`repo:${repo}`)
  try {
    return await resolveDid(
      decodeURIComponent(repo).replace(/^@/, '').toLowerCase()
    )
  } catch {
    return null
  }
}
