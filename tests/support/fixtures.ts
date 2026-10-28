import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'
import { parseHTML } from 'linkedom'
import type { ReactNode } from 'react'

import { upsertRecord } from '@/lib/atproto/records'

import type { FakeAccount } from './fake-atproto'
import { world } from './world'

export const EVENT = 'community.lexicon.calendar.event'
export const RSVP = 'community.lexicon.calendar.rsvp'
export const INVITATION = 'us.polhem.invite.invitation'

export type Ref = { uri: string; cid: string; rkey: string }

const DAY = 24 * 60 * 60 * 1000
export const daysFromNow = (n: number) =>
  new Date(Date.now() + n * DAY).toISOString()

export function eventRecord(over: Record<string, unknown> = {}) {
  return {
    $type: EVENT,
    name: 'Potluck',
    startsAt: daysFromNow(10),
    mode: `${EVENT}#inperson`,
    status: `${EVENT}#scheduled`,
    createdAt: daysFromNow(-1),
    ...over,
  }
}

/** Put an event in an account's repo on the fake PDS */
export function seedEvent(
  owner: FakeAccount,
  over: Record<string, unknown> = {}
): Promise<Ref> {
  return world.network.create(owner.did, EVENT, eventRecord(over))
}

/** Put an RSVP in an account's repo, answering `event` */
export function seedRsvp(
  who: FakeAccount,
  event: Ref,
  status: 'going' | 'interested' | 'notgoing',
  over: Record<string, unknown> = {}
): Promise<Ref> {
  return world.network.create(who.did, RSVP, {
    $type: RSVP,
    subject: { uri: event.uri, cid: event.cid },
    status: `${RSVP}#${status}`,
    ...over,
  })
}

/** Put an invitation in the inviter's repo, and (like the app does) in the database */
export async function seedInvitation(
  inviter: FakeAccount,
  event: Ref,
  recipient: FakeAccount,
  over: Record<string, unknown> = {}
): Promise<Ref> {
  const value = {
    $type: INVITATION,
    subject: { uri: event.uri, cid: event.cid },
    recipient: recipient.did,
    createdAt: daysFromNow(-1),
    ...over,
  }
  const ref = await world.network.create(inviter.did, INVITATION, value)
  await upsertRecord(ref.uri, ref.cid, value)
  return ref
}

/** Render an element to HTML and parse it, so specs can query it like a page */
export function render(element: ReactNode) {
  const html = renderToStaticMarkup(element as never)
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document
}

export const text = (node: { textContent: string | null } | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim()

/**
 * Render a whole page (async server components, Suspense and all) once
 * everything it needs has loaded, as a visitor would see it. `errors` are what
 * the page threw while rendering: a `notFound()` shows up here, as a 404.
 */
export async function renderPage(element: ReactNode) {
  const errors: { digest?: string }[] = []
  const stream = await renderToReadableStream(element as never, {
    onError: (error) => void errors.push(error as { digest?: string }),
  })
  await stream.allReady
  const html = await new Response(stream).text()
  const doc = parseHTML(
    `<!doctype html><html><body>${html}</body></html>`
  ).document
  return {
    doc,
    errors,
    is404: errors.some((e) => e.digest === 'NEXT_HTTP_ERROR_FALLBACK;404'),
  }
}

/** Props as Next passes them to a page: params and searchParams are promises */
export const pageProps = (
  params: Record<string, string> = {},
  searchParams: Record<string, string> = {}
) =>
  ({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  }) as never
