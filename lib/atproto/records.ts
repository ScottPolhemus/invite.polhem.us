import 'server-only'

import { lexToJson, XrpcResponseError } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { record, trackedEvent } from '@/lib/db/schema'

import { COLLECTIONS, EVENT, INVITATION, RSVP } from './collections'
import { getPdsClient } from './identity'

export type StoredRecord = typeof record.$inferSelect

type RecordValue = Record<string, unknown> & {
  subject?: { uri?: string }
  invitation?: { uri?: string }
}

export async function isTrackedEvent(uri: string) {
  const [row] = await db
    .select({ uri: trackedEvent.uri })
    .from(trackedEvent)
    .where(eq(trackedEvent.uri, uri))
  return !!row
}

export async function trackEvent(
  uri: string,
  reason: 'invitation' | 'page-view'
) {
  await db.insert(trackedEvent).values({ uri, reason }).onConflictDoNothing()
}

async function invitationExists(uri: string) {
  const [row] = await db
    .select({ uri: record.uri })
    .from(record)
    .where(and(eq(record.uri, uri), eq(record.collection, INVITATION)))
  return !!row
}

/**
 * Conservative policy: all invitations; events only if tracked; RSVPs only if
 * they respond to a stored invitation or point at a tracked event.
 */
export async function shouldStore(
  collection: string,
  uri: string,
  value: RecordValue
) {
  if (collection === INVITATION) return true
  if (collection === EVENT) return isTrackedEvent(uri)
  if (collection === RSVP) {
    const invitationUri = value.invitation?.uri
    if (invitationUri && (await invitationExists(invitationUri))) return true
    const eventUri = value.subject?.uri
    return !!eventUri && (await isTrackedEvent(eventUri))
  }
  return false
}

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

  // An invitation pulls in the event it points at and starts following it
  if (collection === INVITATION && value.subject?.uri) {
    await trackEvent(value.subject.uri, 'invitation')
    await fetchAndStore(value.subject.uri).catch((err) =>
      console.error('failed to fetch event for invitation', uri, err)
    )
  }
}

export async function deleteRecord(uri: string) {
  await db.delete(record).where(eq(record.uri, uri))
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

/** Fetch from the PDS and store it if the policy allows */
export async function fetchAndStore(uri: string) {
  const fetched = await fetchRecord(uri)
  if (!fetched) {
    await deleteRecord(uri)
    return null
  }
  const { collection } = new AtUri(uri)
  if (!(await shouldStore(collection, uri, fetched.value))) return null
  await upsertRecord(uri, fetched.cid, fetched.value)
  return getStoredRecord(uri)
}

export async function getStoredRecord(uri: string) {
  const [row] = await db.select().from(record).where(eq(record.uri, uri))
  return row ?? null
}

/** DB first; on a miss, pull from the PDS (event page loads start tracking) */
export async function getRecord(
  did: string,
  collection: string,
  rkey: string,
  options: { trackEvents?: boolean } = {}
) {
  const uri = AtUri.make(did, collection, rkey).toString()
  if (collection === EVENT && options.trackEvents)
    await trackEvent(uri, 'page-view')
  return (await getStoredRecord(uri)) ?? (await fetchAndStore(uri))
}

export { COLLECTIONS }
