import 'server-only'

import { l, type Client } from '@atproto/lex'
import { AtUri, type DidString } from '@atproto/syntax'

import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'

import {
  deleteRecord,
  getStoredRecord,
  INVITATION,
  upsertRecord,
  type RecordValue,
} from './records'

/** Build a validated strongRef from untrusted form input */
export function strongRef(uri: string, cid: string) {
  return { uri: l.asAtUriString(uri), cid }
}

export const RSVP_STATUSES = ['going', 'interested', 'notgoing'] as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

// Backstop for an account with an unbounded number of RSVPs
const MAX_PAGES = 50

/**
 * Find an account's RSVP for an event by scanning its RSVP records, newest
 * first so a recent RSVP is found on the first page. `repo` defaults to the
 * client's own account; pass it to look at someone else's public records.
 */
export async function findRsvp(
  client: Client,
  eventUri: string,
  repo?: DidString
) {
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    // A PDS lists newest first by default (reverse: true would give oldest first)
    const res = await client.list(rsvp, {
      repo,
      limit: 100,
      cursor,
    })
    const hit = res.records.find(
      (r) => (r.value as rsvp.Main).subject.uri === eventUri
    )
    if (hit)
      return { uri: hit.uri, cid: hit.cid, value: hit.value as rsvp.Main }
    cursor = res.cursor
    if (!cursor) break
  }
  return null
}

/** The signed-in user's own RSVP for an event */
export const findMyRsvp = (client: Client, eventUri: string) =>
  findRsvp(client, eventUri)

/** 'going' | 'interested' | 'notgoing' from a status token, or null if it's none of those */
export function rsvpStatus(token: string): RsvpStatus | null {
  const status = token.split('#')[1]
  return RSVP_STATUSES.find((s) => s === status) ?? null
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
