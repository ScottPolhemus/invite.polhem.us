import 'server-only'

import { Jetstream, parseRawRecord } from '@bsky/jetstream'
import { lexToJson } from '@atproto/lex'

import { INVITATION } from './collections'

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

  const base = {
    did: evt.did,
    seq: BigInt(evt.seq),
    operation: c.operation,
    collection: c.collection,
    rkey: c.rkey,
  }
  if (c.operation === 'delete') return base

  try {
    return {
      ...base,
      cid: String(c.cid),
      // live yields wire JSON but replay/snapshot yield DAG-CBOR bytes;
      // normalize both to the JSON we store ({$link}/{$bytes} form)
      record: lexToJson(
        parseRawRecord(c.record as Parameters<typeof parseRawRecord>[0])
      ) as Record<string, unknown>,
    }
  } catch (err) {
    // One malformed record shouldn't fail the whole cycle
    console.warn('[jetstream] skipping undecodable record', base.did, err)
    return null
  }
}

/**
 * Collect invitation commits after `cursor` (a v2 `seq`) until
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
    collections: [INVITATION] as const,
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
