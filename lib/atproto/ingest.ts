import 'server-only'

import { AtUri } from '@atproto/syntax'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { ingestCursor } from '@/lib/db/schema'

import { backfillPendingEvents } from './event-backfill'
import { collect } from './jetstream'
import { deleteRecord, shouldStore, upsertRecord } from './records'

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
  // Tracked events pick up historical RSVPs before the live stream continues
  await backfillPendingEvents()

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
      await deleteRecord(uri)
      changed.push(uri)
      continue
    }
    if (!c.record || !c.cid) continue
    if (!(await shouldStore(c.collection, uri, c.record))) continue
    await upsertRecord(uri, c.cid, c.record, c.seq)
    changed.push(uri)
  }

  if (lastSeq !== undefined) await saveCursor(lastSeq)
  return { events: commits.length, changed }
}
