import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEventRsvp } from '@/app/_actions/create-event-rsvp'
import { deleteInvitation } from '@/app/_actions/delete-invitation'
import { removeEventRsvp } from '@/app/_actions/remove-event-rsvp'
import { runIngestCycle } from '@/lib/atproto/sync'
import { collect, type JetstreamCommit } from '@/lib/atproto/jetstream'
import { getStoredRecord } from '@/lib/atproto/records'
import { db } from '@/lib/db/client'
import { record } from '@/lib/db/schema'

import type { FakeAccount } from '../support/fake-atproto'
import {
  INVITATION,
  RSVP,
  seedEvent,
  seedInvitation,
  type Ref,
} from '../support/fixtures'
import { form, signIn } from '../support/helpers'
import { world } from '../support/world'

// Jetstream is a WebSocket service, so its stream is stubbed; the app's own
// handling of what arrives is what's tested
vi.mock('@/lib/atproto/jetstream', () => ({
  collect: vi.fn(),
  hasArchiveAccess: false,
}))

let alice: FakeAccount // invited
let bob: FakeAccount // hosts and invites
let carol: FakeAccount // a bystander
let event: Ref
let invitation: Ref

beforeEach(async () => {
  vi.mocked(collect).mockReset()
  alice = await world.network.addAccount({
    handle: 'alice.test',
    displayName: 'Alice',
  })
  bob = await world.network.addAccount({
    handle: 'bob.test',
    displayName: 'Bob',
  })
  carol = await world.network.addAccount({
    handle: 'carol.test',
    displayName: 'Carol',
  })
  event = await seedEvent(bob, { name: "Bob's party" })
  invitation = await seedInvitation(bob, event, alice)
})

const stored = async () =>
  (await db.select().from(record)).filter((r) => r.collection === RSVP)

const respond = (
  status: string,
  over: { event?: Ref; invitation?: Ref | null } = {}
) => {
  const inv = over.invitation === undefined ? invitation : over.invitation
  const ev = over.event ?? event
  return createEventRsvp(
    form({
      status,
      eventUri: ev.uri,
      eventCid: ev.cid,
      invitationUri: inv?.uri,
      invitationCid: inv?.cid,
    })
  )
}

describe('Flow: your RSVP to an invitation is stored right away', () => {
  beforeEach(() => signIn(alice.did))

  it('stores an RSVP made through the invitation link', async () => {
    await respond('going')

    const [mine] = world.network.list(alice.did, RSVP)
    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      uri: mine.uri,
      did: alice.did,
      collection: RSVP,
      rkey: mine.rkey,
      cid: mine.cid,
    })
    expect(rows[0].value).toMatchObject({
      status: `${RSVP}#going`,
      subject: { uri: event.uri },
      invitation: { uri: invitation.uri, cid: invitation.cid },
    })
  })

  it('does not store an RSVP that answers no invitation', async () => {
    await respond('going', { invitation: null })

    expect(world.network.list(alice.did, RSVP)).toHaveLength(1)
    expect(await stored()).toEqual([])
  })

  it('keeps the stored copy in step when you change your response', async () => {
    await respond('going')
    await respond('notgoing')

    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toMatchObject({ status: `${RSVP}#notgoing` })
  })

  it('keeps it stored when you change your response from the event page, which leaves the invitation on the record', async () => {
    await respond('going')
    await respond('interested', { invitation: null })

    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toMatchObject({
      status: `${RSVP}#interested`,
      invitation: { uri: invitation.uri },
    })
  })

  it('starts storing an RSVP you gave from the event page once you answer through the invitation', async () => {
    await respond('going', { invitation: null })
    expect(await stored()).toEqual([])

    await respond('going')

    expect(await stored()).toHaveLength(1)
  })

  it('removes the stored copy when you remove your RSVP', async () => {
    await respond('going')
    await removeEventRsvp(form({ eventUri: event.uri }))

    expect(world.network.list(alice.did, RSVP)).toHaveLength(0)
    expect(await stored()).toEqual([])
  })

  it('has nothing to do when you remove an RSVP that was never stored', async () => {
    await respond('going', { invitation: null })
    await removeEventRsvp(form({ eventUri: event.uri }))

    expect(await stored()).toEqual([])
  })
})

describe('Flow: only RSVPs that really answer a known invitation are stored', () => {
  it('ignores a reference to an invitation this app has never seen', async () => {
    await signIn(alice.did)
    const unseen = await world.network.create(bob.did, INVITATION, {
      $type: INVITATION,
      subject: { uri: event.uri, cid: event.cid },
      recipient: alice.did,
      createdAt: new Date().toISOString(),
    })

    await respond('going', { invitation: unseen })

    expect(world.network.list(alice.did, RSVP)).toHaveLength(1)
    expect(await stored()).toEqual([])
  })

  it('ignores an RSVP from someone the invitation was not sent to', async () => {
    await signIn(carol.did)

    await respond('going')

    expect(world.network.list(carol.did, RSVP)).toHaveLength(1)
    expect(await stored()).toEqual([])
  })

  it('ignores an RSVP to a different event than the invitation is for', async () => {
    await signIn(alice.did)
    const other = await seedEvent(bob, { name: 'Another party' })

    await respond('going', { event: other })

    expect(await stored()).toEqual([])
  })

  it('ignores a reference to something that is not an invitation', async () => {
    await signIn(alice.did)

    await respond('going', { invitation: event })

    expect(await stored()).toEqual([])
  })
})

describe('Flow: deleting an invitation', () => {
  it('removes the RSVPs stored against it, which no longer answer a known invitation', async () => {
    await signIn(alice.did)
    await respond('going')
    const other = await seedInvitation(bob, event, carol)
    const second = await seedEvent(bob, { name: 'Second' })
    const secondInvitation = await seedInvitation(bob, second, alice)
    await respond('going', { event: second, invitation: secondInvitation })
    expect(await stored()).toHaveLength(2)

    await signIn(bob.did)
    await deleteInvitation(form({ rkey: invitation.rkey }))

    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toMatchObject({ subject: { uri: second.uri } })
    expect(await getStoredRecord(other.uri)).not.toBeNull()
    // the RSVP itself is still alice's, on her PDS
    expect(world.network.list(alice.did, RSVP)).toHaveLength(2)
  })
})

describe('Flow: RSVPs staying in sync with the network', () => {
  const rsvpValue = (over: Record<string, unknown> = {}) => ({
    $type: RSVP,
    subject: { uri: event.uri, cid: event.cid },
    invitation: { uri: invitation.uri, cid: invitation.cid },
    status: `${RSVP}#going`,
    ...over,
  })
  const rsvpUri = (who: FakeAccount, rkey = '3rsvpaaaaaaaa') =>
    `at://${who.did}/${RSVP}/${rkey}`

  const commit = (
    who: FakeAccount,
    seq: number,
    over: Partial<JetstreamCommit> = {}
  ): JetstreamCommit => ({
    did: who.did,
    seq: BigInt(seq),
    collection: RSVP,
    rkey: '3rsvpaaaaaaaa',
    operation: 'create',
    cid: event.cid,
    record: rsvpValue(),
    ...over,
  })
  const del = (who: FakeAccount, seq: number) =>
    commit(who, seq, {
      operation: 'delete',
      cid: undefined,
      record: undefined,
    })
  const stream = (...commits: JetstreamCommit[]) =>
    vi
      .mocked(collect)
      .mockResolvedValueOnce({ commits, lastSeq: commits.at(-1)?.seq })

  it('stores an RSVP made elsewhere that answers a known invitation', async () => {
    stream(commit(alice, 10))

    const { changed } = await runIngestCycle()

    expect(changed).toEqual([rsvpUri(alice)])
    const row = await getStoredRecord(rsvpUri(alice))
    expect(row?.value).toMatchObject({ status: `${RSVP}#going` })
    expect(row?.seq).toBe(BigInt(10))
  })

  it('leaves out RSVPs that answer no invitation, as most of them do', async () => {
    stream(commit(alice, 10, { record: rsvpValue({ invitation: undefined }) }))

    const { events, changed } = await runIngestCycle()

    expect(events).toBe(1)
    expect(changed).toEqual([])
    expect(await stored()).toEqual([])
  })

  it('leaves out an RSVP whose invitation is unknown, from the wrong person, or for another event', async () => {
    const other = await seedEvent(bob, { name: 'Another' })
    stream(
      commit(alice, 10, {
        rkey: '3rsvpaaaaaaa1',
        record: rsvpValue({
          invitation: {
            uri: `at://${bob.did}/${INVITATION}/3nothere`,
            cid: event.cid,
          },
        }),
      }),
      commit(carol, 11),
      commit(alice, 12, {
        rkey: '3rsvpaaaaaaa3',
        record: rsvpValue({ subject: { uri: other.uri, cid: other.cid } }),
      })
    )

    const { changed } = await runIngestCycle()

    expect(changed).toEqual([])
    expect(await stored()).toEqual([])
  })

  it('applies an edit to a stored RSVP', async () => {
    stream(commit(alice, 10))
    await runIngestCycle()

    stream(
      commit(alice, 20, {
        operation: 'update',
        record: rsvpValue({ status: `${RSVP}#interested` }),
      })
    )
    await runIngestCycle()

    expect((await getStoredRecord(rsvpUri(alice)))?.value).toMatchObject({
      status: `${RSVP}#interested`,
    })
  })

  it('drops a stored RSVP that is edited to no longer answer the invitation', async () => {
    stream(commit(alice, 10))
    await runIngestCycle()

    stream(
      commit(alice, 20, {
        operation: 'update',
        record: rsvpValue({ invitation: undefined }),
      })
    )
    const { changed } = await runIngestCycle()

    expect(changed).toEqual([rsvpUri(alice)])
    expect(await stored()).toEqual([])
  })

  it('removes a stored RSVP that was deleted, and says nothing about deleting one it never kept', async () => {
    stream(commit(alice, 10))
    await runIngestCycle()

    stream(del(alice, 20), del(carol, 21))
    const { changed } = await runIngestCycle()

    expect(changed).toEqual([rsvpUri(alice)])
    expect(await stored()).toEqual([])
  })

  it('does not let an older event overwrite a newer one', async () => {
    stream(
      commit(alice, 20, { record: rsvpValue({ status: `${RSVP}#interested` }) })
    )
    await runIngestCycle()

    stream(commit(alice, 10))
    await runIngestCycle()

    expect((await getStoredRecord(rsvpUri(alice)))?.value).toMatchObject({
      status: `${RSVP}#interested`,
    })
  })

  it('agrees with what the app stored itself, replacing it with the network copy', async () => {
    await signIn(alice.did)
    await respond('going')
    const [mine] = world.network.list(alice.did, RSVP)

    stream(
      commit(alice, 30, {
        rkey: mine.rkey,
        cid: mine.cid,
        record: mine.value as Record<string, unknown>,
      })
    )
    await runIngestCycle()

    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(rows[0].seq).toBe(BigInt(30))
  })

  it('removes stored RSVPs along with their invitation when it is deleted elsewhere', async () => {
    stream(commit(alice, 10))
    await runIngestCycle()
    const rsvpToo = rsvpUri(alice)

    stream({
      did: bob.did,
      seq: BigInt(20),
      collection: INVITATION,
      rkey: invitation.rkey,
      operation: 'delete',
    })
    const { changed } = await runIngestCycle()

    expect(changed.sort()).toEqual([invitation.uri, rsvpToo].sort())
    expect(await getStoredRecord(invitation.uri)).toBeNull()
    expect(await stored()).toEqual([])
  })
})
