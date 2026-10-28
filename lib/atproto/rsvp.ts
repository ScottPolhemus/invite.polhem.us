import 'server-only'

import { l, type Client } from '@atproto/lex'
import type { DidString } from '@atproto/syntax'

import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'

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
    const res = await client.list(rsvp, {
      repo,
      limit: 100,
      cursor,
      reverse: true,
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
