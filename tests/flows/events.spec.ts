import { refresh, updateTag } from 'next/cache'
import { beforeEach, describe, expect, it } from 'vitest'

import { createEvent } from '@/app/_actions/create-event'
import { deleteEvent } from '@/app/_actions/delete-event'
import { updateEvent } from '@/app/_actions/update-event'
import { eventDefaults } from '@/lib/atproto/events'

import type { FakeAccount } from '../support/fake-atproto'
import { EVENT, eventRecord, seedEvent } from '../support/fixtures'
import {
  form,
  redirectOf,
  signIn,
  signInWithExpiredSession,
} from '../support/helpers'
import { world } from '../support/world'

const ADDRESS = 'community.lexicon.location.address'
const GEO = 'community.lexicon.location.geo'

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

const fresh = {
  name: 'Potluck',
  startsAt: '2027-03-01T18:00:00.000Z',
  mode: 'inperson',
  status: 'scheduled',
}

describe('Flow: creating an event', () => {
  beforeEach(() => signIn(alice.did))

  it('publishes the event to your PDS and takes you to its page', async () => {
    const target = await redirectOf(() => createEvent(form(fresh)))

    const rkey = target.split('/')[3]
    expect(target).toBe(`/event/${alice.did}/${rkey}`)
    expect(world.network.get(alice.did, EVENT, rkey)?.value).toMatchObject({
      $type: EVENT,
      name: 'Potluck',
      startsAt: '2027-03-01T18:00:00.000Z',
      mode: `${EVENT}#inperson`,
      status: `${EVENT}#scheduled`,
    })
    expect(
      world.network.writes.map((w) => [w.action, w.repo, w.collection])
    ).toEqual([['create', alice.did, EVENT]])
  })

  it('records that this app made it', async () => {
    await redirectOf(() => createEvent(form(fresh)))

    const [event] = world.network.list(alice.did, EVENT)
    expect(event.value.createdWith).toBe('https://invite.polhem.us')
    expect(Number.isNaN(Date.parse(String(event.value.createdAt)))).toBe(false)
  })

  it('saves the end, description, link, status, attendance, and address you give', async () => {
    await redirectOf(() =>
      createEvent(
        form({
          ...fresh,
          endsAt: '2027-03-01T20:00:00.000Z',
          mode: 'hybrid',
          status: 'planned',
          description: 'Bring a dish',
          link: 'https://example.com/potluck',
          venue: 'Community Hall',
          street: '1 Main St',
          locality: 'Denver',
          region: 'CO',
          postalCode: '80202',
          country: 'us',
        })
      )
    )

    expect(world.network.list(alice.did, EVENT)[0].value).toMatchObject({
      endsAt: '2027-03-01T20:00:00.000Z',
      mode: `${EVENT}#hybrid`,
      status: `${EVENT}#planned`,
      description: 'Bring a dish',
      uris: [{ uri: 'https://example.com/potluck' }],
      locations: [
        {
          $type: ADDRESS,
          name: 'Community Hall',
          street: '1 Main St',
          locality: 'Denver',
          region: 'CO',
          postalCode: '80202',
          country: 'US', // normalized to upper case
        },
      ],
    })
  })

  it('falls back to in person and scheduled for values it does not recognize', async () => {
    await redirectOf(() =>
      createEvent(form({ ...fresh, mode: 'weird', status: 'bogus' }))
    )

    expect(world.network.list(alice.did, EVENT)[0].value).toMatchObject({
      mode: `${EVENT}#inperson`,
      status: `${EVENT}#scheduled`,
    })
  })

  it.each([
    ['has no name', { name: '   ' }, 'name'],
    ['has no start', { startsAt: '' }, 'starts'],
    ['has a start that is not a date', { startsAt: 'next tuesday' }, 'starts'],
    ['ends before it starts', { endsAt: '2027-03-01T17:00:00.000Z' }, 'dates'],
    [
      'has a link that is not a web address',
      { link: 'javascript:alert(1)' },
      'link',
    ],
    ['has a link with no scheme', { link: 'example.com' }, 'link'],
    ['has an address with no country', { locality: 'Denver' }, 'location'],
    [
      'has a country code that is too short',
      { locality: 'Denver', country: 'U' },
      'location',
    ],
  ])(
    'sends you back with a message, and writes nothing, when the event %s',
    async (_, bad, error) => {
      expect(
        await redirectOf(() => createEvent(form({ ...fresh, ...bad })))
      ).toBe(`/event/new?error=${error}`)
      expect(world.network.writes).toHaveLength(0)
    }
  )

  it('asks you to sign in when you are signed out, or your sign-in has expired', async () => {
    world.cookies.clear()
    expect(await redirectOf(() => createEvent(form(fresh)))).toBe(
      '/event/new?error=auth'
    )

    world.oauthSessions.clear()
    await signInWithExpiredSession(alice.did)
    expect(await redirectOf(() => createEvent(form(fresh)))).toBe(
      '/event/new?error=auth'
    )

    expect(world.network.writes).toHaveLength(0)
  })
})

describe('Flow: editing an event', () => {
  // A realistic event: more than the form shows, as events from other apps are
  const stored: Record<string, unknown> = eventRecord({
    name: 'Original',
    description: 'Hello world',
    startsAt: '2027-01-25T19:00:00.000-07:00',
    endsAt: '2027-01-25T20:00:00.000-07:00',
    uris: [
      { uri: 'https://a.example/', name: 'Main site' },
      { uri: 'https://b.example/' },
    ],
    locations: [
      { $type: ADDRESS, name: 'Old Hall', locality: 'Boulder', country: 'US' },
      { $type: GEO, latitude: '40.01', longitude: '-105.27' },
    ],
    media: [{ role: 'thumbnail' }],
    timezone: 'America/Denver',
    facets: [{ index: { byteStart: 0, byteEnd: 5 }, features: [] }],
    createdWith: 'https://atmo.rsvp',
  })
  let ref: Awaited<ReturnType<typeof seedEvent>>

  /** What the edit form submits for this event: its own defaults, with changes on top */
  const edit = (changes: Record<string, string | undefined> = {}) => {
    const d = eventDefaults(
      ref.rkey
        ? (world.network.get(alice.did, EVENT, ref.rkey)!.value as never)
        : {}
    )
    return form({
      rkey: ref.rkey,
      name: d.name,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      mode: d.mode,
      status: d.status,
      description: d.description,
      link: d.link,
      venue: d.venue,
      street: d.street,
      locality: d.locality,
      region: d.region,
      postalCode: d.postalCode,
      country: d.country,
      ...changes,
    })
  }
  const current = () => world.network.get(alice.did, EVENT, ref.rkey)!.value

  beforeEach(async () => {
    ref = await seedEvent(alice, stored)
    await signIn(alice.did)
  })

  it('takes you to the event page and refreshes what visitors see', async () => {
    expect(await redirectOf(() => updateEvent(edit({ name: 'Renamed' })))).toBe(
      `/event/${alice.did}/${ref.rkey}`
    )
    expect(updateTag).toHaveBeenCalledWith(`record:${ref.uri}`)
  })

  it('leaves the event exactly as it was when you save without changing anything', async () => {
    await redirectOf(() => updateEvent(edit()))

    expect(current()).toEqual(stored)
  })

  it('changes only the field you edit', async () => {
    await redirectOf(() => updateEvent(edit({ name: 'Renamed' })))

    expect(current()).toEqual({ ...stored, name: 'Renamed' })
  })

  it('lets you change every field the form shows', async () => {
    await redirectOf(() =>
      updateEvent(
        edit({
          name: 'New name',
          startsAt: '2027-02-01T14:30:00.000Z',
          endsAt: '2027-02-01T16:00:00.000Z',
          mode: 'virtual',
          status: 'cancelled',
          description: 'Different words',
          link: 'https://c.example/',
          venue: 'New Hall',
          locality: 'Denver',
        })
      )
    )

    expect(current()).toMatchObject({
      name: 'New name',
      startsAt: '2027-02-01T14:30:00.000Z',
      endsAt: '2027-02-01T16:00:00.000Z',
      mode: `${EVENT}#virtual`,
      status: `${EVENT}#cancelled`,
      description: 'Different words',
    })
  })

  it('keeps everything the form does not show: media, timezone, who made it, and more', async () => {
    await redirectOf(() =>
      updateEvent(edit({ name: 'Renamed', description: 'Rewritten' }))
    )

    expect(current()).toMatchObject({
      media: stored.media,
      timezone: 'America/Denver',
      createdWith: 'https://atmo.rsvp',
      createdAt: stored.createdAt,
    })
  })

  it('replaces only the first link and keeps the others', async () => {
    await redirectOf(() => updateEvent(edit({ link: 'https://new.example/' })))

    expect(current().uris).toEqual([
      { uri: 'https://new.example/', name: 'Main site' },
      { uri: 'https://b.example/' },
    ])
  })

  it('removes only the first link when you clear it', async () => {
    await redirectOf(() => updateEvent(edit({ link: '' })))

    expect(current().uris).toEqual([{ uri: 'https://b.example/' }])
  })

  it('replaces only the address and keeps other kinds of location, such as coordinates', async () => {
    await redirectOf(() =>
      updateEvent(edit({ locality: 'Denver', venue: 'New Hall' }))
    )

    expect(current().locations).toEqual([
      { $type: ADDRESS, name: 'New Hall', locality: 'Denver', country: 'US' },
      { $type: GEO, latitude: '40.01', longitude: '-105.27' },
    ])
  })

  it('removes only the address when you clear it', async () => {
    await redirectOf(() =>
      updateEvent(
        edit({
          venue: '',
          street: '',
          locality: '',
          region: '',
          postalCode: '',
          country: '',
        })
      )
    )

    expect(current().locations).toEqual([
      { $type: GEO, latitude: '40.01', longitude: '-105.27' },
    ])
  })

  it('drops text-position data when the description changes, since it would point at the wrong words', async () => {
    await redirectOf(() =>
      updateEvent(edit({ description: 'Something else entirely' }))
    )
    expect(current()).not.toHaveProperty('facets')

    // but an unchanged description keeps it
    ref = await seedEvent(alice, stored)
    await redirectOf(() => updateEvent(edit({ name: 'Renamed' })))
    expect(current()).toHaveProperty('facets')
  })

  it('removes the end time and description when you clear them', async () => {
    await redirectOf(() => updateEvent(edit({ endsAt: '', description: '' })))

    expect(current()).not.toHaveProperty('endsAt')
    expect(current()).not.toHaveProperty('description')
  })

  it.each([
    ['name', { name: '' }, 'name'],
    ['dates', { endsAt: '2020-01-01T00:00:00.000Z' }, 'dates'],
    ['link', { link: 'ftp://x.example' }, 'link'],
    ['address', { country: '' }, 'location'],
  ])(
    'sends you back to the edit page, changing nothing, when the %s is invalid',
    async (_, bad, error) => {
      expect(await redirectOf(() => updateEvent(edit(bad)))).toBe(
        `/event/${alice.did}/${ref.rkey}/edit?error=${error}`
      )
      expect(current()).toEqual(stored)
    }
  )

  it('says the event is gone if it was deleted in the meantime', async () => {
    const form = edit()
    world.network.writes = []
    world.network.resetRepos() // the event no longer exists

    expect(await redirectOf(() => updateEvent(form))).toBe(
      `/event/${alice.did}/${ref.rkey}/edit?error=missing`
    )
  })

  it("never touches someone else's event", async () => {
    world.cookies.clear()
    world.oauthSessions.clear()
    await signIn(bob.did)

    // Bob submits Alice's record key; the action only ever looks in Bob's own repo
    expect(
      await redirectOf(() => updateEvent(edit({ name: 'Hijacked' })))
    ).toBe(`/event/${bob.did}/${ref.rkey}/edit?error=missing`)
    expect(current()).toEqual(stored)
    expect(world.network.writes).toHaveLength(0)
  })

  it('goes to the home page when you are not signed in', async () => {
    world.cookies.clear()

    expect(await redirectOf(() => updateEvent(edit({ name: 'x' })))).toBe('/')
    expect(current()).toEqual(stored)
  })
})

describe('Flow: deleting an event', () => {
  let ref: Awaited<ReturnType<typeof seedEvent>>

  beforeEach(async () => {
    ref = await seedEvent(alice)
    await signIn(alice.did)
  })

  it('removes it from your PDS, refreshes what visitors see, and returns where you ask', async () => {
    expect(
      await redirectOf(() => deleteEvent(form({ rkey: ref.rkey, next: '/' })))
    ).toBe('/')

    expect(world.network.get(alice.did, EVENT, ref.rkey)).toBeUndefined()
    expect(updateTag).toHaveBeenCalledWith(`record:${ref.uri}`)
  })

  it('refreshes the page you are on when no return address is given', async () => {
    await deleteEvent(form({ rkey: ref.rkey }))

    expect(world.network.get(alice.did, EVENT, ref.rkey)).toBeUndefined()
    expect(refresh).toHaveBeenCalled()
  })

  it('ignores an unsafe return address', async () => {
    await deleteEvent(form({ rkey: ref.rkey, next: 'https://evil.example' }))

    expect(refresh).toHaveBeenCalled()
  })

  it("leaves someone else's event alone", async () => {
    world.cookies.clear()
    world.oauthSessions.clear()
    await signIn(bob.did)

    await deleteEvent(form({ rkey: ref.rkey }))

    expect(world.network.get(alice.did, EVENT, ref.rkey)).toBeDefined()
  })

  it('does nothing when you are signed out or your sign-in has expired', async () => {
    world.cookies.clear()
    await deleteEvent(form({ rkey: ref.rkey }))

    world.oauthSessions.clear()
    await signInWithExpiredSession(alice.did)
    await deleteEvent(form({ rkey: ref.rkey }))

    expect(world.network.get(alice.did, EVENT, ref.rkey)).toBeDefined()
    expect(world.network.writes).toHaveLength(0)
  })
})
