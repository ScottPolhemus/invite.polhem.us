import 'server-only'

import { lexToJson, XrpcResponseError } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import { getPdsClient } from './identity'

export const INVITATION = 'us.polhem.invite.invitation'
export const EVENT = 'community.lexicon.calendar.event'
export const RSVP = 'community.lexicon.calendar.rsvp'

export const COLLECTIONS = [INVITATION, EVENT, RSVP] as const

/**
 * Stamped on events and RSVPs this app creates, as other atproto calendar apps
 * do, so a record says which app it came from. It's an extra property (the
 * calendar lexicons don't define it), set only when a record is first created:
 * edits carry along whatever the record already has, so a record made
 * elsewhere is never relabelled as ours.
 */
export const CREATED_WITH = 'https://invite.polhem.us'

// Invitations are stored, along with the RSVPs that answer a known invitation.
// Events and every other RSVP are read from the PDS on demand.
export type RecordValue = Record<string, unknown>

export async function upsertRecord(
  uri: string,
  cid: string,
  value: RecordValue,
  seq?: bigint
) {
  const { hostname: did, collection, rkey } = new AtUri(uri)
  await db
    .insert(record)
    .values({ uri, did, collection, rkey, cid, value, seq })
    .onConflictDoUpdate({
      target: record.uri,
      set: { cid, value, seq, indexedAt: new Date() },
      // never let an older Jetstream event overwrite a newer one
      setWhere: sql`${record.seq} is null or ${seq ?? null}::bigint is null or ${record.seq} < ${seq ?? null}::bigint`,
    })
}

/** Remove a stored record; true if there was one */
export async function deleteRecord(uri: string) {
  const gone = await db
    .delete(record)
    .where(eq(record.uri, uri))
    .returning({ uri: record.uri })
  return gone.length > 0
}

export async function getStoredRecord(uri: string) {
  const [row] = await db.select().from(record).where(eq(record.uri, uri))
  return row ?? null
}

/** Fetch one record from its author's PDS (public, unauthenticated) */
export async function fetchRecord(uri: string) {
  const { did, collectionSafe: collection, rkey } = new AtUri(uri)
  const client = await getPdsClient(did)
  try {
    const { body } = await client.getRecord(collection, rkey, { repo: did })
    // A record fetched from a PDS always carries its cid
    if (!body.cid) return null
    return {
      uri: body.uri,
      cid: body.cid,
      value: lexToJson(body.value) as RecordValue,
    }
  } catch (err) {
    if (err instanceof XrpcResponseError && err.error === 'RecordNotFound')
      return null
    throw err
  }
}
