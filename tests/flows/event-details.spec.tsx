import { beforeEach, describe, expect, it } from 'vitest'

import EventDetails from '@/app/_components/event-details'
import EventPage from '@/app/event/[repo]/[rkey]/page'
import InvitationPage from '@/app/invitation/[repo]/[rkey]/page'

import type { FakeAccount } from '../support/fake-atproto'
import {
  EVENT,
  pageProps,
  renderPage,
  seedEvent,
  seedInvitation,
  text,
} from '../support/fixtures'
import { world } from '../support/world'

const details = async (over: Record<string, unknown>) => {
  const { doc } = await renderPage(
    <EventDetails event={{ name: 'Potluck', ...over } as never} />
  )
  return doc.querySelector('[aria-label="Event details"]')!
}

const rows = (section: Element) =>
  Object.fromEntries(
    [...section.querySelectorAll('dl > div')].map((row) => [
      text(row.querySelector('dt')),
      text(row.querySelector('dd')),
    ])
  )

describe('EventDetails', () => {
  it('shows when, attendance, place and description', async () => {
    const section = await details({
      startsAt: '2026-11-05T18:30:00.000Z',
      endsAt: '2026-11-05T21:00:00.000Z',
      mode: `${EVENT}#inperson`,
      status: `${EVENT}#scheduled`,
      description: 'Bring a dish.',
      locations: [
        {
          $type: 'community.lexicon.location.address',
          name: 'The Hall',
          street: '1 Main St',
          locality: 'Portland',
          region: 'OR',
          postalCode: '97201',
          country: 'US',
        },
      ],
    })
    expect(rows(section)).toEqual({
      When: 'Nov 5, 2026, 6:30 PM UTC – Nov 5, 2026, 9:00 PM UTC',
      Attendance: 'In person',
      Where: 'The Hall, 1 Main St, Portland, OR 97201, US',
    })
    expect(text(section.querySelector('p'))).toBe('Bring a dish.')
    expect(section.querySelector('time')!.getAttribute('dateTime')).toBe(
      '2026-11-05T18:30:00.000Z'
    )
  })

  it.each([
    ['inperson', 'In person'],
    ['virtual', 'Online'],
    ['hybrid', 'In person and online'],
  ])('labels %s attendance', async (mode, label) => {
    expect(rows(await details({ mode: `${EVENT}#${mode}` })).Attendance).toBe(
      label
    )
  })

  it.each(['cancelled', 'postponed', 'rescheduled'])(
    'calls out a %s event',
    async (status) => {
      const { Status } = rows(await details({ status: `${EVENT}#${status}` }))
      expect(Status.toLowerCase()).toBe(status)
    }
  )

  it.each(['scheduled', 'planned'])(
    'stays quiet about a %s event',
    async (s) => {
      expect(
        rows(await details({ status: `${EVENT}#${s}` }))
      ).not.toHaveProperty('Status')
    }
  )

  it('shows geo, web and unfamiliar locations as far as they can be understood', async () => {
    const section = await details({
      locations: [
        {
          $type: 'community.lexicon.location.geo',
          name: 'Park',
          latitude: '45.5',
          longitude: '-122.6',
        },
        {
          $type: 'community.lexicon.calendar.event#uri',
          uri: 'https://meet.example/room',
          name: 'Video call',
        },
        {
          $type: 'community.lexicon.location.fsq',
          name: 'Cafe',
          fsq_place_id: 'x',
        },
        {
          $type: 'community.lexicon.location.hthree',
          value: '8928308280fffff',
        },
      ],
    })
    expect([...section.querySelectorAll('li')].map((li) => text(li))).toEqual([
      'Park, 45.5, -122.6',
      'Video call',
      'Cafe',
    ])
    expect(section.querySelector('a')!.getAttribute('href')).toBe(
      'https://meet.example/room'
    )
  })

  it('links only http(s) addresses, since records come from anyone', async () => {
    const section = await details({
      uris: [
        { uri: 'https://example.com/tickets', name: 'Tickets' },
        { uri: 'javascript:alert(1)', name: 'Evil' },
        { uri: 'not a url' },
      ],
      locations: [
        {
          $type: 'community.lexicon.calendar.event#uri',
          uri: 'javascript:alert(2)',
        },
      ],
    })
    const hrefs = [...section.querySelectorAll('a')].map((a) =>
      a.getAttribute('href')
    )
    expect(hrefs).toEqual(['https://example.com/tickets'])
    expect(rows(section).Links).toBe('Tickets')
    expect(rows(section)).not.toHaveProperty('Where')
  })

  it('leaves out whatever the event does not say', async () => {
    const section = await details({})
    expect(rows(section)).toEqual({})
    expect(section.querySelector('p')).toBeNull()
  })

  it('shows a start with no end', async () => {
    expect(
      rows(await details({ startsAt: '2026-11-05T18:30:00.000Z' })).When
    ).toBe('Nov 5, 2026, 6:30 PM UTC')
  })
})

describe('pages', () => {
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

  const section = (doc: Document) =>
    doc.querySelector('[aria-label="Event details"]')

  it('the event page shows the details, with the description once', async () => {
    const event = await seedEvent(alice, {
      description: 'Bring a dish.',
      startsAt: '2026-11-05T18:30:00.000Z',
    })
    const { doc } = await renderPage(
      EventPage(pageProps({ repo: alice.did, rkey: event.rkey }) as never)
    )
    expect(rows(section(doc)!).When).toBe('Nov 5, 2026, 6:30 PM UTC')
    expect(text(doc.body).split('Bring a dish.')).toHaveLength(2)
  })

  it('the invitation page shows the details, and the message beside the event description', async () => {
    const event = await seedEvent(alice, {
      description: 'Bring a dish.',
      mode: `${EVENT}#virtual`,
    })
    const invitation = await seedInvitation(alice, event, bob, {
      description: { text: { markdown: 'Hope you can make it!' } },
    })
    const { doc } = await renderPage(
      InvitationPage(
        pageProps({ repo: alice.did, rkey: invitation.rkey }) as never
      )
    )
    expect(rows(section(doc)!).Attendance).toBe('Online')
    expect(text(section(doc))).toContain('Bring a dish.')
    expect(text(doc.body)).toContain('Hope you can make it!')
  })
})
