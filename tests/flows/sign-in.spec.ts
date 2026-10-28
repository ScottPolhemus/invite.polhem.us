import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as callback } from '@/app/oauth/callback/route'
import { POST as login } from '@/app/oauth/login/route'
import { POST as logout } from '@/app/oauth/logout/route'
import { getClient, getSessionDid } from '@/lib/atproto/session'
import { listInvitationsBy } from '@/lib/atproto/records'

import type { FakeAccount } from '../support/fake-atproto'
import { INVITATION, daysFromNow, seedEvent } from '../support/fixtures'
import { form, signIn } from '../support/helpers'
import { world } from '../support/world'

const BASE = 'http://127.0.0.1:3000'

const postLogin = (fields: Record<string, string | undefined>) =>
  login(
    new Request(`${BASE}/oauth/login`, { method: 'POST', body: form(fields) })
  )
const postLogout = (fields: Record<string, string | undefined> = {}) =>
  logout(
    new Request(`${BASE}/oauth/logout`, { method: 'POST', body: form(fields) })
  )
const getCallback = (params: Record<string, string>) =>
  callback(new Request(`${BASE}/oauth/callback?${new URLSearchParams(params)}`))

const location = (res: Response) => res.headers.get('location')

let alice: FakeAccount

beforeEach(async () => {
  alice = await world.network.addAccount({
    handle: 'alice.test',
    displayName: 'Alice',
  })
  // sign-in failures are logged by the routes; keep the output quiet
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Flow: starting to sign in', () => {
  it("sends you to your account's authorization page, remembering where to come back to", async () => {
    const res = await postLogin({ handle: 'alice.test', next: '/events/new' })

    expect(res.status).toBe(303)
    const url = new URL(location(res)!)
    expect(url.origin + url.pathname).toBe('https://auth.example/authorize')
    expect(url.searchParams.get('did')).toBe(alice.did)
    expect(url.searchParams.get('scope')).toBe('atproto')
    expect(url.searchParams.get('state')).toBe('/events/new')
  })

  it('accepts a handle typed with a leading @ and stray spaces', async () => {
    const res = await postLogin({ handle: '  @alice.test ' })
    expect(new URL(location(res)!).searchParams.get('did')).toBe(alice.did)
  })

  it('never carries an address on another site through as the place to come back to', async () => {
    for (const next of [
      '//evil.example/x',
      'https://evil.example',
      '/\\evil.example',
    ]) {
      const res = await postLogin({ handle: 'alice.test', next })
      expect(new URL(location(res)!).searchParams.has('state')).toBe(false)
    }
  })

  it('goes back to where you were if you submit an empty handle', async () => {
    expect(
      location(await postLogin({ handle: ' ', next: '/profile/bob' }))
    ).toBe(`${BASE}/profile/bob`)
    expect(location(await postLogin({ handle: '' }))).toBe(`${BASE}/`)
  })

  it('shows a sign-in error for a handle that does not exist', async () => {
    expect(location(await postLogin({ handle: 'nobody.test' }))).toBe(
      `${BASE}/?error=login`
    )
  })
})

describe('Flow: finishing signing in', () => {
  it('signs you in and returns you to the page you started from', async () => {
    const res = await getCallback({ did: alice.did, state: '/events/new' })

    expect(location(res)).toBe(`${BASE}/events/new`)
    expect(await getSessionDid()).toBe(alice.did)
    expect((await getClient())?.did).toBe(alice.did)
  })

  it('goes to the home page when there is no place to return to, or an unsafe one', async () => {
    expect(location(await getCallback({ did: alice.did }))).toBe(`${BASE}/`)
    expect(
      location(await getCallback({ did: alice.did, state: '//evil.example' }))
    ).toBe(`${BASE}/`)
  })

  it('pulls in the invitations you have already made, so they appear straight away', async () => {
    const event = await seedEvent(alice)
    for (let i = 0; i < 3; i++)
      await world.network.create(alice.did, INVITATION, {
        $type: INVITATION,
        subject: { uri: event.uri, cid: event.cid },
        recipient: alice.did,
        createdAt: daysFromNow(-i),
      })
    expect(await listInvitationsBy(alice.did)).toHaveLength(0)

    await getCallback({ did: alice.did })

    expect(await listInvitationsBy(alice.did)).toHaveLength(3)
  })

  it('still signs you in when your invitations cannot be fetched', async () => {
    // an account the directory has never heard of: its PDS cannot be found
    const res = await getCallback({
      did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
      state: '/',
    })

    expect(location(res)).toBe(`${BASE}/`)
    expect(await getSessionDid()).toBe('did:plc:aaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('shows a sign-in error and signs nobody in when authorization is denied', async () => {
    const res = await getCallback({
      error: 'access_denied',
      state: '/events/new',
    })

    expect(location(res)).toBe(`${BASE}/?error=login`)
    expect(await getSessionDid()).toBeNull()
  })
})

describe('Flow: signing out', () => {
  it('ends the session, revokes it, and returns you to the page you were on', async () => {
    await signIn(alice.did)
    expect(world.oauthSessions.has(alice.did)).toBe(true)

    const res = await postLogout({ next: '/profile/bob.test' })

    expect(location(res)).toBe(`${BASE}/profile/bob.test`)
    expect(await getSessionDid()).toBeNull()
    expect(world.oauthSessions.has(alice.did)).toBe(false)
  })

  it('goes to the home page for an unsafe return address', async () => {
    await signIn(alice.did)
    expect(location(await postLogout({ next: 'https://evil.example' }))).toBe(
      `${BASE}/`
    )
  })

  it('still clears the cookie when the session cannot be revoked', async () => {
    // a cookie with no OAuth session behind it, as after an expiry
    const { signInWithExpiredSession } = await import('../support/helpers')
    await signInWithExpiredSession(alice.did)

    const res = await postLogout()

    expect(location(res)).toBe(`${BASE}/`)
    expect(await getSessionDid()).toBeNull()
  })

  it('is harmless when you are not signed in', async () => {
    expect(location(await postLogout())).toBe(`${BASE}/`)
  })
})

describe('Sessions', () => {
  it('ignore a cookie that has been tampered with or made up', async () => {
    await signIn(alice.did)
    const real = world.cookies.get('session')!

    world.cookies.set('session', real.slice(0, -4) + 'AAAA')
    expect(await getSessionDid()).toBeNull()

    world.cookies.set('session', 'not-a-real-token')
    expect(await getSessionDid()).toBeNull()
  })

  it('distinguish a signed-in cookie from a session that can actually write', async () => {
    await signIn(alice.did)
    world.oauthSessions.delete(alice.did) // expired or revoked on the server

    expect(await getSessionDid()).toBe(alice.did)
    expect(await getClient()).toBeNull()
  })
})
