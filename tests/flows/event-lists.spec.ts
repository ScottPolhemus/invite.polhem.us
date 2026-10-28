import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EventList from '@/app/_components/event-list'
import {
  isUpcoming,
  listEvents,
  listRsvpedEvents,
  listUpcomingRsvpedEvents,
} from '@/lib/atproto/events'

import type { FakeAccount } from '../support/fake-atproto'
import {
  EVENT,
  daysFromNow,
  eventRecord,
  render,
  seedEvent,
  seedInvitation,
  seedRsvp,
  text,
} from '../support/fixtures'
import { world } from '../support/world'

// the delete button's confirmation text is a prop; surface it so specs can read it
vi.mock('@/app/_components/confirm-submit', () => ({
  default: ({ message, children }: { message: string; children: unknown }) =>
    createElement('button', { 'data-message': message }, children as never),
}))

let alice: FakeAccount
let bob: FakeAccount

beforeEach(async () => {
  alice = await world.network.addAccount({
    handle: 'alice.test',
    displayName: 'Alice',
  })
  bob = await world.network.addAccount({
    handle: 'bob.test',
    displayName: 'Bob',
  })
})

const rowsOf = (doc: Document) =>
  [...doc.querySelectorAll('li')].map((li) => ({
    text: text(li),
    name: text(li.querySelector('a')),
    pill: text(li.querySelector('span')),
    hasEdit: !!li.querySelector('a[href$="/edit"]'),
    hasDelete: !!li.querySelector('button[data-message]'),
    message: li
      .querySelector('button[data-message]')
      ?.getAttribute('data-message'),
  }))

async function list(opts: {
  did: string
  manage?: boolean
  emptyMessage?: string
}) {
  return render(await EventList({ emptyMessage: 'Nothing here.', ...opts }))
}

describe('Flow: seeing the events an account hosts and has RSVP’d to', () => {
  beforeEach(async () => {
    // alice hosts one upcoming, one later, one past
    await seedEvent(alice, { name: 'Alice soon', startsAt: daysFromNow(5) })
    await seedEvent(alice, { name: 'Alice later', startsAt: daysFromNow(20) })
    await seedEvent(alice, {
      name: 'Alice last month',
      startsAt: daysFromNow(-30),
    })
    // bob hosts three; alice answers each differently
    const soon = await seedEvent(bob, {
      name: 'Bob soon',
      startsAt: daysFromNow(3),
    })
    const old = await seedEvent(bob, {
      name: 'Bob last week',
      startsAt: daysFromNow(-10),
    })
    const declined = await seedEvent(bob, {
      name: 'Bob declined',
      startsAt: daysFromNow(8),
    })
    await seedRsvp(alice, soon, 'going')
    await seedRsvp(alice, old, 'interested')
    await seedRsvp(alice, declined, 'notgoing')
  })

  it('lists upcoming events soonest first, marking whether you host them or are going', async () => {
    const doc = await list({ did: alice.did })
    const upcoming = rowsOf(doc).filter(
      (r) => !doc.querySelector('details')?.textContent?.includes(r.name)
    )

    expect(upcoming.map((r) => [r.name, r.pill])).toEqual([
      ['Bob soon', 'Going'],
      ['Alice soon', 'Hosting'],
      ['Alice later', 'Hosting'],
    ])
  })

  it('puts events that have ended in a collapsed "Past events" block, newest first', async () => {
    const doc = await list({ did: alice.did })

    expect(text(doc.querySelector('details summary'))).toBe('Past events (2)')
    const past = [...doc.querySelectorAll('details li')].map((li) => [
      text(li.querySelector('a')),
      text(li.querySelector('span')),
    ])
    expect(past).toEqual([
      ['Bob last week', 'Interested'],
      ['Alice last month', 'Hosting'],
    ])
  })

  it('leaves out events you said you are not going to', async () => {
    const doc = await list({ did: alice.did })

    expect(text(doc.body)).not.toContain('Bob declined')
  })

  it("shows an event once, as hosting, when you host it and also RSVP'd to it", async () => {
    const own = (await world.network.list(alice.did, EVENT))[0]
    await seedRsvp(alice, own, 'going')

    const rows = rowsOf(await list({ did: alice.did })).filter(
      (r) =>
        r.name === 'Alice soon' ||
        r.name === 'Alice later' ||
        r.name === 'Alice last month'
    )

    expect(rows.every((r) => r.pill === 'Hosting')).toBe(true)
    expect(rows).toHaveLength(3)
  })

  it('shows each event’s date as its author wrote it, not shifted into another timezone', async () => {
    await world.network.resetRepos()
    await seedEvent(alice, {
      name: 'Evening event',
      startsAt:
        new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) +
        'T21:00:00.000-07:00',
    })

    const [row] = rowsOf(await list({ did: alice.did }))

    // 21:00 at UTC-7 is already the next day in UTC; the date shown is the author's
    const expected = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    expect(row.text).toContain(
      new Date(`${expected}T00:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    )
  })

  it('links each event to its page', async () => {
    const doc = await list({ did: alice.did })

    const link = [...doc.querySelectorAll('a')].find(
      (a) => text(a) === 'Alice soon'
    )!
    expect(link.getAttribute('href')).toMatch(
      new RegExp(`^/event/${alice.did}/`)
    )
  })

  it('is read-only for someone else’s profile: no Edit or Delete', async () => {
    const rows = rowsOf(await list({ did: alice.did }))

    expect(rows.some((r) => r.hasEdit || r.hasDelete)).toBe(false)
  })

  it('offers Edit and Delete on your own events, and only on those', async () => {
    const rows = rowsOf(await list({ did: alice.did, manage: true }))

    expect(
      rows
        .filter((r) => r.hasEdit)
        .map((r) => r.name)
        .sort()
    ).toEqual(['Alice last month', 'Alice later', 'Alice soon'])
    expect(
      rows
        .filter((r) => r.hasDelete)
        .map((r) => r.name)
        .sort()
    ).toEqual(['Alice last month', 'Alice later', 'Alice soon'])
    expect(rows.find((r) => r.name === 'Bob soon')).toMatchObject({
      hasEdit: false,
      hasDelete: false,
    })
  })
})

describe('Flow: deleting an event warns about your invitations to it', () => {
  it('names how many of your invitations point at the event', async () => {
    const mine = await seedEvent(alice, {
      name: 'Alice soon',
      startsAt: daysFromNow(5),
    })
    const other = await seedEvent(alice, {
      name: 'Alice later',
      startsAt: daysFromNow(6),
    })
    await seedInvitation(alice, mine, bob)
    await seedInvitation(alice, mine, bob)
    await seedInvitation(alice, other, bob)

    const rows = rowsOf(await list({ did: alice.did, manage: true }))

    expect(rows.find((r) => r.name === 'Alice soon')?.message).toContain(
      '2 of your invitations point at it'
    )
    expect(rows.find((r) => r.name === 'Alice later')?.message).toContain(
      '1 of your invitations points at it'
    )
  })

  it('does not warn when no invitation points at it', async () => {
    await seedEvent(alice, { name: 'Alice soon', startsAt: daysFromNow(5) })

    const [row] = rowsOf(await list({ did: alice.did, manage: true }))

    expect(row.message).not.toContain('invitation')
    expect(row.message).toContain('Delete “Alice soon”?')
  })
})

describe('Flow: lists that are empty or very long', () => {
  it('says so when there is nothing to show', async () => {
    const doc = await list({
      did: alice.did,
      emptyMessage: 'No events or RSVPs to show for this account.',
    })

    expect(text(doc.body)).toBe('No events or RSVPs to show for this account.')
  })

  it('says there is nothing upcoming when everything has ended', async () => {
    await seedEvent(alice, { name: 'Old', startsAt: daysFromNow(-5) })

    const doc = await list({ did: alice.did })

    expect(text(doc.body)).toContain('No upcoming events.')
    expect(text(doc.querySelector('details summary'))).toBe('Past events (1)')
  })

  it('treats an event with no start date as not upcoming, and lists it last among past events', async () => {
    await seedEvent(alice, { name: 'Dated', startsAt: daysFromNow(-5) })
    await world.network.create(
      alice.did,
      EVENT,
      eventRecord({ name: 'Undated', startsAt: undefined })
    )

    const doc = await list({ did: alice.did })

    expect(
      [...doc.querySelectorAll('details li a')].map((a) => text(a))
    ).toEqual(['Dated', 'Undated'])
  })

  it('shows at most 200 upcoming and 200 past events, saying how many more there are', async () => {
    for (let i = 0; i < 205; i++) {
      await world.network.create(
        alice.did,
        EVENT,
        eventRecord({ name: `Up ${i}`, startsAt: daysFromNow(1 + i) })
      )
      await world.network.create(
        alice.did,
        EVENT,
        eventRecord({ name: `Down ${i}`, startsAt: daysFromNow(-1 - i) })
      )
    }

    const doc = await list({ did: alice.did })

    expect(doc.querySelectorAll('li')).toHaveLength(400)
    expect(text(doc.body)).toContain('5 more upcoming events not shown.')
    expect(text(doc.body)).toContain('5 older events not shown.')
    expect(text(doc.querySelector('details summary'))).toBe('Past events (205)')
  })
})

describe('Which events an account has RSVP’d to', () => {
  it('includes going and interested, past and upcoming, but not "not going"', async () => {
    const past = await seedEvent(bob, {
      name: 'Past',
      startsAt: daysFromNow(-3),
    })
    const soon = await seedEvent(bob, {
      name: 'Soon',
      startsAt: daysFromNow(3),
    })
    const no = await seedEvent(bob, { name: 'No', startsAt: daysFromNow(4) })
    await seedRsvp(alice, past, 'going')
    await seedRsvp(alice, soon, 'interested')
    await seedRsvp(alice, no, 'notgoing')

    const events = await listRsvpedEvents(alice.did)

    expect(events.map((e) => [e.name, e.response]).sort()).toEqual([
      ['Past', 'going'],
      ['Soon', 'interested'],
    ])
  })

  it('uses your newest response when you have answered the same event twice', async () => {
    const event = await seedEvent(bob)
    await seedRsvp(alice, event, 'going') // older
    await seedRsvp(alice, event, 'interested') // newer

    const events = await listRsvpedEvents(alice.did)

    expect(events).toHaveLength(1)
    expect(events[0].response).toBe('interested')
  })

  it('reads your newest 300 RSVPs when you have more, so recent ones are never the ones missed', async () => {
    for (let i = 0; i < 305; i++)
      await seedRsvp(alice, await seedEvent(bob, { name: `E${i}` }), 'going')

    const names = (await listRsvpedEvents(alice.did)).map((e) => e.name)

    expect(names).toHaveLength(300)
    expect(names).toContain('E304') // the newest
    expect(names).not.toContain('E0') // the oldest five fall off
    expect(names).not.toContain('E4')
  })

  it('skips RSVPs to events that no longer exist, and to things that are not events', async () => {
    const gone = await seedEvent(bob, { name: 'Gone' })
    await seedRsvp(alice, gone, 'going')
    await world.network.resetRepos() // bob's event is deleted, alice's RSVP is gone too…
    const kept = await seedEvent(bob, { name: 'Kept' })
    await seedRsvp(alice, kept, 'going')
    await seedRsvp(
      alice,
      {
        uri: `at://${bob.did}/${EVENT}/3missingmissing`,
        cid: kept.cid,
        rkey: 'x',
      },
      'going'
    )
    await seedRsvp(
      alice,
      {
        uri: `at://${bob.did}/app.bsky.feed.post/3aaaaaaaaaaaa`,
        cid: kept.cid,
        rkey: 'x',
      },
      'going'
    )

    expect((await listRsvpedEvents(alice.did)).map((e) => e.name)).toEqual([
      'Kept',
    ])
  })

  it('shows nothing, rather than failing, when the account cannot be reached', async () => {
    expect(await listRsvpedEvents('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')).toEqual(
      []
    )
  })
})

describe('Flow: choosing an event for a new invitation', () => {
  it('offers upcoming events you RSVP’d to, soonest first', async () => {
    const later = await seedEvent(bob, {
      name: 'Later',
      startsAt: daysFromNow(9),
    })
    const sooner = await seedEvent(bob, {
      name: 'Sooner',
      startsAt: daysFromNow(2),
    })
    const past = await seedEvent(bob, {
      name: 'Past',
      startsAt: daysFromNow(-2),
    })
    const undated = await world.network.create(
      bob.did,
      EVENT,
      eventRecord({ name: 'Undated', startsAt: undefined })
    )
    for (const e of [later, sooner, past, undated])
      await seedRsvp(alice, e, 'going')

    const events = await listUpcomingRsvpedEvents(alice.did)

    expect(events.map((e) => e.name)).toEqual(['Sooner', 'Later'])
  })

  it('lists every event you host, however many pages that takes', async () => {
    for (let i = 0; i < 130; i++) await seedEvent(alice, { name: `Mine ${i}` })

    const events = await listEvents(alice.did)

    expect(events).toHaveLength(130)
    expect(events[0]).toMatchObject({
      name: expect.any(String),
      startsAt: expect.any(String),
    })
  })
})

describe('What counts as upcoming', () => {
  const now = new Date()
  const event = (over: Record<string, string | undefined>) => ({
    uri: 'at://x/y/z',
    name: 'E',
    ...over,
  })

  it('is an event that has not ended: later, or still in progress', () => {
    expect(isUpcoming(event({ startsAt: daysFromNow(2) }), now)).toBe(true)
    expect(
      isUpcoming(
        event({ startsAt: daysFromNow(-1), endsAt: daysFromNow(1) }),
        now
      )
    ).toBe(true)
  })

  it('is not an event that has ended', () => {
    expect(isUpcoming(event({ startsAt: daysFromNow(-2) }), now)).toBe(false)
    expect(
      isUpcoming(
        event({ startsAt: daysFromNow(-2), endsAt: daysFromNow(-1) }),
        now
      )
    ).toBe(false)
  })

  it('is not an event with no start date or one that cannot be read', () => {
    expect(isUpcoming(event({}), now)).toBe(false)
    expect(isUpcoming(event({ startsAt: 'whenever' }), now)).toBe(false)
  })
})
