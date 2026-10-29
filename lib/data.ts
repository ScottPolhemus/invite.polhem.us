import 'server-only'

import { lexToJson } from '@atproto/lex'
import { AtUri, type DidString } from '@atproto/syntax'
import { cacheLife, cacheTag } from 'next/cache'

import { getInvitationRecord } from '@/lib/atproto/invitations'
import { EVENT, fetchRecord, INVITATION } from '@/lib/atproto/records'
import { findRsvp, rsvpStatus } from '@/lib/atproto/rsvps'
import { getPdsClient, resolveDid, resolveHandle } from '@/lib/atproto/identity'

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

// Only invitations are synced to the database. Events are read straight from
// the author's PDS and cached; nothing syncs them, so they age out by time.
export async function getEvent(did: string, rkey: string) {
  'use cache'
  cacheLife('hours')
  const uri = AtUri.make(did, EVENT, rkey).toString()
  cacheTag(`record:${uri}`)
  const row = await fetchRecord(uri)
  return row
    ? { uri: row.uri, cid: row.cid, value: row.value as EventValue }
    : null
}

// Cached for a long time: ingest expires the tag when the invitation changes.
export async function getInvitation(did: string, rkey: string) {
  'use cache'
  cacheLife('days')
  cacheTag(`record:${AtUri.make(did, INVITATION, rkey).toString()}`)
  const row = await getInvitationRecord(did, rkey)
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

/**
 * Name to show for an account: its profile displayName, else its handle, else
 * the DID. Read from the account's own PDS, and cached since profiles rarely change.
 */
export async function getDisplayName(did: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`profile:${did}`)
  try {
    const client = await getPdsClient(did)
    const { body } = await client.getRecord('app.bsky.actor.profile', 'self', {
      repo: did as `did:${string}:${string}`,
    })
    const name = (lexToJson(body.value) as { displayName?: unknown })
      .displayName
    if (typeof name === 'string' && name.trim()) return name.trim()
  } catch {
    // No profile record, or the PDS is unreachable; fall back to the handle
  }
  const handle = await resolveHandle(did).catch(() => null)
  return handle ? `@${handle}` : did
}

/**
 * How to name an account for people: its display name, plus its handle when
 * that adds something. getDisplayName falls back to the handle (or the DID), so
 * the handle is left out when the name already is it. Cached like the name:
 * resolving a handle reads the clock, which a page can't do while prerendering.
 */
export async function getAccountLabel(did: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(`profile:${did}`)
  const [name, handle] = await Promise.all([
    getDisplayName(did),
    resolveHandle(did).catch(() => undefined),
  ])
  return { name, handle: handle && name !== `@${handle}` ? handle : undefined }
}

/**
 * An account's RSVP response to an event ('going' | 'interested' | 'notgoing'),
 * or null if it hasn't RSVP'd, read fresh from that account's own public repo.
 * Use this where the view must match the record exactly (an account looking at
 * its own response); lists use the cached getRsvpResponse.
 */
export async function readRsvpResponse(did: string, eventUri: string) {
  try {
    const client = await getPdsClient(did)
    const hit = await findRsvp(client, eventUri, did as DidString)
    return hit ? rsvpStatus(hit.value.status) : null
  } catch {
    // An unreachable PDS shouldn't break the page; show no response
    return null
  }
}

/**
 * The same lookup, cached for a minute, for lists. It covers an RSVP made
 * anywhere, not just through our link; the RSVP actions expire the tag when the
 * account responds here.
 */
export async function getRsvpResponse(did: string, eventUri: string) {
  'use cache'
  cacheLife({ stale: 30, revalidate: 60, expire: 600 })
  cacheTag(`rsvp-response:${did}:${eventUri}`)
  return readRsvpResponse(did, eventUri)
}
