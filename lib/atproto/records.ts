import 'server-only'

import { lexToJson, XrpcResponseError } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { and, desc, eq, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import { INVITATION, RSVP } from './collections'
import { getPdsClient } from './identity'

// Invitations are stored, along with the RSVPs that answer a known invitation.
// Events and every other RSVP are read from the PDS on demand.
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

/** Remove a stored record; true if there was one */
export async function deleteRecord(uri: string) {
  const gone = await db
    .delete(record)
    .where(eq(record.uri, uri))
    .returning({ uri: record.uri })
  return gone.length > 0
}

/**
 * Remove an invitation along with the RSVPs stored against it, which no longer
 * answer a known invitation. Returns the URIs that were removed.
 */
export async function deleteInvitationRecord(uri: string) {
  const gone = await db
    .delete(record)
    .where(
      or(
        eq(record.uri, uri),
        and(
          eq(record.collection, RSVP),
          sql`${record.value}->'invitation'->>'uri' = ${uri}`
        )
      )
    )
    .returning({ uri: record.uri })
  return gone.map((r) => r.uri)
}

type Ref = { uri?: unknown }

/**
 * Store an RSVP if it answers an invitation we know, otherwise make sure none
 * is stored. It counts only when the invitation is stored, was sent to the
 * account that RSVPed, and is for the event the RSVP is about, so an RSVP can't
 * attach itself to someone else's invitation. Returns what happened.
 */
export async function syncRsvp(
  uri: string,
  cid: string,
  value: RecordValue,
  seq?: bigint
): Promise<'stored' | 'removed' | 'ignored'> {
  const invitationUri = (value.invitation as Ref | undefined)?.uri
  const eventUri = (value.subject as Ref | undefined)?.uri
  const invitation =
    typeof invitationUri === 'string'
      ? await getStoredRecord(invitationUri)
      : null
  const sent = invitation?.value as
    { recipient?: unknown; subject?: Ref } | undefined

  const answers =
    invitation?.collection === INVITATION &&
    sent?.recipient === new AtUri(uri).hostname &&
    typeof eventUri === 'string' &&
    sent.subject?.uri === eventUri
  if (!answers) return (await deleteRecord(uri)) ? 'removed' : 'ignored'

  await upsertRecord(uri, cid, value, seq)
  return 'stored'
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

/**
 * Invitations a user has authored or been sent, newest first. Received ones are
 * only those this app has stored: ingested from the network, or opened here.
 */
export async function listInvitationsInvolving(did: string) {
  return db
    .select()
    .from(record)
    .where(
      and(
        eq(record.collection, INVITATION),
        or(eq(record.did, did), sql`${record.value}->>'recipient' = ${did}`)
      )
    )
    .orderBy(desc(record.rkey))
}
