import 'server-only'

import { lexToJson } from '@atproto/lex'
import { AtUri, type DidString } from '@atproto/syntax'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { ingestCursor } from '@/lib/db/schema'

import { getPdsClient } from './identity'
import { deleteInvitationRecord } from './invitations'
import { collect } from './jetstream'
import { deleteRecord, INVITATION, RSVP, upsertRecord } from './records'
import { syncRsvp } from './rsvps'

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

const CURSOR_ID = 'jetstream'

async function loadCursor() {
  const [row] = await db
    .select()
    .from(ingestCursor)
    .where(eq(ingestCursor.id, CURSOR_ID))
  return row?.seq
}

async function saveCursor(seq: bigint) {
  await db
    .insert(ingestCursor)
    .values({ id: CURSOR_ID, seq })
    .onConflictDoUpdate({
      target: ingestCursor.id,
      set: { seq, updatedAt: new Date() },
    })
}

/** One bounded Jetstream cycle. Returns the URIs that changed in the DB. */
export async function runIngestCycle(
  opts: { durationMs?: number; maxEvents?: number } = {}
) {
  const cursor = await loadCursor()
  const { commits, lastSeq } = await collect({
    cursor,
    durationMs: opts.durationMs ?? 25_000,
    maxEvents: opts.maxEvents ?? 50_000,
  })

  const changed: string[] = []
  for (const c of commits) {
    const uri = AtUri.make(c.did, c.collection, c.rkey).toString()
    if (c.operation === 'delete') {
      if (c.collection === INVITATION) {
        // RSVPs stored against it go too: they no longer answer a known invitation
        const removed = await deleteInvitationRecord(uri)
        // the invitation's cached page expires even if its row was already gone
        changed.push(uri, ...removed.filter((u) => u !== uri))
      } else if (await deleteRecord(uri)) {
        changed.push(uri)
      }
      continue
    }
    if (!c.record || !c.cid) continue
    if (c.collection === RSVP) {
      // Every RSVP in the collection arrives; only those answering an invitation are kept
      if ((await syncRsvp(uri, c.cid, c.record, c.seq)) !== 'ignored')
        changed.push(uri)
      continue
    }
    await upsertRecord(uri, c.cid, c.record, c.seq)
    changed.push(uri)
  }

  if (lastSeq !== undefined) await saveCursor(lastSeq)
  return { events: commits.length, changed }
}
