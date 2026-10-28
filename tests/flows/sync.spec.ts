import { revalidateTag } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as cron } from '@/app/api/cron/ingest/route'
import { collect, type JetstreamCommit } from '@/lib/atproto/jetstream'
import { runIngestCycle } from '@/lib/atproto/ingest'
import {
  getStoredRecord,
  listInvitationsBy,
  upsertRecord,
} from '@/lib/atproto/records'
import { db } from '@/lib/db/client'
import { ingestCursor } from '@/lib/db/schema'

import { INVITATION } from '../support/fixtures'

// Jetstream is a WebSocket service, so the stream of invitation changes is
// stubbed here; everything that happens to those changes is the app's own code.
vi.mock('@/lib/atproto/jetstream', () => ({
  collect: vi.fn(),
  hasArchiveAccess: false,
}))

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const cid = (n: number) =>
  `bafyreihykrqz27n6uundgzqpt7rd3m5fbq2hprk53pbwbol5wuvommicb${n}`
const uriOf = (rkey: string) => `at://${did}/${INVITATION}/${rkey}`

const invitation = (note: string) => ({
  $type: INVITATION,
  subject: {
    uri: `at://${did}/community.lexicon.calendar.event/3aaaaaaaaaaaa`,
    cid: cid(1),
  },
  recipient: did,
  createdAt: '2026-10-28T00:00:00.000Z',
  note,
})

const commit = (
  over: Omit<Partial<JetstreamCommit>, 'seq'> & { rkey: string; seq: number }
): JetstreamCommit => ({
  did,
  collection: INVITATION,
  operation: 'create',
  cid: cid(1),
  record: invitation('v1'),
  ...over,
  seq: BigInt(over.seq),
})

/** Make the next cycle receive these commits */
const stream = (commits: JetstreamCommit[], lastSeq = commits.at(-1)?.seq) =>
  vi.mocked(collect).mockResolvedValueOnce({ commits, lastSeq })

const valueOf = async (rkey: string) =>
  (await getStoredRecord(uriOf(rkey)))?.value as { note?: string } | undefined
const savedCursor = async () => (await db.select().from(ingestCursor))[0]?.seq

beforeEach(() => {
  vi.mocked(collect).mockReset()
})

describe('Flow: invitations staying in sync with the network', () => {
  it('stores an invitation created anywhere, so its link works here', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 100 })])

    const { events, changed } = await runIngestCycle()

    expect(events).toBe(1)
    expect(changed).toEqual([uriOf('3bbbbbbbbbbbb')])
    expect(await valueOf('3bbbbbbbbbbbb')).toMatchObject({ note: 'v1' })
    expect((await getStoredRecord(uriOf('3bbbbbbbbbbbb')))?.seq).toBe(
      BigInt(100)
    )
  })

  it('applies a later edit to an invitation', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 100 })])
    await runIngestCycle()

    stream([
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 200,
        operation: 'update',
        cid: cid(2),
        record: invitation('v2'),
      }),
    ])
    await runIngestCycle()

    expect(await valueOf('3bbbbbbbbbbbb')).toMatchObject({ note: 'v2' })
    expect((await getStoredRecord(uriOf('3bbbbbbbbbbbb')))?.cid).toBe(cid(2))
  })

  it('removes an invitation that was deleted', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 100 })])
    await runIngestCycle()

    stream([
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 200,
        operation: 'delete',
        cid: undefined,
        record: undefined,
      }),
    ])
    const { changed } = await runIngestCycle()

    expect(await getStoredRecord(uriOf('3bbbbbbbbbbbb'))).toBeNull()
    expect(changed).toEqual([uriOf('3bbbbbbbbbbbb')])
  })

  it('applies a batch in order: created then deleted in one batch leaves nothing', async () => {
    stream([
      commit({ rkey: '3bbbbbbbbbbbb', seq: 100 }),
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 101,
        operation: 'delete',
        cid: undefined,
        record: undefined,
      }),
    ])

    await runIngestCycle()

    expect(await getStoredRecord(uriOf('3bbbbbbbbbbbb'))).toBeNull()
  })

  it('ignores an older event that arrives after a newer one (a replay or overlap)', async () => {
    stream([
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 200,
        record: invitation('newer'),
        cid: cid(2),
      }),
    ])
    await runIngestCycle()

    stream([
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 100,
        record: invitation('older'),
        cid: cid(1),
      }),
    ])
    await runIngestCycle()

    expect(await valueOf('3bbbbbbbbbbbb')).toMatchObject({ note: 'newer' })
    expect((await getStoredRecord(uriOf('3bbbbbbbbbbbb')))?.seq).toBe(
      BigInt(200)
    )
  })

  it('replaces an invitation the app saved itself, which has no event number yet', async () => {
    await upsertRecord(
      uriOf('3bbbbbbbbbbbb'),
      cid(1),
      invitation('saved by the app')
    )
    expect((await getStoredRecord(uriOf('3bbbbbbbbbbbb')))?.seq).toBeNull()

    stream([
      commit({
        rkey: '3bbbbbbbbbbbb',
        seq: 100,
        record: invitation('from the network'),
        cid: cid(2),
      }),
    ])
    await runIngestCycle()

    expect(await valueOf('3bbbbbbbbbbbb')).toMatchObject({
      note: 'from the network',
    })
  })

  it('skips a change that carries no record, rather than storing nothing', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 100, record: undefined })])

    const { changed } = await runIngestCycle()

    expect(changed).toEqual([])
    expect(await listInvitationsBy(did)).toHaveLength(0)
  })

  it('keeps invitations from different authors apart', async () => {
    const other = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb'
    stream([
      commit({ rkey: '3bbbbbbbbbbbb', seq: 100 }),
      commit({ rkey: '3bbbbbbbbbbbb', seq: 101, did: other }),
    ])

    await runIngestCycle()

    expect(await listInvitationsBy(did)).toHaveLength(1)
    expect(await listInvitationsBy(other)).toHaveLength(1)
  })
})

describe('Flow: picking up where the last sync left off', () => {
  it('starts from the beginning when it has never run, then remembers how far it got', async () => {
    stream([
      commit({ rkey: '3bbbbbbbbbbbb', seq: 100 }),
      commit({ rkey: '3cccccccccccc', seq: 150 }),
    ])

    await runIngestCycle()

    expect(vi.mocked(collect).mock.calls[0][0].cursor).toBeUndefined()
    expect(await savedCursor()).toBe(BigInt(150))
  })

  it('resumes from the saved position on the next run', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 150 })])
    await runIngestCycle()

    stream([])
    await runIngestCycle()

    expect(vi.mocked(collect).mock.calls[1][0].cursor).toBe(BigInt(150))
  })

  it('does not move the saved position when nothing new arrived', async () => {
    stream([commit({ rkey: '3bbbbbbbbbbbb', seq: 150 })])
    await runIngestCycle()

    stream([], undefined)
    await runIngestCycle()

    expect(await savedCursor()).toBe(BigInt(150))
  })
})

describe('Flow: the scheduled sync', () => {
  const request = (authorization?: string) =>
    cron(
      new Request('http://127.0.0.1:3000/api/cron/ingest', {
        headers: authorization ? { authorization } : {},
      })
    )

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  it('refuses anyone without the secret, and runs nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 's3cret', 'Bearer']) {
      expect((await request(header)).status).toBe(401)
    }
    expect(collect).not.toHaveBeenCalled()
  })

  it('refuses everyone when no secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    expect((await request('Bearer ')).status).toBe(401)
  })

  it('runs a sync for the right secret, and reports what happened', async () => {
    stream([
      commit({ rkey: '3bbbbbbbbbbbb', seq: 100 }),
      commit({ rkey: '3cccccccccccc', seq: 101 }),
    ])

    const res = await request('Bearer s3cret')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ events: 2, changed: 2 })
    expect(await listInvitationsBy(did)).toHaveLength(2)
  })

  it('refreshes the cached page of every invitation that changed, so visitors see the change', async () => {
    stream([
      commit({ rkey: '3bbbbbbbbbbbb', seq: 100 }),
      commit({
        rkey: '3cccccccccccc',
        seq: 101,
        operation: 'delete',
        cid: undefined,
        record: undefined,
      }),
    ])

    await request('Bearer s3cret')

    expect(revalidateTag).toHaveBeenCalledWith(
      `record:${uriOf('3bbbbbbbbbbbb')}`,
      'max'
    )
    expect(revalidateTag).toHaveBeenCalledWith(
      `record:${uriOf('3cccccccccccc')}`,
      'max'
    )
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })
})
