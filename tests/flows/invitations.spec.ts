import { updateTag } from 'next/cache'
import { beforeEach, describe, expect, it } from 'vitest'

import { createInvitation } from '@/app/_actions/create-invitation'
import { deleteInvitation } from '@/app/_actions/delete-invitation'
import { updateInvitation } from '@/app/_actions/update-invitation'
import { backfill } from '@/lib/atproto/backfill'
import {
  getInvitationRecord,
  getStoredRecord,
  listInvitationsBy,
} from '@/lib/atproto/records'

import type { FakeAccount } from '../support/fake-atproto'
import {
  EVENT,
  INVITATION,
  daysFromNow,
  seedEvent,
  seedInvitation,
  seedRsvp,
} from '../support/fixtures'
import {
  form,
  redirectOf,
  signIn,
  signInWithExpiredSession,
} from '../support/helpers'
import { world } from '../support/world'

let alice: FakeAccount // the inviter
let bob: FakeAccount // hosts the event
let carol: FakeAccount // the person invited
let event: Awaited<ReturnType<typeof seedEvent>>

beforeEach(async () => {
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
})

const mine = () => world.network.list(alice.did, INVITATION)

describe('Flow: inviting someone to an event', () => {
  beforeEach(() => signIn(alice.did))

  it("writes the invitation to the inviter's PDS and takes them to its shareable link", async () => {
    const target = await redirectOf(() =>
      createInvitation(
        form({
          eventUri: event.uri,
          recipient: 'carol.test',
          description: 'Come along!',
        })
      )
    )

    expect(mine()).toHaveLength(1)
    expect(target).toBe(`/invitation/${alice.did}/${mine()[0].rkey}`)
    expect(mine()[0].value).toMatchObject({
      $type: INVITATION,
      // the event is someone else's, and the reference carries its real cid
      subject: { uri: event.uri, cid: event.cid },
      recipient: carol.did,
      description: { text: { markdown: 'Come along!' } },
    })
    expect(Number.isNaN(Date.parse(String(mine()[0].value.createdAt)))).toBe(
      false
    )
  })

  it('stores it in the database straight away, so the link works before the network catches up', async () => {
    await redirectOf(() =>
      createInvitation(form({ eventUri: event.uri, recipient: 'carol.test' }))
    )

    const rows = await listInvitationsBy(alice.did)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ uri: mine()[0].uri, cid: mine()[0].cid })
  })

  it('accepts the recipient as a handle, a handle with @, or a DID', async () => {
    for (const recipient of ['carol.test', '@carol.test', carol.did])
      await redirectOf(() =>
        createInvitation(form({ eventUri: event.uri, recipient }))
      )

    expect(mine().map((i) => i.value.recipient)).toEqual([
      carol.did,
      carol.did,
      carol.did,
    ])
  })

  it('leaves the message out when there is none', async () => {
    await redirectOf(() =>
      createInvitation(
        form({
          eventUri: event.uri,
          recipient: 'carol.test',
          description: '   ',
        })
      )
    )

    expect(mine()[0].value).not.toHaveProperty('description')
  })

  it("takes the event's identity from its author's PDS, not from the form", async () => {
    await redirectOf(() =>
      createInvitation(
        form({
          eventUri: event.uri,
          recipient: 'carol.test',
          eventCid: 'bafyforged',
          cid: 'bafyforged',
        })
      )
    )

    expect((mine()[0].value.subject as { cid: string }).cid).toBe(event.cid)
  })

  it('does not stamp invitations as made with this app (only events and RSVPs are)', async () => {
    await redirectOf(() =>
      createInvitation(form({ eventUri: event.uri, recipient: 'carol.test' }))
    )

    expect(mine()[0].value).not.toHaveProperty('createdWith')
  })

  it.each([
    ['no recipient', () => ({ recipient: '' }), 'recipient'],
    [
      'a recipient that does not exist',
      () => ({ recipient: 'nobody.test' }),
      'recipient',
    ],
    [
      'an event that is not an address',
      () => ({ eventUri: 'not a uri' }),
      'event',
    ],
    [
      'an event that does not exist',
      () => ({ eventUri: `at://${bob.did}/${EVENT}/3aaaaaaaaaaaa` }),
      'event',
    ],
  ])(
    'sends you back to the form, writing nothing, for %s',
    async (_, bad, error) => {
      expect(
        await redirectOf(() =>
          createInvitation(
            form({ eventUri: event.uri, recipient: 'carol.test', ...bad() })
          )
        )
      ).toBe(`/invitation/new?error=${error}`)

      expect(world.network.writes).toHaveLength(0)
      expect(await listInvitationsBy(alice.did)).toHaveLength(0)
    }
  )

  it('only accepts calendar events as the thing you invite someone to', async () => {
    const rsvp = await seedRsvp(carol, event, 'going')

    expect(
      await redirectOf(() =>
        createInvitation(form({ eventUri: rsvp.uri, recipient: 'carol.test' }))
      )
    ).toBe('/invitation/new?error=event')
    expect(world.network.writes).toHaveLength(0)
  })

  it('returns errors to the page the form was on (an event page), not the new-invitation page', async () => {
    const returnTo = `/event/${bob.did}/${event.rkey}`

    expect(
      await redirectOf(() =>
        createInvitation(form({ eventUri: event.uri, recipient: '', returnTo }))
      )
    ).toBe(`${returnTo}?error=recipient#invite`)
  })

  it('ignores a return address on another site', async () => {
    expect(
      await redirectOf(() =>
        createInvitation(
          form({
            eventUri: event.uri,
            recipient: '',
            returnTo: 'https://evil.example/x',
          })
        )
      )
    ).toBe('/invitation/new?error=recipient')
  })

  it('asks you to sign in when signed out or when your sign-in has expired', async () => {
    const attempt = () =>
      createInvitation(form({ eventUri: event.uri, recipient: 'carol.test' }))
    world.cookies.clear()
    expect(await redirectOf(attempt)).toBe('/invitation/new?error=auth')

    world.oauthSessions.clear() // the sign-in expires on the server
    await signInWithExpiredSession(alice.did)
    expect(await redirectOf(attempt)).toBe('/invitation/new?error=auth')

    expect(world.network.writes).toHaveLength(0)
  })
})

describe("Flow: editing an invitation's message", () => {
  let invitation: Awaited<ReturnType<typeof seedInvitation>>
  const stored = () =>
    world.network.get(alice.did, INVITATION, invitation.rkey)!.value

  beforeEach(async () => {
    invitation = await seedInvitation(alice, event, carol, {
      description: { text: { markdown: 'Old message' }, flavor: 'gfm' },
      someOtherAppsField: { keep: true },
    })
    await signIn(alice.did)
  })

  it('updates the message in place, keeping the same link, and takes you back to the invitation', async () => {
    const target = await redirectOf(() =>
      updateInvitation(
        form({ rkey: invitation.rkey, description: 'A new message' })
      )
    )

    expect(target).toBe(`/invitation/${alice.did}/${invitation.rkey}`)
    expect(stored()).toMatchObject({
      description: { text: { markdown: 'A new message' } },
    })
    expect(updateTag).toHaveBeenCalledWith(`record:${invitation.uri}`)
  })

  it('updates the database as well, so the page shows the change straight away', async () => {
    await redirectOf(() =>
      updateInvitation(
        form({ rkey: invitation.rkey, description: 'A new message' })
      )
    )

    const row = await getStoredRecord(invitation.uri)
    expect(row?.value).toMatchObject({
      description: { text: { markdown: 'A new message' } },
    })
    expect(row?.cid).toBe(
      world.network.get(alice.did, INVITATION, invitation.rkey)!.cid
    )
  })

  it('changes nothing but the message, even if the form claims a different event or recipient', async () => {
    const other = await seedEvent(bob, { name: 'Another event' })
    const before = stored()

    await redirectOf(() =>
      updateInvitation(
        form({
          rkey: invitation.rkey,
          description: 'A new message',
          recipient: alice.did,
          eventUri: other.uri,
          eventCid: other.cid,
          createdAt: '1999-01-01T00:00:00.000Z',
        })
      )
    )

    expect(stored()).toEqual({
      ...before,
      description: { text: { markdown: 'A new message' }, flavor: 'gfm' },
    })
    expect(stored().recipient).toBe(carol.did)
    expect((stored().subject as { uri: string }).uri).toBe(event.uri)
  })

  it('keeps fields it does not know about, and extra markdown settings', async () => {
    await redirectOf(() =>
      updateInvitation(form({ rkey: invitation.rkey, description: 'Changed' }))
    )

    expect(stored().someOtherAppsField).toEqual({ keep: true })
    expect((stored().description as { flavor: string }).flavor).toBe('gfm')
  })

  it('removes the message when you clear it', async () => {
    await redirectOf(() =>
      updateInvitation(form({ rkey: invitation.rkey, description: '  ' }))
    )

    expect(stored()).not.toHaveProperty('description')
  })

  it('says the invitation is gone if it was deleted in the meantime', async () => {
    await world.network.resetRepos()

    expect(
      await redirectOf(() =>
        updateInvitation(form({ rkey: invitation.rkey, description: 'x' }))
      )
    ).toBe(`/invitation/${alice.did}/${invitation.rkey}/edit?error=missing`)
  })

  it("never touches someone else's invitation", async () => {
    world.cookies.clear()
    world.oauthSessions.clear()
    await signIn(bob.did)
    const before = stored()

    expect(
      await redirectOf(() =>
        updateInvitation(
          form({ rkey: invitation.rkey, description: 'Hijacked' })
        )
      )
    ).toBe(`/invitation/${bob.did}/${invitation.rkey}/edit?error=missing`)
    expect(stored()).toEqual(before)
    expect(world.network.writes).toHaveLength(0)
  })

  it('goes to the home page when you are not signed in', async () => {
    world.cookies.clear()

    expect(
      await redirectOf(() =>
        updateInvitation(form({ rkey: invitation.rkey, description: 'x' }))
      )
    ).toBe('/')
  })
})

describe('Flow: deleting an invitation', () => {
  let invitation: Awaited<ReturnType<typeof seedInvitation>>

  beforeEach(async () => {
    invitation = await seedInvitation(alice, event, carol)
    await signIn(alice.did)
  })

  it('removes it from your PDS and the database, refreshes the page, and returns where you ask', async () => {
    expect(
      await redirectOf(() =>
        deleteInvitation(form({ rkey: invitation.rkey, next: '/' }))
      )
    ).toBe('/')

    expect(
      world.network.get(alice.did, INVITATION, invitation.rkey)
    ).toBeUndefined()
    expect(await getStoredRecord(invitation.uri)).toBeNull()
    expect(updateTag).toHaveBeenCalledWith(`record:${invitation.uri}`)
  })

  it('leaves your other invitations alone', async () => {
    const other = await seedInvitation(alice, event, bob)

    await redirectOf(() =>
      deleteInvitation(form({ rkey: invitation.rkey, next: '/' }))
    )

    expect((await listInvitationsBy(alice.did)).map((r) => r.uri)).toEqual([
      other.uri,
    ])
    expect(world.network.get(alice.did, INVITATION, other.rkey)).toBeDefined()
  })

  it("leaves someone else's invitation alone", async () => {
    world.cookies.clear()
    world.oauthSessions.clear()
    await signIn(bob.did)

    await deleteInvitation(form({ rkey: invitation.rkey }))

    expect(
      world.network.get(alice.did, INVITATION, invitation.rkey)
    ).toBeDefined()
    expect(await getStoredRecord(invitation.uri)).not.toBeNull()
  })

  it('does nothing when signed out or when the sign-in has expired', async () => {
    world.cookies.clear()
    await deleteInvitation(form({ rkey: invitation.rkey }))
    world.oauthSessions.clear()
    await signInWithExpiredSession(alice.did)
    await deleteInvitation(form({ rkey: invitation.rkey }))

    expect(
      world.network.get(alice.did, INVITATION, invitation.rkey)
    ).toBeDefined()
  })
})

describe('Flow: opening and listing invitations', () => {
  it('finds an invitation in the database', async () => {
    const invitation = await seedInvitation(alice, event, carol)
    world.network.requests = []

    const found = await getInvitationRecord(alice.did, invitation.rkey)

    expect(found?.uri).toBe(invitation.uri)
    expect(world.network.requests).toEqual([]) // no trip to the PDS
  })

  it('fetches an invitation it has never seen from its author’s PDS, and keeps it', async () => {
    const value = {
      $type: INVITATION,
      subject: { uri: event.uri, cid: event.cid },
      recipient: carol.did,
      createdAt: daysFromNow(-1),
    }
    const created = await world.network.create(alice.did, INVITATION, value)
    expect(await getStoredRecord(created.uri)).toBeNull()

    const found = await getInvitationRecord(alice.did, created.rkey)

    expect(found).toMatchObject({ uri: created.uri, cid: created.cid })
    expect(await getStoredRecord(created.uri)).not.toBeNull()
  })

  it('reports an invitation that does not exist', async () => {
    expect(await getInvitationRecord(alice.did, '3aaaaaaaaaaaa')).toBeNull()
  })

  it("lists only the author's invitations, newest first", async () => {
    const first = await seedInvitation(alice, event, carol)
    const second = await seedInvitation(alice, event, bob)
    await seedInvitation(bob, event, carol) // someone else's

    expect((await listInvitationsBy(alice.did)).map((r) => r.uri)).toEqual([
      second.uri,
      first.uri,
    ])
  })

  it('pulls in every invitation an account has, however many pages that takes', async () => {
    for (let i = 0; i < 130; i++)
      await world.network.create(alice.did, INVITATION, {
        $type: INVITATION,
        subject: { uri: event.uri, cid: event.cid },
        recipient: carol.did,
        createdAt: daysFromNow(-i),
      })

    expect(await backfill(alice.did as never)).toBe(130)
    expect(await listInvitationsBy(alice.did)).toHaveLength(130)
  })
})
