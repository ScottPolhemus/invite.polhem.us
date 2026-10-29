import { beforeEach, describe, expect, it } from 'vitest'

import EventDetails from '@/app/_components/events/event-details'
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
import { signIn } from '../support/helpers'
import { world } from '../support/world'

// Node.DOCUMENT_POSITION_FOLLOWING: the other node comes later in the document
const DOCUMENT_POSITION_FOLLOWING = 4

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
    expect(text(section.querySelector('details p'))).toBe('Bring a dish.')
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

  it('puts the description in a collapsible block, open unless told otherwise', async () => {
    const open = await details({ description: 'Bring a dish.' })
    expect(open.querySelector('details')!.hasAttribute('open')).toBe(true)
    expect(text(open.querySelector('summary'))).toBe('Description')

    const { doc } = await renderPage(
      <EventDetails
        event={{ name: 'Potluck', description: 'Bring a dish.' } as never}
        descriptionOpen={false}
      />
    )
    const closed = doc.querySelector('details')!
    expect(closed.hasAttribute('open')).toBe(false)
    expect(text(closed)).toContain('Bring a dish.')
  })

  it('renders the description as Markdown, linking plain web addresses', async () => {
    const section = await details({
      description: 'Bring **a dish**\nInfo: https://example.com/potluck',
    })
    const body = section.querySelector('details')!
    expect(text(body.querySelector('strong'))).toBe('a dish')
    expect(body.querySelectorAll('br')).toHaveLength(1)
    expect(body.querySelector('a')!.getAttribute('href')).toBe(
      'https://example.com/potluck'
    )
  })

  it('shows HTML in a description as text', async () => {
    const section = await details({
      description: '<img src=x onerror=alert(1)>',
    })
    expect(section.querySelector('img')).toBeNull()
    expect(text(section)).toContain('<img src=x')
  })

  it('leaves out whatever the event does not say', async () => {
    const section = await details({})
    expect(rows(section)).toEqual({})
    expect(section.querySelector('details')).toBeNull()
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
    expect(section(doc)!.querySelector('details')!.hasAttribute('open')).toBe(
      true
    )
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
    expect(section(doc)!.querySelector('details')!.hasAttribute('open')).toBe(
      false
    )
    expect(text(doc.body)).toContain('Hope you can make it!')
  })

  it('the event page tells its owner so in a banner above the title, with a link to edit', async () => {
    const event = await seedEvent(alice)
    await signIn(alice.did)
    const { doc } = await renderPage(
      EventPage(pageProps({ repo: alice.did, rkey: event.rkey }) as never)
    )
    const banner = doc.querySelector('[role=note]')!
    expect(text(banner)).toContain('You are the owner of this event.')
    expect(banner.querySelector('a')!.getAttribute('href')).toBe(
      `/event/${alice.did}/${event.rkey}/edit`
    )
    expect(
      banner.compareDocumentPosition(doc.querySelector('h1')!) &
        DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('the event page shows no owner banner to anyone else', async () => {
    const event = await seedEvent(alice)
    for (const who of [null, bob]) {
      if (who) await signIn(who.did)
      const { doc } = await renderPage(
        EventPage(pageProps({ repo: alice.did, rkey: event.rkey }) as never)
      )
      expect(doc.querySelector('[role=note]')).toBeNull()
    }
  })
})
