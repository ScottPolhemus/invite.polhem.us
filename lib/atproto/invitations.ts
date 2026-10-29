import 'server-only'

import { l } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { and, desc, eq, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import { resolveDid } from './identity'
import {
  EVENT,
  fetchRecord,
  getStoredRecord,
  INVITATION,
  RSVP,
  upsertRecord,
} from './records'

export type InvitationInput =
  | { error: 'recipient' | 'event' }
  | {
      subject: { uri: l.AtUriString; cid: string }
      recipient: l.DidString
      markdown: string
    }

/**
 * Validates the invitation form shared by create and edit: the event must be a
 * calendar event record (its cid is read from its author's PDS rather than
 * trusted from the form), and the recipient must resolve to a DID.
 */
export async function readInvitationInput(
  formData: FormData
): Promise<InvitationInput> {
  const eventUri = String(formData.get('eventUri') ?? '')
  const markdown = String(formData.get('description') ?? '').trim()
  const handle = String(formData.get('recipient') ?? '')
    .trim()
    .replace(/^@/, '')
  if (!handle) return { error: 'recipient' }

  let eventCollection
  try {
    eventCollection = new AtUri(eventUri).collection
  } catch {
    return { error: 'event' }
  }
  if (eventCollection !== EVENT) return { error: 'event' }

  let event
  try {
    event = await fetchRecord(eventUri)
  } catch {
    event = null
  }
  if (!event) return { error: 'event' }

  let recipient
  try {
    recipient = await resolveDid(handle)
  } catch {
    return { error: 'recipient' }
  }
  if (!l.isDidString(recipient)) return { error: 'recipient' }

  return {
    subject: { uri: l.asAtUriString(event.uri), cid: event.cid },
    recipient,
    markdown,
  }
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
