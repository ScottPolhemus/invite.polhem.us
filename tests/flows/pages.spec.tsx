import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AuthStatus from '@/app/_components/auth-status'
import InvitationActions from '@/app/_components/invitation-actions'
import InvitationPreviewBanner from '@/app/_components/invitation-preview-banner'
import InviteToEvent from '@/app/_components/invite-to-event'
import RsvpControl from '@/app/_components/rsvp-control'
import SessionFooter from '@/app/_components/session-footer'
import YourInvitations from '@/app/_components/your-invitations'
import InvitationPage from '@/app/invitation/[repo]/[rkey]/page'

import type { FakeAccount } from '../support/fake-atproto'
import { signIn, signInWithExpiredSession } from '../support/helpers'
import {
  INVITATION,
  pageProps,
  renderPage,
  seedEvent,
  seedInvitation,
  seedRsvp,
  text,
  type Ref,
} from '../support/fixtures'
import { world } from '../support/world'

vi.mock('@/app/_components/confirm-submit', () => ({
  default: ({ message, children }: { message: string; children: unknown }) =>
    createElement('button', { 'data-message': message }, children as never),
}))

let alice: FakeAccount
let bob: FakeAccount
let carol: FakeAccount
let event: Ref
let invitation: Ref

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
  world.pathname = '/somewhere'
  event = await seedEvent(alice, { name: 'Potluck' })
  invitation = await seedInvitation(alice, event, bob)
})

const hidden = (root: ParentNode) =>
  Object.fromEntries(
    [...root.querySelectorAll('input[type=hidden]')].map((i) => [
      i.getAttribute('name'),
      i.getAttribute('value'),
    ])
  )

const props = () => ({
  invitation: {
    uri: invitation.uri,
    cid: invitation.cid,
    value: {
      subject: { uri: event.uri, cid: event.cid },
      recipient: bob.did,
    } as never,
  },
  event: { uri: event.uri, cid: event.cid },
  returnTo: `/invitation/${alice.did}/${invitation.rkey}`,
})

const pressed = (doc: Document) =>
  [...doc.querySelectorAll('button[aria-pressed=true]')].map((b) => text(b))

describe('InvitationActions', () => {
  it('lets the recipient RSVP, recording the invitation they are answering', async () => {
    await signIn(bob.did)
    const { doc } = await renderPage(await InvitationActions(props()))
    const fields = hidden(doc)
    expect(fields).toMatchObject({
      invitationUri: invitation.uri,
      invitationCid: invitation.cid,
      eventUri: event.uri,
      eventCid: event.cid,
    })
    expect(pressed(doc)).toEqual([])
    expect(doc.body.textContent).not.toContain('Remove your RSVP')
  })

  it("highlights the recipient's current response and offers to remove it", async () => {
    await seedRsvp(bob, event, 'interested')
    await signIn(bob.did)
    const { doc } = await renderPage(await InvitationActions(props()))
    expect(pressed(doc)).toEqual(['✓ Interested'])
    expect(doc.body.textContent).toContain('Remove your RSVP')
  })

  it('offers a signed-out visitor a sign-in as the recipient, and the plain event page', async () => {
    const { doc } = await renderPage(await InvitationActions(props()))
    const login = doc.querySelector('form[action="/oauth/login"]')!
    expect(hidden(login)).toEqual({
      handle: 'bob.test',
      next: `/invitation/${alice.did}/${invitation.rkey}`,
    })
    expect(text(login.querySelector('button'))).toBe('Sign in as @bob.test')
    expect(text(doc.body)).toContain('Not Bob?')
    expect(doc.querySelector('a')!.getAttribute('href')).toBe(
      `/event/${alice.did}/${event.rkey}`
    )
    expect(doc.querySelector('button[name=status]')).toBeNull()
  })

  it('tells another signed-in account the invitation is not for them, and offers to sign out', async () => {
    await signIn(carol.did)
    const { doc } = await renderPage(await InvitationActions(props()))
    const logout = doc.querySelector('form[action="/oauth/logout"]')!
    expect(text(logout)).toContain(
      'You’re signed in as Carol, but this invitation is for Bob.'
    )
    expect(hidden(logout).next).toBe(
      `/invitation/${alice.did}/${invitation.rkey}`
    )
    expect(doc.querySelector('button[name=status]')).toBeNull()
  })

  it('falls back to the DID when the recipient has no handle', async () => {
    const ghost = 'did:plc:nohandlehere'
    const p = props()
    p.invitation.value = { subject: p.event, recipient: ghost } as never
    const { doc } = await renderPage(await InvitationActions(p))
    expect(hidden(doc.querySelector('form')!).handle).toBe(ghost)
  })
})

describe('InvitationPreviewBanner', () => {
  it('shows only to the invitation’s author', async () => {
    const author = { author: alice.did, recipient: bob.did }
    expect(await InvitationPreviewBanner(author)).toBeNull()
    await signIn(bob.did)
    expect(await InvitationPreviewBanner(author)).toBeNull()
    await signIn(alice.did)
    const { doc } = await renderPage(await InvitationPreviewBanner(author))
    expect(text(doc.querySelector('[role=note]'))).toContain(
      'This is a preview of your invitation to Bob (@bob.test).'
    )
    expect(text(doc.querySelector('button'))).toBe('Copy the link to share')
  })

  it('leaves out the handle when the recipient has none', async () => {
    await signIn(alice.did)
    const { doc } = await renderPage(
      await InvitationPreviewBanner({
        author: alice.did,
        recipient: 'did:plc:nohandlehere',
      })
    )
    expect(text(doc.querySelector('[role=note]'))).not.toContain('(@')
  })
})

describe('SessionFooter', () => {
  it('is absent when signed out', async () => {
    expect(await SessionFooter()).toBeNull()
  })

  it('names the signed-in account and signs out back to the current page', async () => {
    await signIn(alice.did)
    world.pathname = '/profile/alice.test'
    const { doc } = await renderPage(await SessionFooter())
    expect(text(doc.querySelector('footer'))).toContain(
      'Logged in as Alice (@alice.test)'
    )
    expect(
      hidden(doc.querySelector('form[action="/oauth/logout"]')!).next
    ).toBe('/profile/alice.test')
  })

  it('uses the handle when the account has no display name', async () => {
    const dana = await world.network.addAccount({ handle: 'dana.test' })
    await signIn(dana.did)
    const { doc } = await renderPage(await SessionFooter())
    expect(text(doc.querySelector('strong'))).toBe('@dana.test')
  })
})

describe('AuthStatus', () => {
  it('shows the sign-in form to a signed-out visitor, returning to the page', async () => {
    const { doc } = await renderPage(
      await AuthStatus({ returnTo: '/event/x/y' })
    )
    expect(hidden(doc.querySelector('form[action="/oauth/login"]')!).next).toBe(
      '/event/x/y'
    )
    expect(doc.querySelector('[role=status]')).toBeNull()
  })

  it('shows nothing to a signed-in visitor', async () => {
    await signIn(alice.did)
    expect(await AuthStatus()).toBeNull()
  })

  it('explains an expired sign-in and still offers the form', async () => {
    await signInWithExpiredSession(alice.did)
    const { doc } = await renderPage(
      await AuthStatus({ expired: true, returnTo: '/e' })
    )
    expect(text(doc.querySelector('[role=status]'))).toContain(
      'Your sign-in has expired'
    )
    expect(doc.querySelector('form[action="/oauth/login"]')).not.toBeNull()
  })
})

describe('RsvpControl', () => {
  const control = () =>
    RsvpControl({
      eventUri: event.uri,
      eventCid: event.cid,
      returnTo: '/event/x/y',
    })

  it('asks a signed-out visitor to sign in, without an expiry note', async () => {
    const { doc } = await renderPage(await control())
    expect(doc.querySelector('form[action="/oauth/login"]')).not.toBeNull()
    expect(doc.querySelector('[role=status]')).toBeNull()
  })

  it('says so when the cookie has no working session behind it', async () => {
    await signInWithExpiredSession(bob.did)
    const { doc } = await renderPage(await control())
    expect(doc.querySelector('[role=status]')).not.toBeNull()
    expect(doc.querySelector('button[name=status]')).toBeNull()
  })

  it('shows the current response, with no invitation attached', async () => {
    await seedRsvp(carol, event, 'going')
    await signIn(carol.did)
    const { doc } = await renderPage(await control())
    expect(pressed(doc)).toEqual(['✓ Going'])
    expect(hidden(doc)).not.toHaveProperty('invitationUri')
  })
})

describe('InviteToEvent', () => {
  it('is hidden from signed-out visitors', async () => {
    expect(
      await InviteToEvent({ eventUri: event.uri, returnTo: '/event/x/y' })
    ).toBeNull()
  })

  it('posts to the invitation action, remembering the event and page', async () => {
    await signIn(carol.did)
    const { doc } = await renderPage(
      await InviteToEvent({ eventUri: event.uri, returnTo: '/event/x/y' })
    )
    expect(hidden(doc)).toMatchObject({
      eventUri: event.uri,
      returnTo: '/event/x/y',
    })
    expect(doc.querySelector('[role=alert]')).toBeNull()
  })

  it('shows a known error and ignores an unknown one', async () => {
    await signIn(carol.did)
    const known = await renderPage(
      await InviteToEvent({
        eventUri: event.uri,
        returnTo: '/e',
        error: 'auth',
      })
    )
    expect(known.doc.querySelector('[role=alert]')).not.toBeNull()
    const unknown = await renderPage(
      await InviteToEvent({
        eventUri: event.uri,
        returnTo: '/e',
        error: 'bogus',
      })
    )
    expect(unknown.doc.querySelector('[role=alert]')).toBeNull()
  })
})

describe('YourInvitations', () => {
  it('is absent when signed out', async () => {
    expect(await YourInvitations()).toBeNull()
  })

  it('shows an empty state with the create link', async () => {
    await signIn(carol.did)
    const { doc } = await renderPage(await YourInvitations())
    expect(text(doc.querySelector('h2'))).toBe('Your invitations')
    expect(doc.querySelector('a[href="/invitation/new"]')).not.toBeNull()
    expect(text(doc.body)).toContain(
      'haven’t created or received any invitations yet'
    )
  })

  it('lists invitations with event, recipient, edit and delete', async () => {
    await signIn(alice.did)
    const { doc } = await renderPage(await YourInvitations())
    const row = doc.querySelector('li')!
    expect(text(row.querySelector('a'))).toBe('Potluck')
    expect(row.querySelector('a')!.getAttribute('href')).toBe(
      `/invitation/${alice.did}/${invitation.rkey}`
    )
    expect(text(row)).toContain('For Bob')
    const created = row.querySelector('time')!
    expect(created.getAttribute('dateTime')).toBe(
      (
        world.network.get(alice.did, INVITATION, invitation.rkey)!.value as {
          createdAt: string
        }
      ).createdAt
    )
    expect(text(created)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    expect(
      row.querySelector(`a[href$="/${invitation.rkey}/edit"]`)
    ).not.toBeNull()
    expect(hidden(row).rkey).toBe(invitation.rkey)
    expect(
      row.querySelector('[data-message]')!.getAttribute('data-message')
    ).toMatch(/Delete this invitation/)
  })

  it('shows the recipient’s response once they have RSVPed', async () => {
    await seedRsvp(bob, event, 'going')
    await signIn(alice.did)
    const { doc } = await renderPage(await YourInvitations())
    expect(text(doc.querySelector('li span:last-child'))).toBe('Going')
  })

  it('lists invitations sent to you, with who they are from and no way to edit them', async () => {
    await seedRsvp(bob, event, 'interested')
    await signIn(bob.did)
    const { doc } = await renderPage(await YourInvitations())
    const rows = [...doc.querySelectorAll('li')]
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(text(row.querySelector('a'))).toBe('Potluck')
    expect(row.querySelector('a')!.getAttribute('href')).toBe(
      `/invitation/${alice.did}/${invitation.rkey}`
    )
    expect(text(row)).toContain('From Alice')
    expect(text(row)).not.toContain('For ')
    expect(text(row)).toContain('Interested')
    expect(row.querySelector('a[href$="/edit"]')).toBeNull()
    expect(row.querySelector('form')).toBeNull()
  })

  it('lists invitations you sent and received together, newest first, each once', async () => {
    const later = await seedEvent(carol, { name: 'Carol’s party' })
    await seedInvitation(carol, later, alice)
    // one addressed to yourself is not listed twice
    await seedInvitation(alice, later, alice)
    await signIn(alice.did)
    const { doc } = await renderPage(await YourInvitations())
    expect(
      [...doc.querySelectorAll('li')].map((li) => [
        text(li.querySelector('a')),
        text(li.querySelector('p span')),
        !!li.querySelector('a[href$="/edit"]'),
      ])
    ).toEqual([
      ['Carol’s party', 'For Alice', true],
      ['Carol’s party', 'From Carol', false],
      ['Potluck', 'For Bob', true],
    ])
  })

  it('does not list invitations that are neither from nor to you', async () => {
    await signIn(carol.did)
    const { doc } = await renderPage(await YourInvitations())
    expect(doc.querySelector('li')).toBeNull()
  })

  it('marks an invitation whose event is gone', async () => {
    await world.network.delete(
      alice.did,
      'community.lexicon.calendar.event',
      event.rkey
    )
    await signIn(alice.did)
    const { doc } = await renderPage(await YourInvitations())
    expect(text(doc.querySelector('li a'))).toBe('Event unavailable')
  })
})

describe('invitation page', () => {
  const page = (repo = alice.did, rkey = invitation.rkey) =>
    renderPage(InvitationPage(pageProps({ repo, rkey }) as never))

  it('shows the event, recipient and message to a visitor', async () => {
    const inv = await seedInvitation(alice, event, bob, {
      description: { text: { markdown: 'Bring a dish!' } },
    })
    const { doc, is404 } = await page(alice.did, inv.rkey)
    expect(is404).toBe(false)
    expect(text(doc.body)).toContain('Invitation for Bob')
    expect(text(doc.querySelector('h1'))).toBe('Potluck')
    expect(text(doc.body)).toContain('Bring a dish!')
    expect(doc.querySelector('[role=note]')).toBeNull()
  })

  it('works with a handle in the URL', async () => {
    const { doc, is404 } = await page('alice.test')
    expect(is404).toBe(false)
    expect(text(doc.querySelector('h1'))).toBe('Potluck')
  })

  it('shows the author a preview banner and no RSVP buttons', async () => {
    await signIn(alice.did)
    const { doc } = await page()
    expect(text(doc.querySelector('[role=note]'))).toContain(
      'preview of your invitation to Bob'
    )
    expect(doc.querySelector('button[name=status]')).toBeNull()
  })

  it('shows the recipient the RSVP buttons', async () => {
    await signIn(bob.did)
    const { doc } = await page()
    expect(doc.querySelectorAll('button[name=status]')).toHaveLength(3)
  })

  it.each([
    ['an unknown invitation', () => [alice.did, 'nope']],
    ['an unknown account', () => ['nobody.test', 'nope']],
  ])('is a 404 for %s', async (_name, args) => {
    const [repo, rkey] = args()
    expect((await page(repo, rkey)).is404).toBe(true)
  })

  it('is a 404 when the event was deleted', async () => {
    await world.network.delete(
      alice.did,
      'community.lexicon.calendar.event',
      event.rkey
    )
    expect((await page()).is404).toBe(true)
  })
})
