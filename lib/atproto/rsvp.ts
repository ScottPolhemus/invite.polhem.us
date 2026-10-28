import 'server-only'

import { l, type Client } from '@atproto/lex'

import * as rsvp from '@/app/__generated__/lexicons/community/lexicon/calendar/rsvp'

/** Build a validated strongRef from untrusted form input */
export function strongRef(uri: string, cid: string) {
  return { uri: l.asAtUriString(uri), cid }
}

export const RSVP_STATUSES = ['going', 'interested', 'notgoing'] as const
export type RsvpStatus = (typeof RSVP_STATUSES)[number]

/** Find the signed-in user's RSVP for an event by scanning their own repo */
export async function findMyRsvp(client: Client, eventUri: string) {
  let cursor: string | undefined
  do {
    const res = await client.list(rsvp, { limit: 100, cursor })
    const hit = res.records.find(
      (r) => (r.value as rsvp.Main).subject.uri === eventUri
    )
    if (hit)
      return { uri: hit.uri, cid: hit.cid, value: hit.value as rsvp.Main }
    cursor = res.cursor
  } while (cursor)
  return null
}
