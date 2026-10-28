import 'server-only'

import { Jetstream } from '@bsky/jetstream'

import { COLLECTIONS, RSVP } from './collections'

export type JetstreamCommit = {
  did: string
  seq: bigint
  operation: 'create' | 'update' | 'delete'
  collection: string
  rkey: string
  cid?: string
  record?: Record<string, unknown>
}

const JETSTREAM_URL =
  process.env.JETSTREAM_URL ?? 'https://jetstream.us-east.bsky.network'

/** Replay and snapshot (the archive) need an API token; the live tail doesn't */
export const hasArchiveAccess = !!process.env.JETSTREAM_API_TOKEN

function client() {
  return new Jetstream({
    service: JETSTREAM_URL,
    apiKey: process.env.JETSTREAM_API_TOKEN || undefined,
  })
}

// Raw (wire JSON) commit events from live(), replay() and snapshot()
type RawCommitEvent = {
  kind: string
  did: string
  seq: number
  commit?: {
    operation: 'create' | 'update' | 'delete'
    collection: string
    rkey: string
    cid?: unknown
    record?: unknown
  }
}

function toCommit(evt: RawCommitEvent): JetstreamCommit | null {
  const c = evt.commit
  if (evt.kind !== 'commit' || !c) return null
  return {
    did: evt.did,
    seq: BigInt(evt.seq),
    operation: c.operation,
    collection: c.collection,
    rkey: c.rkey,
    ...(c.operation === 'delete'
      ? {}
      : {
          cid: String(c.cid),
          record: c.record as Record<string, unknown>,
        }),
  }
}

/**
 * Collect commits for our collections after `cursor` (a v2 `seq`) until
 * `durationMs` elapses or `maxEvents` is reached. With an API token this uses
 * replay(): the archive from the cursor, handing off to the live tail without
 * a gap, so downtime between cycles is recovered. Without one it follows the
 * live tail only. Returns the commits and the newest `seq` seen.
 */
export async function collect(opts: {
  cursor?: bigint
  durationMs: number
  maxEvents: number
}): Promise<{ commits: JetstreamCommit[]; lastSeq?: bigint }> {
  const js = client()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), opts.durationMs)

  const commits: JetstreamCommit[] = []
  let lastSeq: bigint | undefined

  const common = {
    collections: [...COLLECTIONS],
    kinds: ['commit' as const],
    // wire JSON ({$link} / {$bytes}), which is what we store as jsonb
    raw: true as const,
    signal: abort.signal,
    // e.g. OutdatedCursor when the saved seq has aged out of retention
    onInfo: (info: { name: string; message?: string }) =>
      console.warn('[jetstream]', info.name, info.message),
  }

  try {
    // First run with an archive token starts from the beginning of history
    const stream = hasArchiveAccess
      ? js.replay({ ...common, afterSeq: Number(opts.cursor ?? 0) })
      : js.live({
          ...common,
          // We persist the cursor ourselves after applying the batch
          cursor: {
            load: async () =>
              opts.cursor === undefined ? undefined : Number(opts.cursor),
            save: async () => {},
          },
        })
    for await (const evt of stream) {
      const commit = toCommit(evt as unknown as RawCommitEvent)
      if (!commit) continue
      lastSeq = commit.seq
      commits.push(commit)
      if (commits.length >= opts.maxEvents) break
    }
  } catch (err) {
    // The time budget elapsing aborts the stream; anything else is a real failure
    if (!abort.signal.aborted && commits.length === 0) throw err
  } finally {
    clearTimeout(timer)
  }

  return { commits, lastSeq }
}

/**
 * Scan the sealed RSVP archive for RSVPs whose subject is one of `eventUris`.
 * Returns what it found and whether the scan reached the end of the archive
 * within `durationMs`.
 */
export async function scanRsvps(
  eventUris: Set<string>,
  durationMs: number
): Promise<{ commits: JetstreamCommit[]; completed: boolean }> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), durationMs)
  const commits: JetstreamCommit[] = []
  let completed = false

  try {
    for await (const evt of client().snapshot({
      collections: [RSVP],
      kinds: ['commit'],
      raw: true,
      signal: abort.signal,
    })) {
      const commit = toCommit(evt as unknown as RawCommitEvent)
      if (commit?.operation === 'delete' || !commit?.record) continue
      const subject = (commit.record as { subject?: { uri?: string } }).subject
      if (subject?.uri && eventUris.has(subject.uri)) commits.push(commit)
    }
    completed = true
  } catch (err) {
    if (!abort.signal.aborted) throw err
  } finally {
    clearTimeout(timer)
  }
  return { commits, completed }
}
