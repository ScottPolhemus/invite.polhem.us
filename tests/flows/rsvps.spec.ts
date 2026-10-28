import { refresh, updateTag } from 'next/cache'
import { beforeEach, describe, expect, it } from 'vitest'

import { createEventRsvp } from '@/app/_actions/create-event-rsvp'
import { removeEventRsvp } from '@/app/_actions/remove-event-rsvp'
import { findRsvp } from '@/lib/atproto/rsvp'
import { readRsvpResponse } from '@/lib/data'

import type { FakeAccount } from '../support/fake-atproto'
import {
  EVENT,
  RSVP,
  seedEvent,
  seedInvitation,
  seedRsvp,
} from '../support/fixtures'
import { form, signIn, signInWithExpiredSession } from '../support/helpers'
import { world } from '../support/world'

let alice: FakeAccount // responds
let bob: FakeAccount // hosts
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
  event = await seedEvent(bob, { name: "Bob's party" })
})

const respond = (status: string, extra: Record<string, string> = {}) =>
  createEventRsvp(
    form({ status, eventUri: event.uri, eventCid: event.cid, ...extra })
  )
const mine = () => world.network.list(alice.did, RSVP)
const TOKEN = (status: string) => `${RSVP}#${status}`

describe('Flow: responding to an event', () => {
  beforeEach(() => signIn(alice.did))

  it('writes your response to your PDS, answering that event', async () => {
    await respond('going')

    expect(mine()).toHaveLength(1)
    expect(mine()[0].value).toMatchObject({
      $type: RSVP,
      subject: { uri: event.uri, cid: event.cid },
      status: TOKEN('going'),
    })
    expect(mine()[0].value).not.toHaveProperty('invitation')
  })

  it('records that this app made it', async () => {
    await respond('going')

    expect(mine()[0].value.createdWith).toBe('https://invite.polhem.us')
  })

  it.each(['going', 'interested', 'notgoing'])(
    'records "%s"',
    async (status) => {
      await respond(status)

      expect(mine()[0].value.status).toBe(TOKEN(status))
    }
  )

  it('refreshes what the page shows about your response', async () => {
    await respond('going')

    expect(updateTag).toHaveBeenCalledWith(
      `rsvp-response:${alice.did}:${event.uri}`
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('ignores a response that is not going, interested, or not going', async () => {
    await respond('maybe')

    expect(world.network.writes).toHaveLength(0)
  })

  it('does nothing when you are signed out or your sign-in has expired', async () => {
    world.cookies.clear()
    await respond('going')

    world.oauthSessions.clear()
    await signInWithExpiredSession(alice.did)
    await respond('going')

    expect(world.network.writes).toHaveLength(0)
  })
})

describe('Flow: changing your response', () => {
  beforeEach(async () => {
    await signIn(alice.did)
    await respond('going')
  })

  it('updates your existing RSVP in place instead of adding another', async () => {
    const original = mine()[0]

    await respond('notgoing')

    expect(mine()).toHaveLength(1)
    expect(mine()[0].rkey).toBe(original.rkey)
    expect(mine()[0].value.status).toBe(TOKEN('notgoing'))
  })

  it('keeps who made the record: still this app for ours, still the other app for theirs', async () => {
    await respond('interested')
    expect(mine()[0].value.createdWith).toBe('https://invite.polhem.us')

    await world.network.resetRepos()
    await seedRsvp(alice, event, 'going', { createdWith: 'https://atmo.rsvp' })
    await respond('interested')
    expect(mine()[0].value.createdWith).toBe('https://atmo.rsvp')
  })

  it('does not claim an RSVP made elsewhere, or by an older version, as made with this app', async () => {
    await world.network.resetRepos()
    await seedRsvp(alice, event, 'going') // no createdWith at all

    await respond('interested')

    expect(mine()[0].value).not.toHaveProperty('createdWith')
  })

  it('updates the page about your response, as when it was first made', async () => {
    await respond('interested')

    expect(updateTag).toHaveBeenCalledWith(
      `rsvp-response:${alice.did}:${event.uri}`
    )
  })
})

describe('Flow: responding through an invitation link', () => {
  let invitation: Awaited<ReturnType<typeof seedInvitation>>

  beforeEach(async () => {
    invitation = await seedInvitation(bob, event, alice)
    await signIn(alice.did)
  })

  const viaInvitation = (status: string) =>
    respond(status, {
      invitationUri: invitation.uri,
      invitationCid: invitation.cid,
    })

  it('records which invitation the response answers', async () => {
    await viaInvitation('going')

    expect(mine()[0].value).toMatchObject({
      status: TOKEN('going'),
      invitation: { uri: invitation.uri, cid: invitation.cid },
      createdWith: 'https://invite.polhem.us',
    })
  })

  it('adds the invitation to a response you already gave from the event page', async () => {
    await respond('interested')
    expect(mine()[0].value).not.toHaveProperty('invitation')

    await viaInvitation('going')

    expect(mine()).toHaveLength(1)
    expect(mine()[0].value).toMatchObject({
      status: TOKEN('going'),
      invitation: { uri: invitation.uri },
    })
  })

  it('keeps the invitation link when you later change your response from the event page', async () => {
    await viaInvitation('going')

    await respond('notgoing') // from the event page: no invitation in the form

    expect(mine()[0].value).toMatchObject({
      status: TOKEN('notgoing'),
      invitation: { uri: invitation.uri },
    })
  })

  it('needs both parts of the invitation reference to record it', async () => {
    await respond('going', { invitationUri: invitation.uri })

    expect(mine()[0].value).not.toHaveProperty('invitation')
  })
})

describe('Flow: removing your response', () => {
  const remove = () => removeEventRsvp(form({ eventUri: event.uri }))

  beforeEach(async () => {
    await signIn(alice.did)
    await respond('going')
  })

  it('deletes your RSVP from your PDS and refreshes the page', async () => {
    await remove()

    expect(mine()).toHaveLength(0)
    expect(updateTag).toHaveBeenCalledWith(
      `rsvp-response:${alice.did}:${event.uri}`
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('removes only your response to that event', async () => {
    const other = await seedEvent(bob, { name: 'Another party' })
    await createEventRsvp(
      form({ status: 'going', eventUri: other.uri, eventCid: other.cid })
    )
    expect(mine()).toHaveLength(2)

    await remove()

    expect(mine().map((r) => (r.value.subject as { uri: string }).uri)).toEqual(
      [other.uri]
    )
  })

  it("never removes someone else's response", async () => {
    await seedRsvp(bob, event, 'going')

    await remove()

    expect(world.network.list(bob.did, RSVP)).toHaveLength(1)
  })

  it('does nothing when you have no response to remove', async () => {
    await remove()
    world.network.writes = []

    await remove()

    expect(world.network.writes).toHaveLength(0)
  })

  it('does nothing when you are signed out', async () => {
    world.cookies.clear()

    await remove()

    expect(mine()).toHaveLength(1)
  })
})

describe('Flow: seeing your current response', () => {
  it('is empty until you respond, then follows what you chose', async () => {
    expect(await readRsvpResponse(alice.did, event.uri)).toBeNull()

    await signIn(alice.did)
    await respond('interested')
    expect(await readRsvpResponse(alice.did, event.uri)).toBe('interested')

    await respond('going')
    expect(await readRsvpResponse(alice.did, event.uri)).toBe('going')

    await removeEventRsvp(form({ eventUri: event.uri }))
    expect(await readRsvpResponse(alice.did, event.uri)).toBeNull()
  })

  it('includes a response made in another app', async () => {
    await seedRsvp(alice, event, 'notgoing', {
      createdWith: 'https://atmo.rsvp',
    })

    expect(await readRsvpResponse(alice.did, event.uri)).toBe('notgoing')
  })

  it('is about this event only', async () => {
    const other = await seedEvent(bob)
    await seedRsvp(alice, other, 'going')

    expect(await readRsvpResponse(alice.did, event.uri)).toBeNull()
  })

  it('shows nothing, rather than failing, when the account cannot be reached', async () => {
    expect(
      await readRsvpResponse('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', event.uri)
    ).toBeNull()
  })

  // A PDS lists newest first by default; looking up a recent response must not
  // page through the whole history
  describe('for an account with a long history of RSVPs', () => {
    async function manyRsvps(count: number) {
      for (let i = 0; i < count; i++)
        await world.network.create(alice.did, RSVP, {
          $type: RSVP,
          subject: {
            uri: `at://${bob.did}/${EVENT}/3old${String(i).padStart(9, '0')}`,
            cid: event.cid,
          },
          status: TOKEN('going'),
        })
    }
    const listCalls = () =>
      world.network.requests.filter((r) =>
        r.endsWith('com.atproto.repo.listRecords')
      ).length

    it('finds a recent response on the first page', async () => {
      await manyRsvps(150)
      await seedRsvp(alice, event, 'interested') // the newest
      world.network.requests = []

      expect(await readRsvpResponse(alice.did, event.uri)).toBe('interested')
      expect(listCalls()).toBe(1)
    })

    it('still finds an old response, by paging back through the rest', async () => {
      await seedRsvp(alice, event, 'going') // the oldest
      await manyRsvps(150)
      world.network.requests = []

      expect(await readRsvpResponse(alice.did, event.uri)).toBe('going')
      expect(listCalls()).toBe(2)
    })

    it('reports no response, after reading the one page there is, when there is none to find', async () => {
      await manyRsvps(30)
      const { getPdsClient } = await import('@/lib/atproto/identity')
      world.network.requests = []

      const hit = await findRsvp(
        await getPdsClient(alice.did),
        event.uri,
        alice.did as never
      )

      expect(hit).toBeNull()
      expect(listCalls()).toBe(1) // 30 records fit on one page, and there is no next page
    })
  })
})
