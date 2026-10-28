import 'server-only'

import { lexToJson } from '@atproto/lex'
import type { DidString } from '@atproto/syntax'

import { INVITATION } from './collections'
import { getPdsClient } from './identity'
import { upsertRecord } from './records'

/** Pull a user's invitations from their PDS */
export async function backfill(did: DidString) {
  const client = await getPdsClient(did)
  let stored = 0
  let cursor: string | undefined
  do {
    const { body } = await client.listRecords(INVITATION, {
      repo: did,
      limit: 100,
      cursor,
    })
    for (const r of body.records) {
      await upsertRecord(
        r.uri,
        r.cid,
        lexToJson(r.value) as Record<string, unknown>
      )
      stored++
    }
    cursor = body.cursor
  } while (cursor)
  return stored
}
