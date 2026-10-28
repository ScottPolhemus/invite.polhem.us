import 'server-only'

import { AtUri } from '@atproto/syntax'
import { eq, inArray, isNull } from 'drizzle-orm'

import { listRsvpUris } from '@/lib/constellation'
import { db } from '@/lib/db/client'
import { ingestCursor, trackedEvent } from '@/lib/db/schema'

import { hasArchiveAccess, scanRsvps } from './jetstream'
import { fetchAndStore, shouldStore, upsertRecord } from './records'

const CONCURRENCY = 5
const SCAN_BUDGET_MS = 20_000
// Presence of this row means a full archive scan didn't fit the time budget
const SCAN_TOO_SLOW_ID = 'rsvp-scan-too-slow'

async function markBackfilled(uris: string[]) {
  if (uris.length === 0) return
  await db
    .update(trackedEvent)
    .set({ backfilledAt: new Date() })
    .where(inArray(trackedEvent.uri, uris))
}

async function scanTooSlow() {
  const [row] = await db
    .select()
    .from(ingestCursor)
    .where(eq(ingestCursor.id, SCAN_TOO_SLOW_ID))
  return !!row
}

/**
 * One pass over the Jetstream RSVP archive serves every pending event at once.
 * Returns true if the pass covered the whole archive.
 */
async function backfillFromJetstream(eventUris: string[]) {
  const { commits, completed } = await scanRsvps(
    new Set(eventUris),
    SCAN_BUDGET_MS
  )
  for (const c of commits) {
    const uri = AtUri.make(c.did, c.collection, c.rkey).toString()
    if (c.record && c.cid && (await shouldStore(c.collection, uri, c.record)))
      await upsertRecord(uri, c.cid!, c.record, c.seq)
  }
  if (!completed) {
    await db
      .insert(ingestCursor)
      .values({ id: SCAN_TOO_SLOW_ID, seq: BigInt(1) })
      .onConflictDoNothing()
  }
  return completed
}

/** Fallback: Constellation's backlink index, then each record from its PDS */
async function backfillFromConstellation(eventUri: string) {
  const uris = await listRsvpUris(eventUri)
  for (let i = 0; i < uris.length; i += CONCURRENCY) {
    await Promise.all(
      uris
        .slice(i, i + CONCURRENCY)
        .map((uri) =>
          fetchAndStore(uri).catch((err) =>
            console.error('rsvp backfill failed', uri, err)
          )
        )
    )
  }
}

/**
 * Pull historical RSVPs for tracked events that haven't been backfilled.
 * Jetstream's archive first; Constellation when there's no token or the
 * archive is too large to scan within the time budget.
 */
export async function backfillPendingEvents(limit = 50) {
  const pending = (
    await db
      .select({ uri: trackedEvent.uri })
      .from(trackedEvent)
      .where(isNull(trackedEvent.backfilledAt))
      .limit(limit)
  ).map((p) => p.uri)
  if (pending.length === 0) return []

  let remaining = pending
  if (hasArchiveAccess && !(await scanTooSlow())) {
    try {
      if (await backfillFromJetstream(pending)) {
        await markBackfilled(pending)
        return pending
      }
    } catch (err) {
      console.error('jetstream archive backfill failed', err)
    }
  }

  // Constellation is cheap per event, so cap how many one cycle takes on
  remaining = pending.slice(0, 5)
  for (const uri of remaining) {
    try {
      await backfillFromConstellation(uri)
      await markBackfilled([uri])
    } catch (err) {
      console.error('event backfill failed', uri, err)
    }
  }
  return remaining
}
