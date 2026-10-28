import 'server-only'

import { lexToJson } from '@atproto/lex'
import type { DidString } from '@atproto/syntax'

import { INVITATION, RSVP } from './collections'
import { getPdsClient } from './identity'
import { shouldStore, upsertRecord } from './records'

/** Pull a user's invitations and invitation-linked RSVPs from their PDS */
export async function backfill(did: DidString) {
  const client = await getPdsClient(did)
  let stored = 0

  for (const collection of [INVITATION, RSVP] as const) {
    let cursor: string | undefined
    do {
      const { body } = await client.listRecords(collection, {
        repo: did,
        limit: 100,
        cursor,
      })
      for (const r of body.records) {
        const value = lexToJson(r.value) as Record<string, unknown>
        if (await shouldStore(collection, r.uri, value)) {
          await upsertRecord(r.uri, r.cid, value)
          stored++
        }
      }
      cursor = body.cursor
    } while (cursor)
  }
  return stored
}
