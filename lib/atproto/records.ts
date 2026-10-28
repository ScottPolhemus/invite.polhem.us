import 'server-only'

import { lexToJson, XrpcResponseError } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { and, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import { INVITATION } from './collections'
import { getPdsClient } from './identity'

// Only invitations are stored. Events and RSVPs are read from the PDS on demand.
type RecordValue = Record<string, unknown>

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

export async function deleteRecord(uri: string) {
  await db.delete(record).where(eq(record.uri, uri))
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

/** An invitation from the DB, or on a miss from its author's PDS (then stored) */
export async function getInvitationRecord(did: string, rkey: string) {
  const uri = AtUri.make(did, INVITATION, rkey).toString()
  const row = await getStoredRecord(uri)
  if (row) return { uri: row.uri, cid: row.cid, value: row.value }

  const fetched = await fetchRecord(uri)
  if (!fetched) return null
  await upsertRecord(uri, fetched.cid, fetched.value)
  return fetched
}

/** Invitations a user has authored, newest first (record keys are time-ordered TIDs) */
export async function listInvitationsBy(did: string) {
  return db
    .select()
    .from(record)
    .where(and(eq(record.collection, INVITATION), eq(record.did, did)))
    .orderBy(desc(record.rkey))
}
